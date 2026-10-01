namespace Bjarnoy.Domain.World;

/// <summary>
/// Valley streams: a stream out of every mountain-enclosed valley of at least <see cref="ValleyMinHexes"/> hexes, so a
/// land army (which cannot cross mountains or wide rivers) can walk out of it. Mirrored bit for bit by
/// <c>carveValleyStreams</c> in <c>src/frontend/src/lib/map/riverGenerator.ts</c>; see <c>docs/design/river-generation.md</c>.
/// </summary>
internal static partial class RiverGenerator
{
    /// <summary>A walkable region cut off from the island's main one by mountains alone is given a stream out once it has this many hexes.</summary>
    public const int ValleyMinHexes = 100;

    private static bool FlowsOutAsRiver(RiverTile t) => t.Width is RiverWidth.River or RiverWidth.Widen or RiverWidth.RiverStream;

    /// <summary>
    /// Whether a river tile is a wide river, impassable to a land army: at least two of its arms are river width. An in-arm is
    /// river width when the upstream tile flows out as river (a lake or creek upstream feeds a river tile at river width), the
    /// out-arm (a mouth's sea side included) when the tile itself does.
    /// </summary>
    internal static bool IsWideRiver(RiverTile tile, Dictionary<HexCoord, RiverTile> riverAt)
    {
        var arms = 0;
        var neighbours = tile.Coord.Neighbours();
        foreach (var d in tile.InDirections)
        {
            if (riverAt.TryGetValue(neighbours[(int)d], out var up) ? FlowsOutAsRiver(up) : tile.Width == RiverWidth.River)
            {
                arms++;
            }
        }

        if ((tile.OutDirection is not null || tile.Shape == RiverTileShape.Mouth) && FlowsOutAsRiver(tile))
        {
            arms++;
        }

        return arms >= 2;
    }

    /// <summary>One island's walkable regions under the movement rules.</summary>
    private sealed class Walk
    {
        public required Dictionary<HexCoord, RiverTile> RiverAt;
        public required List<List<HexCoord>> Regions;
        public required Dictionary<HexCoord, int> RegionOf;
        public required int Main;
        public required HashSet<HexCoord> Wide;
    }

    /// <summary>A mountain hex a valley stream may run over: open (no river beside) or terminal (one joinable river beside, where it ends).</summary>
    private sealed record Usable(bool IsTerminal, HexCoord Terminal);

    /// <summary>A mountain-enclosed valley the movement rules cut off: its size and its lowest (Q, R) hex.</summary>
    internal readonly record struct ValleyCandidate(int Size, HexCoord First);

    /// <summary>The island's terrain as the movement rules see it (bogland laid over the seed's terrain), and the questions the valley pass asks of it.</summary>
    private sealed class ValleyGround
    {
        private readonly List<HexCoord> _tilesSorted;
        private readonly HashSet<HexCoord> _islandLand;
        private readonly Dictionary<HexCoord, Terrain> _land;
        private readonly Dictionary<HexCoord, BogTile> _bogByCoord = [];

        /// <summary>Hexes a new stream may not use: the bogland, and the neighbours of its water features (rule R12).</summary>
        public readonly HashSet<HexCoord> Blocked = [];

        public ValleyGround(IReadOnlyList<HexCoord> islandTiles, Dictionary<HexCoord, Terrain> land, HashSet<HexCoord> islandLand, IReadOnlyList<BogTile> bogTiles)
        {
            _tilesSorted = islandTiles.OrderBy(t => t.Q).ThenBy(t => t.R).ToList();
            _islandLand = islandLand;
            _land = land;
            foreach (var t in bogTiles)
            {
                _bogByCoord[t.Coord] = t;
                Blocked.Add(t.Coord);
                if (t.Kind != BogTileKind.Bog)
                {
                    foreach (var n in t.Coord.Neighbours())
                    {
                        Blocked.Add(n);
                    }
                }
            }
        }

        public Terrain TerrainHere(HexCoord c)
        {
            if (_bogByCoord.TryGetValue(c, out var bog))
            {
                return bog.Kind == BogTileKind.Lake ? Terrain.Lake : Terrain.Bog;
            }

            return _islandLand.Contains(c) ? _land[c] : Terrain.Sea;
        }

        public Terrain BaseTerrain(HexCoord c) => _islandLand.Contains(c) ? _land[c] : Terrain.Sea;

