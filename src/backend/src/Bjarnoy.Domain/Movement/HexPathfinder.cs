using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Movement;

/// <summary>
/// A* pathfinding for land armies and fleets over the hex grid (issue #40
/// phases 2 and 6).
/// </summary>
/// <remarks>
/// <para>
/// Stateless: every call takes its own <c>terrainAt</c> delegate and returns a
/// fresh result, so it needs no database and no map object to be unit tested —
/// a hand-built <c>Dictionary&lt;HexCoord, Terrain&gt;</c> behind a lambda is
/// enough.
/// </para>
/// <para>
/// One search loop, two terrain-cost tables (<see cref="LandTerrainCost"/>/
/// <see cref="SeaTerrainCost"/>), picked by <paramref name="isLandUnit"/> — a
/// land army finds every sea hex impassable and vice versa, so "land-only" and
/// "sea-only" fall out of the same lookup-and-reject shape rather than needing
/// two copies of the A* loop.
/// </para>
/// </remarks>
public static class HexPathfinder
{
    /// <summary>
    /// Per-hex-step cost multiplier by terrain for land units.
    /// <see cref="Terrain.Sea"/> is deliberately absent — it is impassable to
    /// land armies. Every value is &gt;= 1.0, which is what keeps
    /// <see cref="Heuristic"/> (plain hex distance) admissible: it can never
    /// overestimate the true cost of a step.
    /// </summary>
    private static readonly IReadOnlyDictionary<Terrain, double> LandTerrainCost = new Dictionary<Terrain, double>
    {
        [Terrain.Grass] = 1.0,
        [Terrain.Sand] = 1.1,
        [Terrain.Forest] = 1.3,
        [Terrain.Mountain] = 2.0,
    };

    /// <summary>
    /// Per-hex-step cost multiplier by terrain for fleets. Every land terrain
    /// is deliberately absent — it is impassable to ships; no docking/beaching
    /// mechanic exists yet (issue #40 design doc defers ferrying land troops
    /// by ship entirely). <see cref="Terrain.Sea"/> costs a flat 1.0 — the
    /// design doc calls for no varying sea terrain (no currents/storm tiles),
    /// so there is nothing to differentiate open water by.
    /// </summary>
    private static readonly IReadOnlyDictionary<Terrain, double> SeaTerrainCost = new Dictionary<Terrain, double>
    {
        [Terrain.Sea] = 1.0,
    };

    /// <summary>The terrain-cost table this phase's isLandUnit flag selects.</summary>
    private static IReadOnlyDictionary<Terrain, double> CostTable(bool isLandUnit) =>
        isLandUnit ? LandTerrainCost : SeaTerrainCost;

    /// <summary>
    /// <see cref="LandTerrainCost"/>, keyed by <see cref="TerrainExtensions.ToWireName"/>
    /// instead of the enum, so the API contract (issue #159 part B — the
    /// client-side range tint) can project the real cost table instead of a
    /// hand-copied literal the frontend would have to keep in sync by hand.
    /// </summary>
    public static IReadOnlyDictionary<string, double> LandTerrainCostByName { get; } =
        LandTerrainCost.ToDictionary(kv => kv.Key.ToWireName(), kv => kv.Value);

    /// <summary>Same as <see cref="LandTerrainCostByName"/>, for <see cref="SeaTerrainCost"/>.</summary>
    public static IReadOnlyDictionary<string, double> SeaTerrainCostByName { get; } =
        SeaTerrainCost.ToDictionary(kv => kv.Key.ToWireName(), kv => kv.Value);

    /// <summary>
    /// Flat penalty charged, on top of terrain cost, for entering a river hex
    /// (issue #159 part A). Twice the median generated river's length and
    /// above the median detour-preferring penalty measured across 40 worlds
    /// at default <c>WorldGenerationOptions</c> — see the issue for the full
    /// table. Troops route around a river at roughly 63% of river tiles;
    /// crossing is never refused outright, only made expensive, so a river
    /// can never make a route impossible.
    /// </summary>
    /// <remarks>
    /// Charged additively on entry only — never on exit, and never as a
    /// separate edge-crossing charge — which is what keeps
    /// stopping/restarting a march mid-river from ever paying the penalty
    /// twice or dodging it altogether (see the issue's "why additive-on-entry"
    /// section). It also keeps every step cost &gt;= 1.0, so <see cref="Heuristic"/>
    /// stays admissible and consistent.
    /// </remarks>
    public const double RiverCrossingCost = 8.0;

    /// <summary>
    /// Hard cap on nodes a single search may expand. A world is unbounded, so
    /// without this, "no route exists" (e.g. an island cut off by sea) would
    /// otherwise search forever outward looking for one. Combined with the
    /// bounding box in <see cref="FindPath"/>, this is a belt-and-braces
    /// bound, not the primary defence — a plausible in-game dispatch is at
    /// most a few hundred hexes.
    /// </summary>
    private const int MaxExpandedNodes = 20_000;

