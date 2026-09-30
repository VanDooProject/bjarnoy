namespace Bjarnoy.Domain.World;

/// <summary>How many times each of the bog map rules (R1-R11, <c>docs/design/bog.md</c>) is broken. All zero for a generated world.</summary>
public sealed record BogRuleViolations(int R1, int R2, int R3, int R4, int R5, int R6, int R7, int R8, int R9, int R10, int R11)
{
    public int Total => R1 + R2 + R3 + R4 + R5 + R6 + R7 + R8 + R9 + R10 + R11;

    public static BogRuleViolations operator +(BogRuleViolations a, BogRuleViolations b) => new(
        a.R1 + b.R1, a.R2 + b.R2, a.R3 + b.R3, a.R4 + b.R4, a.R5 + b.R5, a.R6 + b.R6,
        a.R7 + b.R7, a.R8 + b.R8, a.R9 + b.R9, a.R10 + b.R10, a.R11 + b.R11);

    public static BogRuleViolations None { get; } = new(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    public override string ToString() =>
        $"R1={R1} R2={R2} R3={R3} R4={R4} R5={R5} R6={R6} R7={R7} R8={R8} R9={R9} R10={R10} R11={R11}";
}

/// <summary>
/// Checks an island's bogland and rivers against the art's map rules and the owner's requirements. This is what the tests and the
/// worldgen preview count; the generator itself builds every site on scratch state and drops it when it would break one, so a
/// generated island reports zero. Mirrored by <c>src/frontend/src/lib/map/bogRules.ts</c>.
/// </summary>
/// <remarks>
/// R1 a non-lake bog tile touches at most 3 lake tiles, in one run, and every neighbour of a lake tile is bog or lake; R2 no tile touches
/// two lakes; R3 creeks are Straight or Bend, every flow link is matched by its neighbour (no forks, ends only in a spring or a mouth or a
/// river); R4 a creek meets a lake only at a mouth (one lake edge, the creek opposite it); R5 (fish weir near a fisher hut) and R6
/// (no walkways) are not generated at all; R7 no bog touches the sea or sand; R8 every lake that stands on land has exactly one outflow and at
/// least one inflow, a pocket lake none; R9 a creek spring is at least 3 from a lake and its creek reaches a river; R10 a pocket lake is
/// ringed by bog; R11 a creek meets a river only at river width (or the widening tile).
/// </remarks>
public static class BogRules
{
    /// <summary>How far from a pocket lake its bog ring (and the sand it turned to bog) reaches: <c>BogPocketRadius</c> plus the lake's own filled edge.</summary>
    private const int PocketRingReach = 6;