        public Walk Analyse(List<RiverTile> rivers)
        {
            var riverAt = new Dictionary<HexCoord, RiverTile>();
            foreach (var t in rivers)
            {
                riverAt[t.Coord] = t;
            }

            var wide = new HashSet<HexCoord>();
            foreach (var t in rivers)
            {
                if (IsWideRiver(t, riverAt))
                {
                    wide.Add(t.Coord);
                }
            }

            bool Walkable(HexCoord c)
            {
                if (riverAt.ContainsKey(c))
                {
                    return !wide.Contains(c);
                }

                var terrain = TerrainHere(c);
                return terrain is not (Terrain.Sea or Terrain.Lake or Terrain.Mountain);
            }

            var regions = new List<List<HexCoord>>();
            var regionOf = new Dictionary<HexCoord, int>();
            foreach (var tile in _tilesSorted)
            {
                if (regionOf.ContainsKey(tile) || !Walkable(tile))
                {
                    continue;
                }

                var id = regions.Count;
                var region = new List<HexCoord> { tile };
                regionOf[tile] = id;
                for (var i = 0; i < region.Count; i++)
                {
                    foreach (var n in region[i].Neighbours())
                    {
                        if (_islandLand.Contains(n) && !regionOf.ContainsKey(n) && Walkable(n))
                        {
                            regionOf[n] = id;
                            region.Add(n);
                        }
                    }
                }

                regions.Add(region);
            }

            var main = 0;
            for (var i = 1; i < regions.Count; i++)
            {
                if (regions[i].Count > regions[main].Count)
                {
                    main = i;
                }
            }

            return new Walk { RiverAt = riverAt, Regions = regions, RegionOf = regionOf, Main = main, Wide = wide };
        }

        /// <summary>Closed in by mountains alone: every non-walkable hex on the region's border is a mountain without a wide river.</summary>
        public bool MountainEnclosed(List<HexCoord> region, Walk w, int id)
        {
            foreach (var c in region)
            {
                foreach (var n in c.Neighbours())
                {
                    if (w.RegionOf.TryGetValue(n, out var rid) && rid == id)
                    {
                        continue;
                    }

                    if (!_islandLand.Contains(n) || w.Wide.Contains(n) || TerrainHere(n) != Terrain.Mountain)
                    {
                        return false;
                    }
                }
            }

            return true;
        }

        /// <summary>The cut-off valleys: regions but the largest that mountains alone close in and that have at least <see cref="ValleyMinHexes"/> hexes; largest first, then by lowest (Q, R).</summary>
        public List<ValleyCandidate> Candidates(Walk w)
        {
            var found = new List<ValleyCandidate>();
            for (var id = 0; id < w.Regions.Count; id++)
            {
                var region = w.Regions[id];
                if (id != w.Main && region.Count >= ValleyMinHexes && MountainEnclosed(region, w, id))
                {
                    found.Add(new ValleyCandidate(region.Count, region[0]));
                }
            }

            return [.. found.OrderByDescending(c => c.Size).ThenBy(c => c.First.Q).ThenBy(c => c.First.R)];
        }
    }

    /// <summary>
    /// The mountain-enclosed valleys of at least <see cref="ValleyMinHexes"/> hexes that the given rivers and bogland leave cut off
    /// from an island's main walkable region, in the order the valley pass carves them.
    /// </summary>
    internal static List<ValleyCandidate> ValleyCandidates(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land,
        IReadOnlyList<RiverTile> rivers,
        IReadOnlyList<BogTile> bogTiles)
    {
        var ground = new ValleyGround(islandTiles, land, new HashSet<HexCoord>(islandTiles), bogTiles);
        return ground.Candidates(ground.Analyse([.. rivers]));
    }