    /// <summary>
    /// Finds the cheapest route from <paramref name="from"/> to
    /// <paramref name="to"/>, or <see langword="null"/> if none exists (e.g.
    /// the only route crosses sea, or the search exhausts its budget).
    /// </summary>
    /// <param name="terrainAt">
    /// Pure terrain lookup — in production, <c>TerrainSampler.TerrainAt</c>;
    /// in tests, a small hand-built grid.
    /// </param>
    /// <param name="isLandUnit">
    /// <see langword="true"/> for a land army — <see cref="Terrain.Sea"/> is
    /// impassable and every land terrain costs per <see cref="LandTerrainCost"/>.
    /// A land army's own <paramref name="from"/>/<paramref name="to"/> must
    /// themselves be land (a settlement's own hex always is, so this never
    /// actually rejects a land army's own endpoints — it exists so an
    /// arbitrary <see cref="Armies.ArmyMission.Move"/> sea destination is
    /// still rejected outright rather than searched for).
    /// <see langword="false"/> for a fleet — every land terrain is impassable
    /// and <see cref="Terrain.Sea"/> costs a flat 1.0 per <see cref="SeaTerrainCost"/>,
    /// <em>except</em> at the two endpoints: a settlement's own hex is always
    /// land, even a coastal one's, so a fleet's <paramref name="from"/>
    /// (its home harbor) and <paramref name="to"/> (an
    /// <see cref="Armies.ArmyMission.Attack"/>/<see cref="Armies.ArmyMission.Support"/>
    /// target's centre) are exempt from the sea-only rule — the search still
    /// requires every hex in between to be real open sea, so a fleet with no
    /// adjacent sea at all (impossible in practice — issue #40 phase 6 §4
    /// requires a coastal settlement to train ships in the first place) or a
    /// target with no shoreline hex to beach on (see
    /// <see cref="World.Shoreline"/>) still fails to find a route.
    /// </param>
    /// <param name="isRiver">
    /// Optional river-tile lookup (issue #159 part A) — a land unit's step
    /// cost onto a hex this returns <see langword="true"/> for is charged an
    /// extra <see cref="RiverCrossingCost"/>. <see langword="null"/> (the
    /// default) prices no hex as a river, matching every caller from before
    /// rivers existed. Ignored for a fleet: river tiles are land terrain,
    /// already impassable to ships regardless of this predicate.
    /// </param>
    public static IReadOnlyList<HexCoord>? FindPath(
        HexCoord from, HexCoord to, Func<HexCoord, Terrain> terrainAt, bool isLandUnit,
        Func<HexCoord, bool>? isRiver = null)
    {
        ArgumentNullException.ThrowIfNull(terrainAt);

        var costTable = CostTable(isLandUnit);

        // Land keeps its original hard endpoint check (byte-for-byte, issue
        // #40 phase 6): a land army's destination/origin must themselves be
        // land, so an arbitrary sea Move destination is rejected outright. A
        // fleet skips this — see the isLandUnit remarks above for why its own
        // endpoints are deliberately exempt from the sea-only rule.
        if (isLandUnit && (!costTable.ContainsKey(terrainAt(from)) || !costTable.ContainsKey(terrainAt(to))))
        {
            return null;
        }

        if (from == to)
        {
            return [from];
        }

        // A bounding box around the two endpoints, padded generously — the
        // primary guard against a pathological unreachable-goal search (see
        // MaxExpandedNodes' remarks).
        var padding = Math.Max(10, from.DistanceTo(to));
        var qMin = Math.Min(from.Q, to.Q) - padding;
        var qMax = Math.Max(from.Q, to.Q) + padding;
        var rMin = Math.Min(from.R, to.R) - padding;
        var rMax = Math.Max(from.R, to.R) + padding;

        bool InBounds(HexCoord c) => c.Q >= qMin && c.Q <= qMax && c.R >= rMin && c.R <= rMax;

        var open = new PriorityQueue<HexCoord, double>();
        var gScore = new Dictionary<HexCoord, double> { [from] = 0 };
        var cameFrom = new Dictionary<HexCoord, HexCoord>();
        var closed = new HashSet<HexCoord>();

        open.Enqueue(from, Heuristic(from, to));
        var expanded = 0;

        while (open.TryDequeue(out var current, out _))
        {
            if (!closed.Add(current))
            {
                continue;
            }

            if (current == to)
            {
                return Reconstruct(cameFrom, current);
            }

            if (++expanded > MaxExpandedNodes)
            {
                return null;
            }

            foreach (var neighbour in current.Neighbours())
            {
                if (!InBounds(neighbour) || closed.Contains(neighbour))
                {
                    continue;
                }

                // The final hop onto the goal is always allowed for a fleet
                // even when the goal itself is land (a beaching/harbor hex —
                // see the isLandUnit remarks above); every other hex still
                // has to pass the ordinary cost-table check.
                double stepCost;
                if (!isLandUnit && neighbour == to)
                {
                    stepCost = costTable.TryGetValue(terrainAt(neighbour), out var seaCost) ? seaCost : 1.0;
                }
                else if (!costTable.TryGetValue(terrainAt(neighbour), out stepCost))
                {
                    continue;
                }

                if (isLandUnit && isRiver is not null && isRiver(neighbour))
                {
                    stepCost += RiverCrossingCost;
                }

                var tentativeG = gScore[current] + stepCost;
                if (gScore.TryGetValue(neighbour, out var existingG) && tentativeG >= existingG)
                {
                    continue;
                }

                gScore[neighbour] = tentativeG;
                cameFrom[neighbour] = current;
                open.Enqueue(neighbour, tentativeG + Heuristic(neighbour, to));
            }
        }

        return null;
    }

