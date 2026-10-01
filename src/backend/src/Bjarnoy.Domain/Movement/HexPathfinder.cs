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
    /// <remarks>
    /// <see cref="Terrain.Mountain"/> is still listed (it is a land terrain, so an army may
    /// stand on one, and the wire contract projects this table) but a land army can no longer
    /// <em>enter</em> one: <see cref="FindPath"/> and <see cref="CumulativeHours"/> reject a
    /// mountain hex unless it carries a crossable river tile (a stream), which costs a flat
    /// <c>1.0 + <see cref="RiverCrossingCost"/></c> whatever lies under it.
    /// </remarks>
    private static readonly IReadOnlyDictionary<Terrain, double> LandTerrainCost = new Dictionary<Terrain, double>
    {
        [Terrain.Grass] = 1.0,
        [Terrain.Sand] = 1.1,
        [Terrain.Forest] = 1.3,
        [Terrain.Mountain] = 2.0,

        // Bogland: twice grass. A Lake is deliberately absent (impassable to armies and ships).
        [Terrain.Bog] = 2.0,
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
    /// Flat cost of crossing a stream, on top of the base 1.0 step: a land army entering a
    /// crossable river hex (one that is not a wide river — see <c>RiverGenerator.IsWideRiver</c>) pays
    /// <c>1.0 + RiverCrossingCost</c> whatever terrain lies under it, instead of the terrain
    /// cost plus this penalty (issue #159 part A set the penalty; the movement rules made wide
    /// rivers and mountains impassable and the stream cost flat). Twice the median generated
    /// river's length and above the median detour-preferring penalty measured across 40 worlds
    /// at default <c>WorldGenerationOptions</c> — see the issue for the full table. Troops
    /// route around a stream at roughly 63% of river tiles.
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
    /// What a land army pays to enter a palisade hex that is half open (a land end of a wall that touches no mountain or wide river), in
    /// place of its terrain cost: passable for every army at this flat cost (<c>docs/design/economy.md</c> section 5). Above every
    /// terrain cost but the stream's, so an open way round is preferred over wading through the gap.
    /// </summary>
    public const double HalfOpenEndCost = 3.0;

    /// <summary>
    /// What a land army pays to enter a hex, or <see langword="null"/> if it cannot: the single
    /// rule both <see cref="FindPath"/> and <see cref="CumulativeHours"/> price a step with, in the same precedence as the frontend's
    /// <c>stepCost</c> (hexPath.ts): sea and lakes are not in the cost table; a wide river is impassable; a stream is a flat
    /// <c>1.0 + <see cref="RiverCrossingCost"/></c> over any land terrain (mountain included); a plain mountain is impassable; a
    /// <paramref name="halfOpen"/> palisade end costs <see cref="HalfOpenEndCost"/>; a <paramref name="blocked"/> hex (a palisade) is
    /// impassable unless <paramref name="friendlyGate"/> holds for it; anything else costs its terrain.
    /// </summary>
    private static double? LandStepCost(
        HexCoord hex, Func<HexCoord, Terrain> terrainAt, Func<HexCoord, bool>? isRiver,
        Func<HexCoord, bool>? isWideRiver, Func<HexCoord, bool>? blocked,
        Func<HexCoord, bool>? friendlyGate = null, Func<HexCoord, bool>? halfOpen = null)
    {
        var terrain = terrainAt(hex);
        if (!LandTerrainCost.TryGetValue(terrain, out var cost))
        {
            return null;
        }

        var river = isRiver is not null && isRiver(hex);
        if (river)
        {
            if (isWideRiver is not null && isWideRiver(hex))
            {
                return null;
            }

            return 1.0 + RiverCrossingCost;
        }

        if (terrain == Terrain.Mountain)
        {
            return null;
        }

        if (halfOpen is not null && halfOpen(hex))
        {
            return HalfOpenEndCost;
        }

        if (blocked is not null && blocked(hex) && !(friendlyGate is not null && friendlyGate(hex)))
        {
            return null;
        }

        return cost;
    }

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
    /// onto a hex this returns <see langword="true"/> for costs a flat
    /// <c>1.0 + <see cref="RiverCrossingCost"/></c> whatever terrain lies under it,
    /// unless <paramref name="isWideRiver"/> also holds (then it is impassable).
    /// <see langword="null"/> (the default) prices no hex as a river. Ignored
    /// for a fleet: river tiles are land terrain, already impassable to ships
    /// regardless of this predicate.
    /// </param>
    /// <param name="isWideRiver">
    /// Which river hexes are wide (<c>RiverIndex.IsWide</c>) and so impassable to a land
    /// army. Only consulted for hexes <paramref name="isRiver"/> accepts. <see langword="null"/>
    /// (the default) treats every river hex as a crossable stream.
    /// </param>
    /// <param name="blocked">
    /// Optional extra impassable hexes for a land army (every palisade hex, see <see cref="PalisadeIndex"/>).
    /// <see langword="null"/> (the default) blocks nothing. Never applied to the start hex or to a fleet.
    /// </param>
    /// <param name="friendlyGate">
    /// Optional: a <paramref name="blocked"/> hex this army may pass anyway at its normal terrain cost (a gate of the army's own owner).
    /// <see langword="null"/> (the default) lets nothing through.
    /// </param>
    /// <param name="halfOpen">
    /// Optional: hexes any army may enter at <see cref="HalfOpenEndCost"/> instead of their terrain cost (a palisade's half-open land
    /// end); <paramref name="blocked"/> is not consulted for them. <see langword="null"/> (the default) means none.
    /// </param>
    /// <returns>
    /// The route, or <see langword="null"/> when there is none — which, for a land army, now
    /// includes a target walled in by mountains or wide rivers.
    /// </returns>
    public static IReadOnlyList<HexCoord>? FindPath(
        HexCoord from, HexCoord to, Func<HexCoord, Terrain> terrainAt, bool isLandUnit,
        Func<HexCoord, bool>? isRiver = null, Func<HexCoord, bool>? isWideRiver = null,
        Func<HexCoord, bool>? blocked = null, Func<HexCoord, bool>? friendlyGate = null,
        Func<HexCoord, bool>? halfOpen = null)
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
                if (isLandUnit)
                {
                    if (LandStepCost(neighbour, terrainAt, isRiver, isWideRiver, blocked, friendlyGate, halfOpen) is not { } landCost)
                    {
                        continue;
                    }

                    stepCost = landCost;
                }
                else if (neighbour == to)
                {
                    stepCost = costTable.TryGetValue(terrainAt(neighbour), out var seaCost) ? seaCost : 1.0;
                }
                else if (!costTable.TryGetValue(terrainAt(neighbour), out stepCost))
                {
                    continue;
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
    /// agree). <see langword="null"/> (the default) charges no river cost.
    /// </param>
    /// <param name="isWideRiver">
    /// Same wide-river lookup <see cref="FindPath"/> takes. A path hex it rejects (a wide river
    /// or a mountain with no stream, which only a path stored before the movement rules can
    /// contain) is charged <see cref="double.PositiveInfinity"/>, like any other impassable hex.
    /// </param>
    /// <param name="blocked">Same palisade lookups <see cref="FindPath"/> takes (<paramref name="blocked"/>, <paramref name="friendlyGate"/>, <paramref name="halfOpen"/>): a half-open end is charged <see cref="HalfOpenEndCost"/>, so the hours match the route that was chosen.</param>
    /// <param name="friendlyGate">See <paramref name="blocked"/>.</param>
    /// <param name="halfOpen">See <paramref name="blocked"/>.</param>
    public static IReadOnlyList<double> CumulativeHours(
        IReadOnlyList<HexCoord> path, Func<HexCoord, Terrain> terrainAt, double hexesPerHour, bool isLandUnit = true,
        double speedFactor = 1.0, Func<HexCoord, bool>? isRiver = null, Func<HexCoord, bool>? isWideRiver = null,
        Func<HexCoord, bool>? blocked = null, Func<HexCoord, bool>? friendlyGate = null, Func<HexCoord, bool>? halfOpen = null)
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
            double stepCost;
            if (isLandUnit)
            {
                stepCost = LandStepCost(path[i], terrainAt, isRiver, isWideRiver, blocked, friendlyGate, halfOpen) ?? double.PositiveInfinity;
            }
            else
            {
                stepCost = costTable.TryGetValue(terrainAt(path[i]), out var cost)
                    ? cost
                    : i == path.Count - 1 ? 1.0 : double.PositiveInfinity;
            }

            hours[i] = hours[i - 1] + (stepCost / effectiveHexesPerHour);
        }

        return hours;
    }
}