    /// <summary>
    /// Valley streams for one green island. The island's walkable land (land that is not mountain, plus every non-wide river tile)
    /// is flood-filled; every region but the largest that is closed in by mountains alone (no sea, lake or wide river on its
    /// border) and has at least <see cref="ValleyMinHexes"/> hexes gets one stream, largest first then by lowest (Q, R): from a hex
    /// of the valley across the fewest mountain hexes to the nearest reachable hex (ties: the target's (Q, R), then the start's),
    /// joining the river there or, on plain land, running on to a river, a lake or the sea like any spring's stream. A carve that
    /// breaks a map rule, cannot be drawn or cuts other land off is skipped. Adds the streams to <paramref name="bp"/> and returns
    /// the island's rivers as they stand.
    /// </summary>
    private static List<RiverTile> CarveValleyStreams(
        IReadOnlyList<HexCoord> islandTiles,
        Dictionary<HexCoord, Terrain> land,
        HashSet<HexCoord> islandLand,
        Func<HexCoord, bool> riverLand,
        WorldGenerationOptions options,
        int seed,
        List<BogTile> bogTiles,
        BogPaths bp,
        List<RiverTile> startRivers,
        RiverStats? stats)
    {
        var ground = new ValleyGround(islandTiles, land, islandLand, bogTiles);
        var blocked = ground.Blocked;
        Func<HexCoord, Terrain> terrainHere = ground.TerrainHere;

        var walk = ground.Analyse(startRivers);
        var tiles = startRivers;
        var candidates = ground.Candidates(walk);
        if (candidates.Count == 0)
        {
            return tiles;
        }

        if (stats is not null)
        {
            stats.ValleyCandidates += candidates.Count;
        }

        var ruleBase = -1;
        foreach (var cand in candidates)
        {
            if (!walk.RegionOf.TryGetValue(cand.First, out var id))
            {
                if (stats is not null)
                {
                    stats.ValleySkippedChanged++;
                }

                continue;
            }

            if (id == walk.Main)
            {
                if (stats is not null)
                {
                    stats.ValleysJoined++;
                }

                continue;
            }

            var region = walk.Regions[id];
            if (region.Count < ValleyMinHexes || !ground.MountainEnclosed(region, walk, id))
            {
                if (stats is not null)
                {
                    stats.ValleySkippedChanged++;
                }

                continue;
            }

            var current = walk;
            var riverAt = current.RiverAt;
            var regionOf = current.RegionOf;
            bool InMain(HexCoord c) => regionOf.TryGetValue(c, out var rid) && rid == current.Main;
            var pathIns = new Dictionary<HexCoord, int>();
            foreach (var p in bp.Paths)
            {
                for (var i = 1; i < p.Count; i++)
                {
                    pathIns[p[i]] = pathIns.GetValueOrDefault(p[i]) + 1;
                }
            }

            // A river tile a new stream can join from `from`: reachable, a plain one-inflow tile, and the Y is drawable.
            bool RiverTarget(RiverTile t, HexCoord from)
            {
                if (!InMain(t.Coord) || current.Wide.Contains(t.Coord))
                {
                    return false;
                }

                if (t.Shape is not (RiverTileShape.Straight or RiverTileShape.Bend or RiverTileShape.Bend60))
                {
                    return false;
                }

                if (t.InDirections.Count != 1 || t.OutDirection is null)
                {
                    return false;
                }

                if (bp.ForcedOut.ContainsKey(t.Coord) || bp.BogIn.ContainsKey(t.Coord) || pathIns.GetValueOrDefault(t.Coord) != 1)
                {
                    return false;
                }

                var ins = (int)t.InDirections[0];
                var outDir = (int)t.OutDirection.Value;
                var ns = t.Coord.Neighbours();
                if (!riverAt.ContainsKey(ns[ins]) || !riverAt.ContainsKey(ns[outDir]))
                {
                    return false;
                }

                return RiverConfluence.IsRepresentable(ins, DirectionIndex(t.Coord, from), outDir);
            }

            // Plain land a new stream can start running on from: reachable, no river, off the bogland, not on the coast.
            bool PlainTarget(HexCoord c) =>
                InMain(c) && !riverAt.ContainsKey(c) && !blocked.Contains(c) && c.Neighbours().All(islandLand.Contains);

            List<RiverTile> RiverNeighbours(HexCoord c)
            {
                var found = new List<RiverTile>();
                foreach (var n in c.Neighbours())
                {
                    if (riverAt.TryGetValue(n, out var t))
                    {
                        found.Add(t);
                    }
                }

                return found;
            }

            var usable = new Dictionary<HexCoord, Usable?>();
            Usable? UsableAt(HexCoord h)
            {
                if (usable.TryGetValue(h, out var known))
                {
                    return known;
                }

                Usable? result = null;
                if (islandLand.Contains(h) && terrainHere(h) == Terrain.Mountain && !riverAt.ContainsKey(h) && !blocked.Contains(h))
                {
                    var beside = RiverNeighbours(h);
                    if (beside.Count == 0)
                    {
                        result = new Usable(false, default);
                    }
                    else if (beside.Count == 1 && RiverTarget(beside[0], h))
                    {
                        result = new Usable(true, beside[0].Coord);
                    }
                }

                usable[h] = result;
                return result;
            }

            // Starts: valley hexes off the water and the bogland with no river beside.
            var starts = region
                .Where(c => !riverAt.ContainsKey(c) && !blocked.Contains(c) && terrainHere(c) != Terrain.Mountain && RiverNeighbours(c).Count == 0)
                .OrderBy(c => c.Q)
                .ThenBy(c => c.R)
                .ToList();

            // Forward: how many mountain hexes from the nearest start, layer by layer; the first layer with a target wins.
            var dist = new HashSet<HexCoord>();
            var layer = new List<HexCoord>();
            foreach (var s in starts)
            {
                foreach (var n in s.Neighbours())
                {
                    if (!dist.Contains(n) && UsableAt(n) is not null)
                    {
                        dist.Add(n);
                        layer.Add(n);
                    }
                }
            }

            var bestK = 0;
            HexCoord? bestTarget = null;
            for (var k = 1; layer.Count > 0; k++)
            {
                foreach (var h in layer)
                {
                    var u = UsableAt(h)!;
                    var targets = u.IsTerminal ? new List<HexCoord> { u.Terminal } : h.Neighbours().Where(PlainTarget).ToList();
                    foreach (var t in targets)
                    {
                        if (bestTarget is null || t.Q < bestTarget.Value.Q || (t.Q == bestTarget.Value.Q && t.R < bestTarget.Value.R))
                        {
                            bestK = k;
                            bestTarget = t;
                        }
                    }
                }

                if (bestTarget is not null)
                {
                    break;
                }

                var next = new List<HexCoord>();
                foreach (var h in layer)
                {
                    if (UsableAt(h)!.IsTerminal)
                    {
                        continue;
                    }

                    foreach (var n in h.Neighbours())
                    {
                        if (!dist.Contains(n) && UsableAt(n) is not null)
                        {
                            dist.Add(n);
                            next.Add(n);
                        }
                    }
                }

                layer = next;
            }

            if (bestTarget is null)
            {
                if (stats is not null)
                {
                    stats.ValleySkippedNoPath++;
                }

                continue;
            }

            // Backward from the target: the hexes of every shortest way in, then the lowest start and the lowest direction first.
            var target = bestTarget.Value;
            var targetIsRiver = riverAt.ContainsKey(target);
            var back = new Dictionary<HexCoord, int>();
            var frontier = new List<HexCoord>();
            foreach (var n in target.Neighbours())
            {
                var u = UsableAt(n);
                if (u is not null && (u.IsTerminal ? targetIsRiver && u.Terminal == target : !targetIsRiver))
                {
                    back[n] = 1;
                    frontier.Add(n);
                }
            }

            for (var k = 1; k < bestK; k++)
            {
                var next = new List<HexCoord>();
                foreach (var h in frontier)
                {
                    foreach (var n in h.Neighbours())
                    {
                        if (!back.ContainsKey(n) && UsableAt(n) is { IsTerminal: false })
                        {
                            back[n] = k + 1;
                            next.Add(n);
                        }
                    }
                }

                frontier = next;
            }

            HexCoord? start = null;
            foreach (var s in starts)
            {
                if (s.Neighbours().Any(n => back.TryGetValue(n, out var b) && b == bestK))
                {
                    start = s;
                    break;
                }
            }

            if (start is null)
            {
                if (stats is not null)
                {
                    stats.ValleySkippedNoPath++;
                }

                continue;
            }

            var carve = new List<HexCoord> { start.Value };
            for (var want = bestK; want >= 1; want--)
            {
                var here = carve[^1];
                carve.Add(here.Neighbours().First(n => back.TryGetValue(n, out var b) && b == want));
            }

            // The stream: joining the river it ends on, or running on from plain land like a spring's stream.
            List<HexCoord> path;
            bool merged;
            if (targetIsRiver)
            {
                path = [.. carve, target];
                merged = true;
            }
            else
            {
                var block = new HashSet<HexCoord>(blocked);
                foreach (var c in carve)
                {
                    block.Add(c);
                    foreach (var n in c.Neighbours())
                    {
                        block.Add(n);
                    }
                }

                block.Remove(target);
                var d2 = new Drainage(islandTiles, land, riverLand, options, seed, block);
                var claims2 = new Claim?[d2.Tiles.Length];
                for (var j = 0; j < bp.Paths.Count; j++)
                {
                    Commit(d2, bp.Paths[j], bp.Merged[j], claims2);
                }

                var onPath2 = new bool[d2.Tiles.Length];
                var traced = TraceDrainage(d2, target, claims2, onPath2, options, out var tracedMerged, DirectionIndex(target, carve[^1]));
                if (traced is null)
                {
                    if (stats is not null)
                    {
                        stats.ValleySkippedTrace++;
                    }

                    continue;
                }

                path = [.. carve, .. traced];
                merged = tracedMerged;
            }

            // Layout: no hex twice, nothing on the bogland, no run beside itself, and none beside a river it does not drain into.
            string RootOf(RiverTile t)
            {
                var cur = t;
                for (var guard = 0; cur.OutDirection is not null && guard < 100000; guard++)
                {
                    if (!riverAt.TryGetValue(cur.Coord.Neighbours()[(int)cur.OutDirection.Value], out var next))
                    {
                        break;
                    }

                    cur = next;
                }

                return $"{cur.Coord.Q},{cur.Coord.R}";
            }

            // A junction on a tile the width pass later dropped is no junction.
            RiverTile? joinTile = null;
            if (merged && riverAt.TryGetValue(path[^1], out var joined))
            {
                joinTile = joined;
            }

            var joinedRoot = joinTile is { } jt ? RootOf(jt) : null;
            var at = new Dictionary<HexCoord, int>();
            for (var i = 0; i < path.Count; i++)
            {
                at[path[i]] = i;
            }

            var lastNew = merged ? path.Count - 2 : path.Count - 1;
            var layoutOk = at.Count == path.Count && (!merged || joinTile is not null);
            for (var i = 0; layoutOk && i <= lastNew; i++)
            {
                var c = path[i];
                if (riverAt.ContainsKey(c) || blocked.Contains(c) || !islandLand.Contains(c))
                {
                    layoutOk = false;
                }

                foreach (var n in c.Neighbours())
                {
                    if (at.TryGetValue(n, out var j))
                    {
                        if (Math.Abs(i - j) != 1)
                        {
                            layoutOk = false;
                        }
                    }
                    else if (riverAt.TryGetValue(n, out var beside) && (joinedRoot is null || RootOf(beside) != joinedRoot))
                    {
                        layoutOk = false;
                    }
                }
            }

            if (!layoutOk)
            {
                if (stats is not null)
                {
                    stats.ValleySkippedLayout++;
                }

                continue;
            }

            // The width pass must keep every river and the whole stream.
            var trial = bp.Clone();
            trial.Paths.Add(path);
            trial.Merged.Add(merged);
            var trialTiles = AssignWidths(BuildRiverTiles(trial), riverLand, seed, null, trial.RequireRiver);
            var expected = new HashSet<HexCoord>(tiles.Select(t => t.Coord));
            for (var i = 0; i <= lastNew; i++)
            {
                expected.Add(path[i]);
            }

            if (trialTiles.Count != expected.Count || trialTiles.Any(t => !expected.Contains(t.Coord)))
            {
                if (stats is not null)
                {
                    stats.ValleySkippedWidths++;
                }

                continue;
            }

            // Map rules (R1-R12) may not get worse.
            if (ruleBase < 0)
            {
                ruleBase = BogRules.Check(bogTiles, tiles, ground.BaseTerrain).Total;
            }

            var ruleTrial = BogRules.Check(bogTiles, trialTiles, ground.BaseTerrain).Total;
            if (ruleTrial > ruleBase)
            {
                if (stats is not null)
                {
                    stats.ValleySkippedRules++;
                }

                continue;
            }

            // Nothing may be cut off, and the valley must be reachable now.
            var after = ground.Analyse(trialTiles);
            bool Reachable(HexCoord c) => after.RegionOf.TryGetValue(c, out var rid) && rid == after.Main;
            var cut = !region.All(Reachable);
            if (!cut)
            {
                foreach (var (c, rid) in regionOf)
                {
                    if (rid == current.Main && after.RegionOf.ContainsKey(c) && !Reachable(c))
                    {
                        cut = true;
                        break;
                    }
                }
            }

            if (cut)
            {
                if (stats is not null)
                {
                    stats.ValleySkippedCutsOff++;
                }

                continue;
            }

            bp.Paths.Add(path);
            bp.Merged.Add(merged);
            tiles = trialTiles;
            walk = after;
            ruleBase = ruleTrial;
            if (stats is not null)
            {
                stats.ValleyStreams++;
                if (targetIsRiver)
                {
                    stats.ValleyStreamsIntoRivers++;
                }
            }
        }

        return tiles;
    }
}