    public static BogRuleViolations Check(
        IReadOnlyList<BogTile> bog,
        IReadOnlyList<RiverTile> rivers,
        Func<HexCoord, Terrain> baseTerrain)
    {
        var byCoord = new Dictionary<HexCoord, BogTile>(bog.Count);
        foreach (var t in bog)
        {
            byCoord[t.Coord] = t;
        }

        var riverByCoord = new Dictionary<HexCoord, RiverTile>(rivers.Count);
        foreach (var r in rivers)
        {
            riverByCoord[r.Coord] = r;
        }

        bool IsLake(HexCoord c) => byCoord.TryGetValue(c, out var t) && t.Kind == BogTileKind.Lake;
        HexCoord Nb(HexCoord c, int d) => c + HexCoord.Directions[d];
        int Mask(HexCoord c)
        {
            var m = 0;
            for (var d = 0; d < 6; d++)
            {
                if (IsLake(Nb(c, d)))
                {
                    m |= 1 << d;
                }
            }

            return m;
        }

        int r1 = 0, r2 = 0, r3 = 0, r4 = 0, r7 = 0, r8 = 0, r9 = 0, r10 = 0, r11 = 0;

        // Lake components (edge-connected).
        var component = new Dictionary<HexCoord, int>();
        var componentTiles = new List<List<HexCoord>>();
        foreach (var t in bog.Where(t => t.Kind == BogTileKind.Lake).OrderBy(t => t.Coord.Q).ThenBy(t => t.Coord.R))
        {
            if (component.ContainsKey(t.Coord))
            {
                continue;
            }

            var id = componentTiles.Count;
            var tiles = new List<HexCoord>();
            var stack = new Stack<HexCoord>();
            stack.Push(t.Coord);
            component[t.Coord] = id;
            while (stack.Count > 0)
            {
                var c = stack.Pop();
                tiles.Add(c);
                for (var d = 0; d < 6; d++)
                {
                    var n = Nb(c, d);
                    if (IsLake(n) && !component.ContainsKey(n))
                    {
                        component[n] = id;
                        stack.Push(n);
                    }
                }
            }

            componentTiles.Add(tiles);
        }

        bool PocketLake(int id) => componentTiles[id].Any(c => baseTerrain(c) == Terrain.Sea);

        // An enclosed pocket's ring may touch sand (the pocket is inside the island); everything else may not. A hex counts
        // as a pocket ring when it lies within the ring's reach of a pocket lake.
        var pocketTiles = componentTiles.Where((_, id) => PocketLake(id)).SelectMany(t => t).ToList();
        bool InPocketRing(HexCoord c) => pocketTiles.Any(p => HexCoord.Distance(p, c) <= PocketRingReach);

        foreach (var t in bog)
        {
            var c = t.Coord;
            if (t.Kind == BogTileKind.Lake)
            {
                // Every neighbour of a lake tile is lake or bog (R1); pocket lake tiles on sea have R10 for the same test.
                for (var d = 0; d < 6; d++)
                {
                    var n = Nb(c, d);
                    if (!byCoord.ContainsKey(n))
                    {
                        if (baseTerrain(c) == Terrain.Sea)
                        {
                            r10++;
                        }
                        else
                        {
                            r1++;
                        }
                    }
                }

                continue;
            }

            var mask = Mask(c);
            var count = 0;
            var runs = 0;
            for (var d = 0; d < 6; d++)
            {
                if (((mask >> d) & 1) == 1)
                {
                    count++;
                    if (((mask >> ((d + 5) % 6)) & 1) == 0)
                    {
                        runs++;
                    }
                }
            }

            if (count > 3 || runs > 1)
            {
                r1++;
            }

            var touching = new HashSet<int>();
            for (var d = 0; d < 6; d++)
            {
                if (((mask >> d) & 1) == 1)
                {
                    touching.Add(component[Nb(c, d)]);
                }
            }

            if (touching.Count > 1)
            {
                r2++;
            }

            // Kind must match what the tile touches.
            var expectedEdges = BogGenerator.WaterRun(mask);
            var kindOk = t.Kind switch
            {
                BogTileKind.Bog or BogTileKind.CreekSpring => count == 0,
                BogTileKind.Creek => count == 0,
                BogTileKind.Inlet => count == 1,
                BogTileKind.Shore => count == 2,
                BogTileKind.Half => count == 3,
                BogTileKind.Mouth => count == 1,
                _ => false,
            };
            if (!kindOk)
            {
                r1++;
            }

            if (t.Kind is BogTileKind.Inlet or BogTileKind.Shore or BogTileKind.Half or BogTileKind.Mouth
                && !t.WaterEdges.Select(e => (int)e).SequenceEqual(expectedEdges))
            {
                r1++;
            }

            // R7: never beside the open sea or sand.
            for (var d = 0; d < 6; d++)
            {
                var n = Nb(c, d);
                if (byCoord.ContainsKey(n))
                {
                    continue;
                }

                var terrain = baseTerrain(n);
                if (terrain == Terrain.Sea || (terrain == Terrain.Sand && !InPocketRing(c)))
                {
                    r7++;
                }
            }

            // Creek family: flow links, shapes, lake contact.
            if (t.Kind is BogTileKind.Creek or BogTileKind.Mouth or BogTileKind.CreekSpring)
            {
                var ins = t.InDirections.Select(d => (int)d).ToList();
                var outDir = t.OutDirection is { } od ? (int)od : -1;
                if (t.Kind == BogTileKind.Creek)
                {
                    if (ins.Count != 1 || outDir < 0)
                    {
                        r3++;
                    }
                    else
                    {
                        var opposite = (ins[0] + 3) % 6;
                        var turn = Math.Min((outDir - opposite + 6) % 6, (opposite - outDir + 6) % 6);
                        if (turn > 1)
                        {
                            r3++;
                        }
                    }

                    if (count != 0)
                    {
                        r4++;
                    }
                }
                else if (t.Kind == BogTileKind.CreekSpring)
                {
                    if (ins.Count != 0 || outDir < 0)
                    {
                        r3++;
                    }
                }
                else
                {
                    // Mouth: one water edge, the creek on the opposite edge, straight through.
                    var water = t.WaterEdges.Count == 1 ? (int)t.WaterEdges[0] : -1;
                    var okShape = water >= 0 && ins.Count == 1 && outDir >= 0
                        && ((ins[0] == (water + 3) % 6 && outDir == water) || (ins[0] == water && outDir == (water + 3) % 6));
                    if (!okShape || count != 1)
                    {
                        r4++;
                    }
                }

                // Every flow link is matched by the neighbour it points at (a creek tile, a river, or the lake for a mouth).
                foreach (var d in ins)
                {
                    if (!LinkOk(c, d, expectFlowTowardUs: true))
                    {
                        r3++;
                    }
                }

                if (outDir >= 0 && !LinkOk(c, outDir, expectFlowTowardUs: false))
                {
                    r3++;
                }

                bool LinkOk(HexCoord from, int dir, bool expectFlowTowardUs)
                {
                    var n = Nb(from, dir);
                    var back = (dir + 3) % 6;
                    if (IsLake(n))
                    {
                        return t.Kind == BogTileKind.Mouth && t.WaterEdges.Count == 1 && (int)t.WaterEdges[0] == dir;
                    }

                    if (byCoord.TryGetValue(n, out var nb))
                    {
                        if (nb.Kind is not (BogTileKind.Creek or BogTileKind.Mouth or BogTileKind.CreekSpring))
                        {
                            return false;
                        }

                        return expectFlowTowardUs
                            ? nb.OutDirection is { } o && (int)o == back
                            : nb.InDirections.Any(x => (int)x == back);
                    }

                    if (riverByCoord.TryGetValue(n, out var river))
                    {
                        // R11: a creek meets a river at river width only.
                        if (river.Width == RiverWidth.Stream)
                        {
                            r11++;
                        }

                        return expectFlowTowardUs
                            ? river.OutDirection is { } o && (int)o == back
                            : river.InDirections.Any(x => (int)x == back);
                    }

                    return false;
                }
            }
        }

        // R8 / R9 / R10 per lake.
        for (var id = 0; id < componentTiles.Count; id++)
        {
            var lakeSet = new HashSet<HexCoord>(componentTiles[id]);
            var mouths = bog.Where(t => t.Kind == BogTileKind.Mouth
                && Enumerable.Range(0, 6).Any(d => lakeSet.Contains(Nb(t.Coord, d)))).ToList();
            var outflow = mouths.Count(m => m.WaterEdges.Count == 1 && m.InDirections.Count == 1 && (int)m.InDirections[0] == (int)m.WaterEdges[0]);
            var inflow = mouths.Count - outflow;
            if (PocketLake(id))
            {
                if (outflow != 0)
                {
                    r8++;
                }
            }
            else if (outflow != 1 || inflow < 1)
            {
                r8++;
            }
        }

        foreach (var t in bog.Where(t => t.Kind == BogTileKind.CreekSpring))
        {
            if (componentTiles.Any(l => l.Any(c => HexCoord.Distance(c, t.Coord) < 3)))
            {
                r9++;
            }

            // Follow the creek down: it must end in a river.
            var cur = t;
            var steps = 0;
            var reachedRiver = false;
            while (steps++ < 200 && cur.OutDirection is { } o)
            {
                var n = cur.Coord + HexCoord.Directions[(int)o];
                if (riverByCoord.ContainsKey(n))
                {
                    reachedRiver = true;
                    break;
                }

                if (IsLake(n) && component.TryGetValue(n, out var lakeId))
                {
                    // A spring that feeds a lake (a guaranteed spawn bog): the river through the lake, out of its outflow mouth,
                    // takes the water on. R8 makes sure every lake has exactly one; the link checks above follow it to the river.
                    reachedRiver = bog.Any(m => m.Kind == BogTileKind.Mouth
                        && m.WaterEdges.Count == 1
                        && m.InDirections.Count == 1
                        && (int)m.InDirections[0] == (int)m.WaterEdges[0]
                        && Enumerable.Range(0, 6).Any(d => component.TryGetValue(Nb(m.Coord, d), out var id) && id == lakeId));
                    break;
                }

                if (!byCoord.TryGetValue(n, out cur) || cur.Kind == BogTileKind.Lake)
                {
                    break;
                }
            }

            if (!reachedRiver)
            {
                r9++;
            }
        }

        return new BogRuleViolations(r1, r2, r3, r4, 0, 0, r7, r8, r9, r10, r11);
    }
}