    /// <summary>
    /// Plain hex distance. Admissible because every real step costs at least
    /// 1.0 (grass or sea, the cheapest terrain either table has) — see
    /// <see cref="LandTerrainCost"/>/<see cref="SeaTerrainCost"/> — so
    /// distance never overestimates the cheapest possible route.
    /// </summary>
    private static double Heuristic(HexCoord a, HexCoord b) => a.DistanceTo(b);

    private static IReadOnlyList<HexCoord> Reconstruct(Dictionary<HexCoord, HexCoord> cameFrom, HexCoord current)
    {
        var path = new List<HexCoord> { current };
        while (cameFrom.TryGetValue(current, out var previous))
        {
            current = previous;
            path.Add(current);
        }

        path.Reverse();
        return path;
    }

    /// <summary>
    /// Cumulative game-hours to reach each hex of <paramref name="path"/> from
    /// <c>path[0]</c> (always 0), travelling at <paramref name="hexesPerHour"/>
    /// (an army's <see cref="Armies.Army.TotalSpeed"/>) scaled by
    /// <paramref name="speedFactor"/> (the world's speed multiplier).
    /// </summary>
    /// <param name="isLandUnit">
    /// Which terrain-cost table to charge each step against — must match
    /// whatever <see cref="FindPath"/> call produced <paramref name="path"/>.
    /// Defaults to <see langword="true"/> (land), matching this method's
    /// signature before fleets existed (issue #40 phase 6).
    /// </param>
    /// <param name="speedFactor">
    /// The world's speed multiplier — mirrors how build/training durations
    /// are scaled in <see cref="Buildings.Settlement.PlanBuild"/>. Defaults to
    /// <c>1.0</c> (no scaling) for callers that have no world in hand.
    /// </param>
    /// <remarks>
    /// Reuses the exact per-terrain cost table (<see cref="LandTerrainCost"/>
    /// or <see cref="SeaTerrainCost"/>) <see cref="FindPath"/> costs its edges
    /// with, so a route that prefers cheaper terrain over shorter raw distance
    /// reports the travel time that terrain actually costs, not a plain
    /// distance/speed estimate.
    /// </remarks>
    /// <param name="isRiver">
    /// Same river-tile lookup <see cref="FindPath"/> takes — must match
    /// whatever call produced <paramref name="path"/>, or the reported hours
    /// silently disagree with the route that was actually chosen (see
    /// <see cref="RiverCrossingCost"/>'s remarks on why both sides have to
    /// agree). <see langword="null"/> (the default) charges no river penalty.
    /// </param>
    public static IReadOnlyList<double> CumulativeHours(
        IReadOnlyList<HexCoord> path, Func<HexCoord, Terrain> terrainAt, double hexesPerHour, bool isLandUnit = true,
        double speedFactor = 1.0, Func<HexCoord, bool>? isRiver = null)
    {
        ArgumentNullException.ThrowIfNull(path);
        ArgumentNullException.ThrowIfNull(terrainAt);
        if (path.Count == 0)
        {
            throw new ArgumentException("A path must have at least one hex.", nameof(path));
        }

        if (hexesPerHour <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(hexesPerHour), hexesPerHour, "Speed must be positive.");
        }

        if (speedFactor <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(speedFactor), speedFactor, "Speed factor must be positive.");
        }

        var costTable = CostTable(isLandUnit);
        var effectiveHexesPerHour = hexesPerHour * speedFactor;
        var hours = new double[path.Count];
        for (var i = 1; i < path.Count; i++)
        {
            // Mirrors FindPath's own beaching/harbor exemption: a fleet's
            // very last hex (an Attack/Support target's or its own home
            // settlement's land centre — see FindPath's isLandUnit remarks)
            // charges the same flat fallback cost FindPath itself used to
            // reach it, rather than the double.PositiveInfinity every other
            // impassable hex gets.
            var stepCost = costTable.TryGetValue(terrainAt(path[i]), out var cost)
                ? cost
                : !isLandUnit && i == path.Count - 1 ? 1.0 : double.PositiveInfinity;

            if (isLandUnit && isRiver is not null && isRiver(path[i]))
            {
                stepCost += RiverCrossingCost;
            }

            hours[i] = hours[i - 1] + (stepCost / effectiveHexesPerHour);
        }

        return hours;
    }
}
