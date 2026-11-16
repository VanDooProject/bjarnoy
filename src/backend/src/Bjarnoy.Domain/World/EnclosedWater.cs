namespace Bjarnoy.Domain.World;

/// <summary>
/// Enclosed water: sea an island encloses, not connected to the open sea (the inside of an O-shaped island).
/// Shared by the bog generator (which turns a pocket into a lake with a bog ring, or leaves it as an inland
/// lake), the camp placement (no whale road in it) and the world review. Mirrored by
/// <c>src/frontend/src/lib/map/enclosedWater.ts</c>.
/// </summary>
internal static class EnclosedWater
{
    private static HexCoord Nb(HexCoord c, int d) => c + HexCoord.Directions[d];

    /// <summary>
    /// The enclosed pockets of <paramref name="islandTiles"/> (a bounding-box flood fill from the outside, the
    /// remaining water grouped into components). A pocket with a land hex in it (<paramref name="isLand"/>:
    /// another landmass inside) is not one and is left out. Component order and the order inside a component
    /// are the scan / DFS order, which the pocket builder depends on.
    /// </summary>
    public static List<List<HexCoord>> Pockets(IReadOnlyList<HexCoord> islandTiles, Func<HexCoord, bool> isLand)
    {
        if (islandTiles.Count == 0)
        {
            return [];
        }

        var minQ = int.MaxValue;
        var maxQ = int.MinValue;
        var minR = int.MaxValue;
        var maxR = int.MinValue;
        foreach (var t in islandTiles)
        {
            minQ = Math.Min(minQ, t.Q);
            maxQ = Math.Max(maxQ, t.Q);
            minR = Math.Min(minR, t.R);
            maxR = Math.Max(maxR, t.R);
        }

        minQ--;
        maxQ++;
        minR--;
        maxR++;
        var w = maxQ - minQ + 1;
        var h = maxR - minR + 1;
        var state = new byte[w * h]; // 0 water not yet seen, 1 island land, 2 open sea
        foreach (var t in islandTiles)
        {
            state[((t.R - minR) * w) + (t.Q - minQ)] = 1;
        }

        var queue = new Queue<int>();
        for (var q = 0; q < w; q++)
        {
            foreach (var r in new[] { 0, h - 1 })
            {
                var idx = (r * w) + q;
                if (state[idx] == 0)
                {
                    state[idx] = 2;
                    queue.Enqueue(idx);
                }
            }
        }

        for (var r = 0; r < h; r++)
        {
            foreach (var q in new[] { 0, w - 1 })
            {
                var idx = (r * w) + q;
                if (state[idx] == 0)
                {
                    state[idx] = 2;
                    queue.Enqueue(idx);
                }
            }
        }

        while (queue.Count > 0)
        {
            var idx = queue.Dequeue();
            var q = (idx % w) + minQ;
            var r = (idx / w) + minR;
            for (var d = 0; d < 6; d++)
            {
                var n = Nb(new HexCoord(q, r), d);
                var nq = n.Q - minQ;
                var nr = n.R - minR;
                if (nq < 0 || nr < 0 || nq >= w || nr >= h)
                {
                    continue;
                }

                var ni = (nr * w) + nq;
                if (state[ni] == 0)
                {
                    state[ni] = 2;
                    queue.Enqueue(ni);
                }
            }
        }

        // Remaining water cells are enclosed: group them.
        var seen = new HashSet<int>();
        var components = new List<List<HexCoord>>();
        for (var r = 0; r < h; r++)
        {
            for (var q = 0; q < w; q++)
            {
                var idx = (r * w) + q;
                if (state[idx] != 0 || !seen.Add(idx))
                {
                    continue;
                }

                var comp = new List<HexCoord>();
                var pending = new Stack<int>();
                pending.Push(idx);
                while (pending.Count > 0)
                {
                    var cur = pending.Pop();
                    var c = new HexCoord((cur % w) + minQ, (cur / w) + minR);
                    comp.Add(c);
                    for (var d = 0; d < 6; d++)
                    {
                        var n = Nb(c, d);
                        var nq = n.Q - minQ;
                        var nr = n.R - minR;
                        if (nq < 0 || nr < 0 || nq >= w || nr >= h)
                        {
                            continue;
                        }

                        var ni = (nr * w) + nq;
                        if (state[ni] == 0 && seen.Add(ni))
                        {
                            pending.Push(ni);
                        }
                    }
                }

                components.Add(comp);
            }
        }

        // Nothing but sea-level water may be in the pocket: another landmass inside it means it is not ours.
        return [.. components.Where(c => !c.Any(isLand))];
    }

    /// <summary>Every hex of every enclosed pocket, sorted by (Q, R).</summary>
    public static List<HexCoord> Tiles(IReadOnlyList<HexCoord> islandTiles, Func<HexCoord, bool> isLand)
    {
        var tiles = new List<HexCoord>();
        foreach (var pocket in Pockets(islandTiles, isLand))
        {
            tiles.AddRange(pocket);
        }

        tiles.Sort((a, b) => a.Q != b.Q ? a.Q.CompareTo(b.Q) : a.R.CompareTo(b.R));
        return tiles;
    }
}
