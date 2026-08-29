using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Movement;

/// <summary>
/// A* pathfinding for land armies over the hex grid (issue #40 phase 2).
/// </summary>
/// <remarks>
/// <para>
/// Stateless: every call takes its own <c>terrainAt</c> delegate and returns a
/// fresh result, so it needs no database and no map object to be unit tested —
/// a hand-built <c>Dictionary&lt;HexCoord, Terrain&gt;</c> behind a lambda is
/// enough.
/// </para>
/// <para>
/// Land-only this phase: <see cref="Terrain.Sea"/> has no entry in
/// <see cref="TerrainCost"/> and is therefore always impassable. Ship/fleet
/// pathing is issue #40 phase 6.
/// </para>
/// </remarks>
public static class HexPathfinder
{
    /// <summary>
    /// Per-hex-step cost multiplier by terrain. <see cref="Terrain.Sea"/> is
    /// deliberately absent — it is impassable to this land-only pathfinder.
    /// Every value is &gt;= 1.0, which is what keeps <see cref="Heuristic"/>
    /// (plain hex distance) admissible: it can never overestimate the true
    /// cost of a step.
    /// </summary>
    private static readonly IReadOnlyDictionary<Terrain, double> TerrainCost = new Dictionary<Terrain, double>
    {
        [Terrain.Grass] = 1.0,
        [Terrain.Sand] = 1.1,
        [Terrain.Forest] = 1.3,
        [Terrain.Mountain] = 2.0,
    };

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
    /// Always <see langword="true"/> this phase — sea pathing for ships
    /// (issue #40 phase 6) is not implemented, and passing
    /// <see langword="false"/> throws rather than silently behaving like a
    /// land unit.
    /// </param>
    public static IReadOnlyList<HexCoord>? FindPath(
        HexCoord from, HexCoord to, Func<HexCoord, Terrain> terrainAt, bool isLandUnit)
    {
        ArgumentNullException.ThrowIfNull(terrainAt);

        if (!isLandUnit)
        {
            throw new NotSupportedException(
                "Sea pathing is not implemented this phase — land armies only (issue #40 phase 2; ships are phase 6).");
        }

        if (!terrainAt(from).IsLand() || !terrainAt(to).IsLand())
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
                if (!InBounds(neighbour) || closed.Contains(neighbour)
                    || !TerrainCost.TryGetValue(terrainAt(neighbour), out var stepCost))
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
    /// 1.0 (grass, the cheapest terrain) — see <see cref="TerrainCost"/> —
    /// so distance never overestimates the cheapest possible route.
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
    /// (an army's <see cref="Armies.Army.TotalSpeed"/>).
    /// </summary>
    /// <remarks>
    /// Reuses the exact per-terrain <see cref="TerrainCost"/> table
    /// <see cref="FindPath"/> costs its edges with, so a route that prefers
    /// cheaper terrain over shorter raw distance reports the travel time that
    /// terrain actually costs, not a plain distance/speed estimate.
    /// </remarks>
    public static IReadOnlyList<double> CumulativeHours(
        IReadOnlyList<HexCoord> path, Func<HexCoord, Terrain> terrainAt, double hexesPerHour)
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

        var hours = new double[path.Count];
        for (var i = 1; i < path.Count; i++)
        {
            var stepCost = TerrainCost.TryGetValue(terrainAt(path[i]), out var cost) ? cost : double.PositiveInfinity;
            hours[i] = hours[i - 1] + (stepCost / hexesPerHour);
        }

        return hours;
    }
}
