namespace Bjarnoy.Domain.World;

/// <summary>
/// The river paths a green island's bog placement works on: the traced paths (spring first, mouth or
/// junction last) plus what the bog changes about them. A bog never edits a <see cref="RiverTile"/>: it
/// cuts and replaces path segments, records where a path leaves into (<see cref="ForcedOut"/>) or
/// comes out of (<see cref="BogIn"/>) a creek, and the river builders read that.
/// </summary>
internal sealed class BogPaths
{
    public BogPaths(List<List<HexCoord>> paths, List<bool> merged)
    {
        Paths = paths;
        Merged = merged;
    }

    public List<List<HexCoord>> Paths { get; }

    /// <summary>Parallel to <see cref="Paths"/>: the path ends on a tile of another path (a junction).</summary>
    public List<bool> Merged { get; }

    /// <summary>A river tile whose outflow goes into a bog creek: the direction it flows out by.</summary>
    public Dictionary<HexCoord, int> ForcedOut { get; } = [];

    /// <summary>A river tile whose (only) inflow comes out of a bog creek: the direction that creek lies in.</summary>
    public Dictionary<HexCoord, int> BogIn { get; } = [];

    /// <summary>River tiles that hand their water to a creek and so must be at river width.</summary>
    public HashSet<HexCoord> RequireRiver { get; } = [];

    public BogPaths Clone()
    {
        var copy = new BogPaths([.. Paths.Select(p => new List<HexCoord>(p))], [.. Merged]);
        foreach (var kv in ForcedOut)
        {
            copy.ForcedOut[kv.Key] = kv.Value;
        }

        foreach (var kv in BogIn)
        {
            copy.BogIn[kv.Key] = kv.Value;
        }

        foreach (var c in RequireRiver)
        {
            copy.RequireRiver.Add(c);
        }

        return copy;
    }
}

/// <summary>
/// Places bogland on a green island: lakes with a river running through them (inflow mouth, lake,
/// outflow mouth), bog moss around them, the occasional extra river sunk into a lake or spawned by a
/// creek spring, and an enclosed sea pocket turned into a lake with a bog ring. All within the art's map
/// rules (<c>docs/design/bog.md</c>, rules R1-R11). Pure and seed-derived; mirrored bit for bit by
/// <c>src/frontend/src/lib/map/bogGenerator.ts</c>.
/// </summary>
/// <remarks>
/// Runs inside <see cref="RiverGenerator"/>'s green pipeline: pockets are found before the drainage
/// network is traced (rivers then leave a pocket's ring alone), sites and sinks/spawns after the springs have
/// been traced and before the width pass. Every site is built on scratch state, validated (including a trial
/// width pass, so the stream that feeds a creek really can widen first: rule R11) and only then committed;
/// a site that fails any test is dropped whole, so the rules hold by construction.
/// </remarks>
internal sealed class BogGenerator
{
    /// <summary>Extra reach of a sink beyond the site radius: a river this close to the lake can be led in.</summary>
    private const int SinkExtraReach = 6;

    /// <summary>Longest creek a route may have (tiles), so a search never wanders across the island.</summary>
    private const int MaxCreekLength = 40;

    /// <summary>How many candidate anchors that pass the cheap tests a site placement tries before it gives up.</summary>
    private const int MaxSiteAttempts = 60;

    /// <summary>The guarantee's through-river sites accept a river tile this close to its spring and (at most) this close to its mouth.</summary>
    private const int GuaranteeMinFromSpring = 2;

    private const int GuaranteeMinFromMouth = 3;

    /// <summary>Largest lake grown for a guaranteed bog; smaller than a normal site's, since its disc is smaller too.</summary>
    private const int GuaranteeLakeMax = 8;

    /// <summary>A guaranteed bog's anchor is at least this far from the coast (the lake and its shore ring need more than 2).</summary>
    private const int GuaranteeMinCoastDist = 4;

    /// <summary>How many anchors a spawn bog tries.</summary>
    private const int MaxSpawnAttempts = 80;

    /// <summary>How many spring candidates a spawn bog tries per anchor.</summary>
    private const int MaxSpringCandidates = 6;

    private readonly IReadOnlyList<HexCoord> _islandTiles;
    private readonly HashSet<HexCoord> _islandLand;
    private readonly IReadOnlyDictionary<HexCoord, Terrain> _land;
    private readonly Func<HexCoord, bool> _isLand;
    private readonly WorldGenerationOptions _options;
    private readonly int _seed;
    private readonly RiverGenerator.RiverStats? _stats;

    private readonly HashSet<HexCoord> _lake = [];
    private readonly HashSet<HexCoord> _bog = [];
    private readonly Dictionary<HexCoord, int> _lakeBuffer = [];
    private readonly Dictionary<HexCoord, (int In, int Out)> _creek = [];
    private readonly Dictionary<HexCoord, (int In, int Out, int Water)> _mouth = [];
    private readonly Dictionary<HexCoord, int> _spring = [];
    private readonly List<Site> _sites = [];
    private Dictionary<HexCoord, int> _coastDist = [];

    public BogGenerator(
        IReadOnlyList<HexCoord> islandTiles,
        IReadOnlyDictionary<HexCoord, Terrain> land,
        HashSet<HexCoord> islandLand,
        Func<HexCoord, bool> isLand,
        WorldGenerationOptions options,
        int seed,
        RiverGenerator.RiverStats? stats)
    {
        _islandTiles = islandTiles;
        _land = land;
        _islandLand = islandLand;
        _isLand = isLand;
        _options = options;
        _seed = seed;
        _stats = stats;
    }

    /// <summary>The water tiles of accepted pockets: sea that became lake. A river's drainage counts them as land it cannot enter.</summary>
    public HashSet<HexCoord> PocketWater { get; } = [];

    /// <summary>The bog ring tiles of accepted pockets (non-lake): drainage treats them as blocked.</summary>
    public HashSet<HexCoord> PocketRing { get; } = [];

    /// <summary>Every bog tile placed so far (moss, shores, creeks; not the lake water).</summary>
    public HashSet<HexCoord> BogTiles => _bog;

    /// <summary>Every lake tile placed so far.</summary>
    public HashSet<HexCoord> LakeTiles => _lake;

    private sealed class Site
    {
        public int Id;
        public HexCoord Anchor;
        public bool Pocket;
        public HashSet<HexCoord> Lake = [];
        public HashSet<HexCoord> Ring = [];
        public List<HexCoord> Creeks = [];
        public HashSet<HexCoord> Core = [];
        public int Radius;
        public HexCoord? Up;
        public HexCoord? Down;
    }

    private sealed class Route
    {
        public HexCoord Mouth;
        public int Water;
        public List<HexCoord> Tiles = [];
        public List<int> Dirs = [];
    }

    private static HexCoord Nb(HexCoord c, int d) => c + HexCoord.Directions[d];

    private static int Opp(int d) => (d + 3) % 6;

    private static int DirOf(HexCoord from, HexCoord to)
    {
        for (var d = 0; d < 6; d++)
        {
            if (Nb(from, d) == to)
            {
                return d;
            }
        }

        throw new InvalidOperationException($"{to} is not a neighbour of {from}");
    }

    private static int PopCount(int mask)
    {
        var n = 0;
        for (var d = 0; d < 6; d++)
        {
            n += (mask >> d) & 1;
        }

        return n;
    }

    /// <summary>Number of separate cyclic runs of set bits in a 6-bit direction mask (0 for none or all six).</summary>
    private static int Runs(int mask)
    {
        if (mask == 0 || mask == 63)
        {
            return 0;
        }

        var runs = 0;
        for (var d = 0; d < 6; d++)
        {
            if (((mask >> d) & 1) == 1 && ((mask >> ((d + 5) % 6)) & 1) == 0)
            {
                runs++;
            }
        }

        return runs;
    }

    private static int Cmp(HexCoord a, HexCoord b) => a.Q != b.Q ? a.Q.CompareTo(b.Q) : a.R.CompareTo(b.R);

    private static List<HexCoord> Sorted(IEnumerable<HexCoord> tiles)
    {
        var list = new List<HexCoord>(tiles);
        list.Sort(Cmp);
        return list;
    }

    private int LakeMask(HexCoord t, HashSet<HexCoord> lake)
    {
        var mask = 0;
        for (var d = 0; d < 6; d++)
        {
            if (lake.Contains(Nb(t, d)))
            {
                mask |= 1 << d;
            }
        }

        return mask;
    }

    private static int MinDistance(HexCoord t, IEnumerable<HexCoord> set)
    {
        var best = int.MaxValue;
        foreach (var s in set)
        {
            var d = HexCoord.Distance(t, s);
            if (d < best)
            {
                best = d;
            }
        }

        return best;
    }

    // ---------------------------------------------------------------- pockets

    /// <summary>
    /// Finds enclosed sea pockets (sea not connected to the open sea: the inside of an O-shaped island),
    /// builds each one's lake and bog ring on scratch state and keeps the ones that satisfy every rule
    /// (a pocket whose ring would touch the open sea, sand-to-sea, a mountain shore or another bog is left as sea).
    /// </summary>
    public void FindPockets()
    {
        if (_islandTiles.Count == 0)
        {
            return;
        }

        var minQ = int.MaxValue;
        var maxQ = int.MinValue;
        var minR = int.MaxValue;
        var maxR = int.MinValue;
        foreach (var t in _islandTiles)
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
        foreach (var t in _islandTiles)
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
        components = [.. components.Where(c => !c.Any(_isLand))];
        foreach (var comp in components)
        {
            if (comp.Count < _options.BogPocketMinTiles || comp.Count > _options.BogPocketMaxTiles)
            {
                continue;
            }

            if (_stats is not null)
            {
                _stats.BogPocketsFound++;
            }

            if (TryBuildPocket(comp) && _stats is not null)
            {
                _stats.BogPocketsFilled++;
            }
        }

        // The pockets' rings are now bog: re-measure the distance to anything a bog site must keep away from.
        _coastDist = ComputeCoastDist(extraSources: _bog.Concat(_lake));
    }

    private bool TryBuildPocket(List<HexCoord> water)
    {
        var lake = new HashSet<HexCoord>(water);
        var origWater = new HashSet<HexCoord>(water);

        // R1: an island tile touching the lake by four or more edges, or by two separate runs, fills up.
        for (var iteration = 0; iteration < 24; iteration++)
        {
            var add = new List<HexCoord>();
            foreach (var t in Sorted(NeighboursOf(lake)))
            {
                var mask = LakeMask(t, lake);
                if (PopCount(mask) >= 4 || Runs(mask) > 1)
                {
                    add.Add(t);
                }
            }

            if (add.Count == 0)
            {
                break;
            }

            foreach (var t in add)
            {
                if (!_islandLand.Contains(t) || _land[t] == Terrain.Mountain || _bog.Contains(t) || _lake.Contains(t))
                {
                    return false;
                }

                lake.Add(t);
            }
        }

        foreach (var t in NeighboursOf(lake))
        {
            var mask = LakeMask(t, lake);
            if (PopCount(mask) > 3 || Runs(mask) != 1)
            {
                return false;
            }
        }

        // Open sea: non-island water that is not this pocket.
        bool OpenSea(HexCoord t) => !_islandLand.Contains(t) && !lake.Contains(t) && !PocketWater.Contains(t);

        var ring = new HashSet<HexCoord>();
        var distance = new Dictionary<HexCoord, int>();
        var frontier = Sorted(NeighboursOf(lake));
        foreach (var t in frontier)
        {
            distance[t] = 1;
        }

        var radius = _options.BogPocketRadius;
        var layer = frontier;
        for (var d = 1; d <= radius; d++)
        {
            var next = new List<HexCoord>();
            foreach (var t in layer)
            {
                var keep = d == 1
                    || (d <= 2)
                    || ValueNoise.Sample(t.Q, t.R, _seed + 79, 3.0) > (d - 1.0) / radius;
                if (!keep)
                {
                    continue;
                }

                if (!_islandLand.Contains(t))
                {
                    if (d == 1)
                    {
                        return false;
                    }

                    continue;
                }

                if (_land[t] == Terrain.Mountain || OpenSea(t) || HasOpenSeaNeighbour(t, OpenSea))
                {
                    if (d == 1)
                    {
                        return false;
                    }

                    continue;
                }

                if (_bog.Contains(t) || _lake.Contains(t))
                {
                    return false;
                }

                ring.Add(t);
                foreach (var n in Sorted(Nb6(t)))
                {
                    if (!lake.Contains(n) && !ring.Contains(n) && !distance.ContainsKey(n))
                    {
                        distance[n] = d + 1;
                        next.Add(n);
                    }
                }
            }

            next.Sort(Cmp);
            layer = next;
        }

        // R7 for the whole ring: nothing touches the open sea. (Sand is fine here: the pocket is inside the island, its own
        // beach and the sand beside it turn to bog as far as the ring reaches; see docs/design/bog.md.)
        foreach (var t in ring)
        {
            foreach (var n in Nb6(t))
            {
                if (lake.Contains(n) || ring.Contains(n))
                {
                    continue;
                }

                if (OpenSea(n))
                {
                    return false;
                }
            }
        }

        // Separate lakes are at least three apart: nothing of an earlier bog may touch this one.
        foreach (var t in lake.Concat(ring))
        {
            foreach (var n in Nb6(t))
            {
                if ((_lake.Contains(n) || _bog.Contains(n)) && !lake.Contains(n) && !ring.Contains(n))
                {
                    return false;
                }
            }
        }

        // Every ring tile must be reachable from the lake through ring tiles (the noisy edge can strand some).
        var connected = new HashSet<HexCoord>();
        var stack = new Stack<HexCoord>();
        foreach (var t in NeighboursOf(lake))
        {
            if (ring.Contains(t) && connected.Add(t))
            {
                stack.Push(t);
            }
        }

        while (stack.Count > 0)
        {
            var c = stack.Pop();
            foreach (var n in Nb6(c))
            {
                if (ring.Contains(n) && connected.Add(n))
                {
                    stack.Push(n);
                }
            }
        }

        if (connected.Count != ring.Count)
        {
            // A stranded piece would have to be dropped, and the sand rule may need it: keep only the connected part
            // when nothing was dropped that touches sand, else give the pocket up.
            foreach (var t in ring.Where(t => !connected.Contains(t)))
            {
                if (Nb6(t).Any(n => connected.Contains(n)))
                {
                    return false;
                }
            }

            ring = connected;
        }

        var site = new Site { Id = _sites.Count, Anchor = water[0], Pocket = true, Radius = radius };
        foreach (var t in lake)
        {
            site.Lake.Add(t);
            _lake.Add(t);
        }

        foreach (var t in ring)
        {
            site.Ring.Add(t);
            site.Core.Add(t);
            _bog.Add(t);
            PocketRing.Add(t);
        }

        foreach (var t in origWater)
        {
            PocketWater.Add(t);
        }

        foreach (var t in lake)
        {
            if (_islandLand.Contains(t))
            {
                PocketRing.Add(t);
            }
        }

        AddBuffer(site);
        _sites.Add(site);
        return true;
    }

    private bool HasOpenSeaNeighbour(HexCoord t, Func<HexCoord, bool> openSea)
    {
        foreach (var n in Nb6(t))
        {
            if (openSea(n))
            {
                return true;
            }
        }

        return false;
    }

    private static IEnumerable<HexCoord> Nb6(HexCoord t)
    {
        for (var d = 0; d < 6; d++)
        {
            yield return Nb(t, d);
        }
    }

    private static HashSet<HexCoord> NeighboursOf(HashSet<HexCoord> set)
    {
        var result = new HashSet<HexCoord>();
        foreach (var t in set)
        {
            for (var d = 0; d < 6; d++)
            {
                var n = Nb(t, d);
                if (!set.Contains(n))
                {
                    result.Add(n);
                }
            }
        }

        return result;
    }

    private void AddBuffer(Site site)
    {
        foreach (var t in site.Lake)
        {
            foreach (var n in t.WithinRadius(2))
            {
                _lakeBuffer[n] = site.Id;
            }
        }
    }

    /// <summary>
    /// Distance (in hexes) from every island tile to the nearest sand, tile next to non-island water, or (when given)
    /// bog. Used to keep sites off the coast and away from each other.
    /// </summary>
    private Dictionary<HexCoord, int> ComputeCoastDist(IEnumerable<HexCoord>? extraSources)
    {
        var dist = new Dictionary<HexCoord, int>(_islandTiles.Count);
        var queue = new Queue<HexCoord>();
        foreach (var t in _islandTiles)
        {
            var source = _land[t] == Terrain.Sand;
            if (!source)
            {
                for (var d = 0; d < 6 && !source; d++)
                {
                    source = !_islandLand.Contains(Nb(t, d));
                }
            }

            if (source)
            {
                dist[t] = 0;
                queue.Enqueue(t);
            }
        }

        if (extraSources is not null)
        {
            foreach (var t in extraSources)
            {
                if (_islandLand.Contains(t) && !dist.ContainsKey(t))
                {
                    dist[t] = 0;
                    queue.Enqueue(t);
                }
            }
        }

        while (queue.Count > 0)
        {
            var c = queue.Dequeue();
            var dc = dist[c];
            for (var d = 0; d < 6; d++)
            {
                var n = Nb(c, d);
                if (_islandLand.Contains(n) && !dist.ContainsKey(n))
                {
                    dist[n] = dc + 1;
                    queue.Enqueue(n);
                }
            }
        }

        return dist;
    }

    // ---------------------------------------------------------------- sites

    /// <summary>A grass or forest tile away from the coast, from any bog and from other lakes: fit to become part of a site.</summary>
    private bool Allowed(HexCoord t, int ownSite = -1) =>
        _islandLand.Contains(t)
        && (_land[t] is Terrain.Grass or Terrain.Forest)
        && _coastDist.TryGetValue(t, out var cd) && cd > 2
        && !_bog.Contains(t)
        && !_lake.Contains(t)
        && (!_lakeBuffer.TryGetValue(t, out var owner) || owner == ownSite);

    /// <summary>
    /// Through-river sites: <c>clamp(floor(land / BogTilesPerSite), 1, BogMaxSites)</c> of them, on the best-scored tiles
    /// of the traced rivers, then sinks and spawns, then the pockets' own sinks. Mutates <paramref name="bp"/>.
    /// </summary>
    /// <param name="widthTrial">Builds and widths the river tiles of a path set (no stats): the R11 check.</param>
    /// <param name="traceRiver">Traces a spawned river from its first tile, or null when it cannot reach the sea or a trunk.</param>
    public void PlaceSites(
        BogPaths bp,
        Func<BogPaths, List<RiverTile>> widthTrial,
        Func<HexCoord, int, BogPaths, HashSet<HexCoord>, List<HexCoord>?> traceRiver)
    {
        var wanted = Math.Clamp(_islandTiles.Count / _options.BogTilesPerSite, 1, _options.BogMaxSites);
        var large = _islandTiles.Count >= _options.BogLargeIslandTiles;
        var radius = _options.BogSiteRadius + (large ? 2 : 0);
        var placed = 0;

        var count = PathCount(bp);
        var anchors = new List<(HexCoord Tile, int Path, int Index, double Score)>();
        for (var p = 0; p < bp.Paths.Count; p++)
        {
            var path = bp.Paths[p];
            var trunkBonus = !bp.Merged[p] ? 3.0 : 0.0;
            for (var i = _options.BogMinFromSpring; i <= path.Count - 1 - _options.BogMinFromMouth; i++)
            {
                var tile = path[i];

                // A site's disc has no tile within 2 of the coast, so its centre is at least radius + 3 in.
                if (!_coastDist.TryGetValue(tile, out var cd) || cd < radius + 1)
                {
                    continue;
                }

                anchors.Add((tile, p, i, cd + trunkBonus + ValueNoise.Hash2(tile.Q, tile.R, _seed + 73)));
            }
        }

        anchors.Sort((a, b) =>
        {
            var byScore = b.Score.CompareTo(a.Score);
            if (byScore != 0)
            {
                return byScore;
            }

            var byTile = Cmp(a.Tile, b.Tile);
            return byTile != 0 ? byTile : a.Path != b.Path ? a.Path.CompareTo(b.Path) : a.Index.CompareTo(b.Index);
        });

        var attempts = 0;
        var siteAnchors = new List<HexCoord>();
        foreach (var anchor in anchors)
        {
            if (placed >= wanted || attempts >= MaxSiteAttempts)
            {
                break;
            }

            if (siteAnchors.Any(s => HexCoord.Distance(s, anchor.Tile) < (2 * radius) + 4))
            {
                continue;
            }

            // The path may have been cut by an earlier site: find the anchor tile again.
            var pIndex = -1;
            var iIndex = -1;
            for (var p = 0; p < bp.Paths.Count && pIndex < 0; p++)
            {
                var idx = bp.Paths[p].IndexOf(anchor.Tile);
                if (idx >= 0)
                {
                    pIndex = p;
                    iIndex = idx;
                }
            }

            if (pIndex < 0 || iIndex < _options.BogMinFromSpring || iIndex > bp.Paths[pIndex].Count - 1 - _options.BogMinFromMouth)
            {
                continue;
            }

            if (!DiscIsClear(anchor.Tile, 2))
            {
                continue;
            }

            attempts++;
            count = PathCount(bp);
            var site = TryPlaceSite(
                bp, count, pIndex, iIndex, radius, large ? _options.BogLakeMaxLarge : _options.BogLakeMax, _options.BogMinFromSpring, widthTrial);
            if (site is null)
            {
                continue;
            }

            placed++;
            siteAnchors.Add(anchor.Tile);
            if (_stats is not null)
            {
                _stats.BogSites++;
            }

            if (ValueNoise.Hash2(site.Anchor.Q, site.Anchor.R, _seed + 83) < _options.BogSinkChance
                && TrySink(bp, site, radius + SinkExtraReach, widthTrial))
            {
                if (_stats is not null)
                {
                    _stats.BogSinks++;
                }
            }

            if (ValueNoise.Hash2(site.Anchor.Q, site.Anchor.R, _seed + 89) < _options.BogSpawnChance
                && TrySpawn(bp, site, widthTrial, traceRiver))
            {
                if (_stats is not null)
                {
                    _stats.BogSpawns++;
                }
            }

            BuildRegion(bp, site);
        }

        // Pockets: the nearest river within reach sinks into each.
        foreach (var site in _sites.Where(s => s.Pocket).ToList())
        {
            if (TrySink(bp, site, _options.BogMaxSinkReroute, widthTrial) && _stats is not null)
            {
                _stats.BogPocketSinks++;
            }
        }

        PlaceGuarantee(bp, widthTrial, traceRiver);
    }

    private static Dictionary<HexCoord, int> PathCount(BogPaths bp)
    {
        var count = new Dictionary<HexCoord, int>();
        foreach (var path in bp.Paths)
        {
            foreach (var t in path)
            {
                count[t] = count.GetValueOrDefault(t) + 1;
            }
        }

        return count;
    }

    private bool DiscIsClear(HexCoord anchor, int radius)
    {
        foreach (var t in anchor.WithinRadius(radius))
        {
            if (!Allowed(t))
            {
                return false;
            }
        }

        return true;
    }

    private Site? TryPlaceSite(
        BogPaths bp,
        Dictionary<HexCoord, int> count,
        int p,
        int i,
        int radius,
        int lakeMax,
        int minFromSpring,
        Func<BogPaths, List<RiverTile>> widthTrial)
    {
        var path = bp.Paths[p];
        var a = path[i];
        var disc = new HashSet<HexCoord>(a.WithinRadius(radius));

        var i0 = -1;
        var i1 = -1;
        for (var k = 0; k < path.Count; k++)
        {
            if (disc.Contains(path[k]))
            {
                if (i0 < 0)
                {
                    i0 = k;
                }

                i1 = k;
            }
        }

        if (i0 < Math.Max(2, minFromSpring + 1) || i1 > path.Count - 2)
        {
            return null;
        }

        if (bp.Merged[p] && i1 + 1 == path.Count - 1)
        {
            return null;
        }

        for (var k = i0 - 1; k <= i1 + 1; k++)
        {
            if (count[path[k]] != 1)
            {
                return null;
            }
        }

        var inP = new HashSet<HexCoord>(path);
        bool IsOther(HexCoord t) => count.GetValueOrDefault(t) - (inP.Contains(t) ? 1 : 0) > 0;
        var grown = GrowLake(a, disc, radius, lakeMax, IsOther);
        if (grown is null)
        {
            return null;
        }

        var (lake, _, mouthDir) = grown.Value;

        var up = path[i0 - 1];
        var down = path[i1 + 1];
        bool CreekOk(HexCoord t) => disc.Contains(t) && Allowed(t) && !lake.Contains(t) && !IsOther(t) && LakeMask(t, lake) == 0;

        var inRoutes = RoutesFrom(up, DirOf(up, path[i0 - 2]), CreekOk, mouthDir);
        var outRoutes = RoutesFrom(down, i1 + 2 < path.Count ? DirOf(down, path[i1 + 2]) : -1, CreekOk, mouthDir);
        if (inRoutes.Count == 0 || outRoutes.Count == 0)
        {
            return null;
        }

        var inList = inRoutes.Values.OrderBy(r => r.Tiles.Count).ThenBy(r => r.Mouth.Q).ThenBy(r => r.Mouth.R).ToList();
        var outList = outRoutes.Values.OrderBy(r => r.Tiles.Count).ThenBy(r => r.Mouth.Q).ThenBy(r => r.Mouth.R).ToList();
        Route? bestIn = null;
        Route? bestOut = null;
        var bestTotal = int.MaxValue;
        foreach (var ri in inList)
        {
            foreach (var ro in outList)
            {
                if (ri.Mouth == ro.Mouth || HexCoord.Distance(ri.Mouth, ro.Mouth) < 3)
                {
                    continue;
                }

                var total = ri.Tiles.Count + ro.Tiles.Count;
                if (total >= bestTotal)
                {
                    continue;
                }

                var overlap = false;
                foreach (var t in ri.Tiles)
                {
                    if (ro.Tiles.Contains(t) || t == ro.Mouth)
                    {
                        overlap = true;
                        break;
                    }
                }

                if (overlap || ri.Tiles.Contains(ro.Mouth))
                {
                    continue;
                }

                bestTotal = total;
                bestIn = ri;
                bestOut = ro;
            }
        }

        if (bestIn is null || bestOut is null)
        {
            return null;
        }

        // Trial: the river with its segment replaced must keep every river tile, and its upstream must widen in time.
        var trial = bp.Clone();
        var head = path.GetRange(0, i0);
        var tail = path.GetRange(i1 + 1, path.Count - i1 - 1);
        trial.Paths[p] = head;
        trial.Merged[p] = false;
        trial.Paths.Insert(p + 1, tail);
        trial.Merged.Insert(p + 1, bp.Merged[p]);
        trial.ForcedOut[up] = bestIn.Dirs[0];
        trial.RequireRiver.Add(up);
        trial.BogIn[down] = bestOut.Dirs[0];
        if (!TrialOk(trial, widthTrial, [.. head, .. tail], trial.RequireRiver))
        {
            return null;
        }

        // Commit.
        bp.Paths[p] = head;
        bp.Merged[p] = false;
        bp.Paths.Insert(p + 1, tail);
        bp.Merged.Insert(p + 1, trial.Merged[p + 1]);
        bp.ForcedOut[up] = bestIn.Dirs[0];
        bp.RequireRiver.Add(up);
        bp.BogIn[down] = bestOut.Dirs[0];

        var site = new Site { Id = _sites.Count, Anchor = a, Radius = radius, Up = up, Down = down };
        foreach (var t in lake)
        {
            site.Lake.Add(t);
            site.Core.Add(t);
            _lake.Add(t);
        }

        AddBuffer(site);
        CommitRoute(site, bestIn, forward: true, lake);
        CommitRoute(site, bestOut, forward: false, lake);
        _sites.Add(site);
        return site;
    }

    /// <summary>
    /// Grows a lake of 3 to <paramref name="lakeMax"/> (plus notch fill) tiles from <paramref name="a"/> inside <paramref name="disc"/>,
    /// fills every notch (rule R1: each shore tile touches one contiguous run of at most three lake tiles) and checks the shore is
    /// fit. Returns the lake, its shore and the mouth candidates (shore tiles with one lake neighbour, and that neighbour's direction),
    /// or null when the lake does not fit.
    /// </summary>
    private (HashSet<HexCoord> Lake, List<HexCoord> Shore, Dictionary<HexCoord, int> MouthDir)? GrowLake(
        HexCoord a,
        HashSet<HexCoord> disc,
        int radius,
        int lakeMax,
        Func<HexCoord, bool> isOther)
    {
        var target = 3 + (int)Math.Floor(ValueNoise.Hash2(a.Q, a.R, _seed + 71) * (lakeMax - 3));
        bool NearOther(HexCoord t) => isOther(t) || Nb6(t).Any(isOther);
        bool GrowOk(HexCoord t) => HexCoord.Distance(t, a) <= radius - 3 && disc.Contains(t) && Allowed(t) && !NearOther(t);

        if (!GrowOk(a))
        {
            return null;
        }

        var lake = new HashSet<HexCoord> { a };
        while (lake.Count < target)
        {
            HexCoord? best = null;
            var bestHash = -1.0;
            foreach (var t in Sorted(NeighboursOf(lake)))
            {
                if (!GrowOk(t))
                {
                    continue;
                }

                var h = ValueNoise.Hash2(t.Q, t.R, _seed + 75);
                if (h > bestHash)
                {
                    bestHash = h;
                    best = t;
                }
            }

            if (best is null)
            {
                break;
            }

            lake.Add(best.Value);
        }

        if (lake.Count < 3)
        {
            return null;
        }

        // R1: fill notches until every shore tile touches one contiguous run of at most three lake tiles.
        for (var iteration = 0; iteration < 24; iteration++)
        {
            var add = new List<HexCoord>();
            foreach (var t in Sorted(NeighboursOf(lake)))
            {
                var mask = LakeMask(t, lake);
                if (PopCount(mask) >= 4 || Runs(mask) > 1)
                {
                    add.Add(t);
                }
            }

            if (add.Count == 0)
            {
                break;
            }

            foreach (var t in add)
            {
                if (!GrowOk(t))
                {
                    return null;
                }

                lake.Add(t);
            }

            if (lake.Count > lakeMax + 6)
            {
                return null;
            }
        }

        if (lake.Count > lakeMax + 6)
        {
            return null;
        }

        var shore = Sorted(NeighboursOf(lake));
        foreach (var t in shore)
        {
            var mask = LakeMask(t, lake);
            if (PopCount(mask) > 3 || Runs(mask) != 1 || !Allowed(t) || isOther(t) || !disc.Contains(t))
            {
                return null;
            }
        }

        // Mouth candidates: a shore tile with exactly one lake neighbour.
        var mouthDir = new Dictionary<HexCoord, int>();
        foreach (var t in shore)
        {
            var mask = LakeMask(t, lake);
            if (PopCount(mask) == 1)
            {
                for (var d = 0; d < 6; d++)
                {
                    if (((mask >> d) & 1) == 1)
                    {
                        mouthDir[t] = d;
                    }
                }
            }
        }

        return (lake, shore, mouthDir);
    }

    private bool TrialOk(
        BogPaths trial,
        Func<BogPaths, List<RiverTile>> widthTrial,
        IEnumerable<HexCoord> mustSurvive,
        HashSet<HexCoord> mustBeRiver)
    {
        var tiles = widthTrial(trial);
        var byCoord = new Dictionary<HexCoord, RiverTile>(tiles.Count);
        foreach (var t in tiles)
        {
            byCoord[t.Coord] = t;
        }

        foreach (var c in mustSurvive)
        {
            if (!byCoord.ContainsKey(c))
            {
                return false;
            }
        }

        foreach (var c in mustBeRiver)
        {
            if (!byCoord.TryGetValue(c, out var tile) || tile.Width == RiverWidth.Stream)
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>
    /// Every creek route from <paramref name="start"/> (a river tile) to a mouth: a search over (tile, direction of the last
    /// step) states in which every step goes straight on or turns by 60 degrees off straight (Straight and Bend only, no hairpin),
    /// through creek-fit tiles that touch no lake tile, and ends on a mouth candidate reached heading straight at its lake edge.
    /// Returns the shortest route to each mouth reached.
    /// </summary>
    private Dictionary<HexCoord, Route> RoutesFrom(
        HexCoord start,
        int forbiddenFirstDir,
        Func<HexCoord, bool> creekOk,
        Dictionary<HexCoord, int> mouthDir)
    {
        var routes = new Dictionary<HexCoord, Route>();
        var parent = new Dictionary<(HexCoord, int), (HexCoord, int)?>();
        var depth = new Dictionary<(HexCoord, int), int>();
        var queue = new Queue<(HexCoord Tile, int Fwd)>();

        void Visit(HexCoord origin, (HexCoord, int)? fromState, int dir, int d)
        {
            var n = Nb(origin, dir);
            if (mouthDir.TryGetValue(n, out var w) && w == dir && !_mouth.ContainsKey(n))
            {
                if (!routes.ContainsKey(n))
                {
                    routes[n] = BuildRoute(n, w, fromState, dir, parent);
                }

                return;
            }

            if (d > MaxCreekLength || !creekOk(n) || _mouth.ContainsKey(n) || _creek.ContainsKey(n))
            {
                return;
            }

            var state = (n, dir);
            if (depth.ContainsKey(state))
            {
                return;
            }

            depth[state] = d;
            parent[state] = fromState;
            queue.Enqueue((n, dir));
        }

        for (var d0 = 0; d0 < 6; d0++)
        {
            if (d0 != forbiddenFirstDir)
            {
                Visit(start, null, d0, 1);
            }
        }

        while (queue.Count > 0)
        {
            var (tile, fwd) = queue.Dequeue();
            var d = depth[(tile, fwd)];
            foreach (var turn in new[] { 0, 1, 5 })
            {
                Visit(tile, (tile, fwd), (fwd + turn) % 6, d + 1);
            }
        }

        return routes;
    }

    private static Route BuildRoute(
        HexCoord mouth,
        int water,
        (HexCoord, int)? lastState,
        int lastDir,
        Dictionary<(HexCoord, int), (HexCoord, int)?> parent)
    {
        var route = new Route { Mouth = mouth, Water = water };
        route.Dirs.Add(lastDir);
        var state = lastState;
        while (state is { } s)
        {
            route.Tiles.Insert(0, s.Item1);
            route.Dirs.Insert(0, s.Item2);
            state = parent[s];
        }

        return route;
    }

    /// <summary>Records a route's creek tiles and its mouth. <paramref name="forward"/>: flow goes from the start tile into the lake.</summary>
    private void CommitRoute(Site site, Route route, bool forward, HashSet<HexCoord> lake)
    {
        // Tiles t_1..t_k, then the mouth; Dirs[j] is the direction of the step into tile j (Dirs[0] leaves the start).
        for (var j = 0; j < route.Tiles.Count; j++)
        {
            var t = route.Tiles[j];
            var toward = Opp(route.Dirs[j]);      // toward the start tile
            var away = route.Dirs[j + 1];         // toward the next tile (or the mouth)
            _creek[t] = forward ? (toward, away) : (away, toward);
            _bog.Add(t);
            site.Creeks.Add(t);
            site.Core.Add(t);
        }

        var w = route.Water;
        _mouth[route.Mouth] = forward ? (Opp(w), w, w) : (w, Opp(w), w);
        _bog.Add(route.Mouth);
        site.Creeks.Add(route.Mouth);
        site.Core.Add(route.Mouth);
        foreach (var t in NeighboursOf(lake))
        {
            _bog.Add(t);
            site.Core.Add(t);
        }
    }

    // ---------------------------------------------------------------- sink and spawn

    /// <summary>
    /// Leads the nearest other river within reach into the lake by a new inflow mouth: the river is cut at its tile nearest to
    /// the lake and its remainder dropped (only when nothing joins it there); a creek runs from the cut into a free shore.
    /// </summary>
    private bool TrySink(BogPaths bp, Site site, int reach, Func<BogPaths, List<RiverTile>> widthTrial)
    {
        var count = PathCount(bp);
        var protectedPaths = new HashSet<int>();
        for (var p = 0; p < bp.Paths.Count; p++)
        {
            if ((site.Up is { } u && bp.Paths[p].Contains(u)) || (site.Down is { } dn && bp.Paths[p].Contains(dn)))
            {
                protectedPaths.Add(p);
            }
        }

        var candidates = new List<(int Path, int Index, int Distance)>();
        for (var p = 0; p < bp.Paths.Count; p++)
        {
            if (protectedPaths.Contains(p))
            {
                continue;
            }

            var path = bp.Paths[p];
            var bestIndex = -1;
            var bestDistance = int.MaxValue;
            for (var j = _options.BogMinFromSpring; j < path.Count; j++)
            {
                var d = MinDistance(path[j], site.Lake);
                if (d <= reach && d < bestDistance)
                {
                    bestDistance = d;
                    bestIndex = j;
                }
            }

            if (bestIndex >= 0)
            {
                candidates.Add((p, bestIndex, bestDistance));
            }
        }

        candidates.Sort((x, y) =>
        {
            var byDistance = x.Distance.CompareTo(y.Distance);
            return byDistance != 0 ? byDistance : x.Path.CompareTo(y.Path);
        });

        var lake = site.Lake;
        var mouthDir = new Dictionary<HexCoord, int>();
        var lakeMouths = _mouth.Keys.Where(m => LakeMask(m, lake) != 0).ToList();
        foreach (var t in Sorted(NeighboursOf(lake)))
        {
            var mask = LakeMask(t, lake);
            if (PopCount(mask) != 1 || _mouth.ContainsKey(t) || _creek.ContainsKey(t) || !_islandLand.Contains(t))
            {
                continue;
            }

            // The mouths of one lake keep three apart.
            if (lakeMouths.Any(m => HexCoord.Distance(m, t) < 3))
            {
                continue;
            }

            for (var d = 0; d < 6; d++)
            {
                if (((mask >> d) & 1) == 1)
                {
                    mouthDir[t] = d;
                }
            }
        }

        if (mouthDir.Count == 0)
        {
            return false;
        }

        var tried = 0;
        foreach (var (p, j, _) in candidates)
        {
            if (tried++ >= 4)
            {
                break;
            }

            var path = bp.Paths[p];
            var t = path[j];
            if (count[t] != 1)
            {
                continue;
            }

            // Nothing may join the part that is dropped.
            var dependents = false;
            var removed = new HashSet<HexCoord>(path.Skip(j + 1));
            if (bp.Merged[p] && removed.Count > 0)
            {
                removed.Remove(path[^1]);
            }

            for (var q = 0; q < bp.Paths.Count && !dependents; q++)
            {
                if (q != p && bp.Merged[q] && removed.Contains(bp.Paths[q][^1]))
                {
                    dependents = true;
                }
            }

            if (dependents)
            {
                continue;
            }

            var occupied = new HashSet<HexCoord>(count.Keys);
            bool CreekOk(HexCoord c) =>
                (site.Ring.Contains(c) || Allowed(c, site.Id))
                && !lake.Contains(c) && !occupied.Contains(c) && LakeMask(c, lake) == 0
                && HexCoord.Distance(c, t) <= reach + MaxCreekLength;

            var routes = RoutesFrom(t, DirOf(t, path[j - 1]), CreekOk, mouthDir);
            if (routes.Count == 0)
            {
                continue;
            }

            var route = routes.Values.OrderBy(r => r.Tiles.Count).ThenBy(r => r.Mouth.Q).ThenBy(r => r.Mouth.R).First();
            var trial = bp.Clone();
            trial.Paths[p] = path.GetRange(0, j + 1);
            trial.Merged[p] = false;
            trial.ForcedOut[t] = route.Dirs[0];
            trial.RequireRiver.Add(t);
            if (!TrialOk(trial, widthTrial, trial.Paths[p], trial.RequireRiver))
            {
                continue;
            }

            bp.Paths[p] = trial.Paths[p];
            bp.Merged[p] = false;
            bp.ForcedOut[t] = route.Dirs[0];
            bp.RequireRiver.Add(t);
            CommitRoute(site, route, forward: true, lake);
            return true;
        }

        return false;
    }

    /// <summary>
    /// A creek spring inside the bog (at least three from the lake) whose creek leaves the bog and continues as a normal
    /// river traced with the drainage tracer (it may join a trunk).
    /// </summary>
    private bool TrySpawn(
        BogPaths bp,
        Site site,
        Func<BogPaths, List<RiverTile>> widthTrial,
        Func<HexCoord, int, BogPaths, HashSet<HexCoord>, List<HexCoord>?> traceRiver)
    {
        var region = ProvisionalRegion(bp, site);
        var count = PathCount(bp);
        var lake = site.Lake;
        var springCandidates = region
            .Where(t => !_creek.ContainsKey(t) && !_mouth.ContainsKey(t) && MinDistance(t, lake) >= 3
                && MinDistance(t, site.Creeks) >= 2 && !count.ContainsKey(t))
            .OrderByDescending(t => ValueNoise.Hash2(t.Q, t.R, _seed + 97))
            .ThenBy(t => t.Q)
            .ThenBy(t => t.R)
            .Take(3)
            .ToList();

        foreach (var s in springCandidates)
        {
            bool CreekOk(HexCoord c) => region.Contains(c) && !count.ContainsKey(c) && !lake.Contains(c) && LakeMask(c, lake) == 0
                && !_creek.ContainsKey(c) && !_mouth.ContainsKey(c);

            // Breadth-first over (tile, heading), exits are tiles just outside the region.
            var parent = new Dictionary<(HexCoord, int), (HexCoord, int)?>();
            var depth = new Dictionary<(HexCoord, int), int>();
            var queue = new Queue<(HexCoord Tile, int Fwd)>();
            var exits = new List<(HexCoord Exit, int Dir, (HexCoord, int)? From)>();

            void Visit(HexCoord origin, (HexCoord, int)? fromState, int dir, int d)
            {
                var n = Nb(origin, dir);
                if (!_islandLand.Contains(n) || n == s || d > MaxCreekLength)
                {
                    return;
                }

                if (!region.Contains(n))
                {
                    if (!count.ContainsKey(n) && !_bog.Contains(n) && !_lake.Contains(n) && LakeMask(n, lake) == 0
                        && !PocketRing.Contains(n))
                    {
                        exits.Add((n, dir, fromState));
                    }

                    return;
                }

                if (!CreekOk(n) || depth.ContainsKey((n, dir)))
                {
                    return;
                }

                depth[(n, dir)] = d;
                parent[(n, dir)] = fromState;
                queue.Enqueue((n, dir));
            }

            for (var d0 = 0; d0 < 6; d0++)
            {
                Visit(s, null, d0, 1);
            }

            while (queue.Count > 0 && exits.Count < 4)
            {
                var (tile, fwd) = queue.Dequeue();
                var d = depth[(tile, fwd)];
                foreach (var turn in new[] { 0, 1, 5 })
                {
                    Visit(tile, (tile, fwd), (fwd + turn) % 6, d + 1);
                }
            }

            foreach (var (exit, dir, from) in exits.Take(4))
            {
                var route = BuildRoute(exit, dir, from, dir, parent);
                var blocked = new HashSet<HexCoord>(_bog);
                foreach (var t in _lake)
                {
                    blocked.Add(t);
                }

                foreach (var t in route.Tiles)
                {
                    blocked.Add(t);
                }

                blocked.Add(s);
                var traced = traceRiver(exit, Opp(dir), bp, blocked);
                if (traced is null)
                {
                    continue;
                }

                var trial = bp.Clone();
                trial.Paths.Add(traced);
                trial.Merged.Add(count.ContainsKey(traced[^1]));
                trial.BogIn[exit] = Opp(dir);

                // A tile of the new river that is also on another path is a junction; the rest must survive the width pass.
                if (!TrialOk(trial, widthTrial, traced.Where(c => !count.ContainsKey(c)), trial.RequireRiver))
                {
                    continue;
                }

                bp.Paths.Add(traced);
                bp.Merged.Add(count.ContainsKey(traced[^1]));
                bp.BogIn[exit] = Opp(dir);

                // Creek: spring s, tiles t_1..t_k, then the river at `exit`.
                _spring[s] = route.Dirs[0];
                _bog.Add(s);
                site.Creeks.Add(s);
                site.Core.Add(s);
                for (var j = 0; j < route.Tiles.Count; j++)
                {
                    var t = route.Tiles[j];
                    _creek[t] = (Opp(route.Dirs[j]), route.Dirs[j + 1]);
                    _bog.Add(t);
                    site.Creeks.Add(t);
                    site.Core.Add(t);
                }

                return true;
            }
        }

        return false;
    }

    // ---------------------------------------------------------------- guarantee

    /// <summary>
    /// Landing-spot candidates by terrain alone (the rules of <c>WorldGenerator.FindStartPositions</c> minus giants, strong camps and the
    /// bog rule, which do not exist yet at this point): grass with a forest and two grass neighbours and no water within two.
    /// </summary>
    private List<HexCoord> GuaranteeCandidates()
    {
        var result = new List<HexCoord>();
        foreach (var tile in _islandTiles)
        {
            if (_land[tile] != Terrain.Grass)
            {
                continue;
            }

            var forest = 0;
            var grass = 0;
            for (var d = 0; d < 6; d++)
            {
                if (_land.TryGetValue(Nb(tile, d), out var terrain))
                {
                    if (terrain == Terrain.Forest)
                    {
                        forest++;
                    }
                    else if (terrain == Terrain.Grass)
                    {
                        grass++;
                    }
                }
            }

            if (forest < 1 || grass < 2)
            {
                continue;
            }

            var coastal = false;
            foreach (var nearby in tile.WithinRadius(2))
            {
                if (!_land.ContainsKey(nearby))
                {
                    coastal = true;
                    break;
                }
            }

            if (!coastal)
            {
                result.Add(tile);
            }
        }

        return result;
    }

    /// <summary>Whether <paramref name="c"/> is still a candidate with the bog placed so far laid over the terrain.</summary>
    private bool StillCandidate(HexCoord c)
    {
        if (_bog.Contains(c) || _lake.Contains(c))
        {
            return false;
        }

        var forest = 0;
        var grass = 0;
        for (var d = 0; d < 6; d++)
        {
            var n = Nb(c, d);
            if (!_land.TryGetValue(n, out var terrain) || _lake.Contains(n) || _bog.Contains(n))
            {
                continue;
            }

            if (terrain == Terrain.Forest)
            {
                forest++;
            }
            else if (terrain == Terrain.Grass)
            {
                grass++;
            }
        }

        if (forest < 1 || grass < 2)
        {
            return false;
        }

        foreach (var nearby in c.WithinRadius(2))
        {
            if (_lake.Contains(nearby))
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>How many of the candidates are still candidates and have plain bog moss within <paramref name="reach"/> of them.</summary>
    private int CoveredCandidates(List<HexCoord> candidates, int reach)
    {
        var reachSet = new HashSet<HexCoord>();
        foreach (var t in _bog)
        {
            if (_lake.Contains(t) || _creek.ContainsKey(t) || _mouth.ContainsKey(t) || _spring.ContainsKey(t) || LakeMask(t, _lake) != 0)
            {
                continue;
            }

            foreach (var n in t.WithinRadius(reach))
            {
                reachSet.Add(n);
            }
        }

        if (reachSet.Count == 0)
        {
            return 0;
        }

        var covered = 0;
        foreach (var c in candidates)
        {
            if (reachSet.Contains(c) && StillCandidate(c))
            {
                covered++;
            }
        }

        return covered;
    }

    /// <summary>For every tile, how many candidates lie within <paramref name="reach"/> of it.</summary>
    private static Dictionary<HexCoord, int> CoverageMap(List<HexCoord> candidates, int reach)
    {
        var map = new Dictionary<HexCoord, int>();
        foreach (var c in candidates)
        {
            foreach (var n in c.WithinRadius(reach))
            {
                map[n] = map.GetValueOrDefault(n) + 1;
            }
        }

        return map;
    }

    private sealed class Saved
    {
        public required HashSet<HexCoord> Lake;
        public required HashSet<HexCoord> Bog;
        public required Dictionary<HexCoord, int> Buffer;
        public required Dictionary<HexCoord, (int In, int Out)> Creek;
        public required Dictionary<HexCoord, (int In, int Out, int Water)> Mouth;
        public required Dictionary<HexCoord, int> Spring;
        public required int Sites;
        public required BogPaths Paths;
    }

    private Saved Save(BogPaths bp) => new()
    {
        Lake = [.. _lake],
        Bog = [.. _bog],
        Buffer = new Dictionary<HexCoord, int>(_lakeBuffer),
        Creek = new Dictionary<HexCoord, (int In, int Out)>(_creek),
        Mouth = new Dictionary<HexCoord, (int In, int Out, int Water)>(_mouth),
        Spring = new Dictionary<HexCoord, int>(_spring),
        Sites = _sites.Count,
        Paths = bp.Clone(),
    };

    private void Restore(Saved saved, BogPaths bp)
    {
        _lake.Clear();
        _lake.UnionWith(saved.Lake);
        _bog.Clear();
        _bog.UnionWith(saved.Bog);
        _lakeBuffer.Clear();
        foreach (var kv in saved.Buffer)
        {
            _lakeBuffer[kv.Key] = kv.Value;
        }

        _creek.Clear();
        foreach (var kv in saved.Creek)
        {
            _creek[kv.Key] = kv.Value;
        }

        _mouth.Clear();
        foreach (var kv in saved.Mouth)
        {
            _mouth[kv.Key] = kv.Value;
        }

        _spring.Clear();
        foreach (var kv in saved.Spring)
        {
            _spring[kv.Key] = kv.Value;
        }

        _sites.RemoveRange(saved.Sites, _sites.Count - saved.Sites);
        bp.Paths.Clear();
        bp.Merged.Clear();
        bp.ForcedOut.Clear();
        bp.BogIn.Clear();
        bp.RequireRiver.Clear();
        foreach (var path in saved.Paths.Paths)
        {
            bp.Paths.Add(new List<HexCoord>(path));
        }

        bp.Merged.AddRange(saved.Paths.Merged);
        foreach (var kv in saved.Paths.ForcedOut)
        {
            bp.ForcedOut[kv.Key] = kv.Value;
        }

        foreach (var kv in saved.Paths.BogIn)
        {
            bp.BogIn[kv.Key] = kv.Value;
        }

        bp.RequireRiver.UnionWith(saved.Paths.RequireRiver);
    }

    /// <summary>
    /// The bog guarantee (<c>docs/design/bog.md</c>): an island with a landing-spot candidate that has no plain bog within
    /// <see cref="WorldGenerationOptions.BogReach"/> of one gets a bog after the normal placement. Anchors are tried best-covered
    /// first (most candidates within reach). First a through-river site with relaxed criteria, else a spawn bog; a bog that
    /// would leave no candidate covered is rolled back.
    /// </summary>
    /// <summary>Whether the guarantee is switched on for this island (by the options and the island's size).</summary>
    public bool GuaranteeApplies =>
        _options.BogGuaranteeMinTiles > 0 && _options.BogReach > 0 && _islandTiles.Count >= _options.BogGuaranteeMinTiles;

    /// <summary>The guarantee alone, for an island with no river candidates at all (no mountains): no site to place, only a spawn bog.</summary>
    public void PlaceGuaranteeOnly(
        BogPaths bp,
        Func<BogPaths, List<RiverTile>> widthTrial,
        Func<HexCoord, int, BogPaths, HashSet<HexCoord>, List<HexCoord>?> traceRiver) =>
        PlaceGuarantee(bp, widthTrial, traceRiver);

    private void PlaceGuarantee(
        BogPaths bp,
        Func<BogPaths, List<RiverTile>> widthTrial,
        Func<HexCoord, int, BogPaths, HashSet<HexCoord>, List<HexCoord>?> traceRiver)
    {
        var reach = _options.BogReach;
        if (!GuaranteeApplies)
        {
            return;
        }

        var candidates = GuaranteeCandidates();
        if (candidates.Count == 0 || CoveredCandidates(candidates, reach) > 0)
        {
            return;
        }

        if (_stats is not null)
        {
            _stats.BogGuaranteeIslands++;
            if (_sites.Count == 0)
            {
                _stats.BogGuaranteeWithoutBog++;
            }
        }

        var coverage = CoverageMap(candidates, reach);
        if (GuaranteeThrough(bp, candidates, coverage, widthTrial))
        {
            if (_stats is not null)
            {
                _stats.BogGuaranteeThrough++;
            }

            return;
        }

        if (GuaranteeSpawn(bp, candidates, coverage, widthTrial, traceRiver))
        {
            if (_stats is not null)
            {
                _stats.BogGuaranteeSpawns++;
            }

            return;
        }

        if (_stats is not null)
        {
            _stats.BogGuaranteeMissed++;
        }
    }

    private bool GuaranteeThrough(
        BogPaths bp,
        List<HexCoord> candidates,
        Dictionary<HexCoord, int> coverage,
        Func<BogPaths, List<RiverTile>> widthTrial)
    {
        var radius = _options.BogGuaranteeRadius;
        var anchors = new List<(HexCoord Tile, int Path, int Index, int Cover, double Hash)>();
        for (var p = 0; p < bp.Paths.Count; p++)
        {
            var path = bp.Paths[p];
            for (var i = GuaranteeMinFromSpring; i <= path.Count - 1 - GuaranteeMinFromMouth; i++)
            {
                var tile = path[i];
                var cover = coverage.GetValueOrDefault(tile);
                if (cover == 0 || !_coastDist.TryGetValue(tile, out var cd) || cd < GuaranteeMinCoastDist)
                {
                    continue;
                }

                anchors.Add((tile, p, i, cover, ValueNoise.Hash2(tile.Q, tile.R, _seed + 103)));
            }
        }

        anchors.Sort((a, b) =>
        {
            var byCover = b.Cover.CompareTo(a.Cover);
            if (byCover != 0)
            {
                return byCover;
            }

            var byHash = b.Hash.CompareTo(a.Hash);
            if (byHash != 0)
            {
                return byHash;
            }

            var byTile = Cmp(a.Tile, b.Tile);
            return byTile != 0 ? byTile : a.Path != b.Path ? a.Path.CompareTo(b.Path) : a.Index.CompareTo(b.Index);
        });

        var attempts = 0;
        foreach (var anchor in anchors)
        {
            if (attempts >= MaxSiteAttempts)
            {
                break;
            }

            if (!DiscIsClear(anchor.Tile, 2))
            {
                continue;
            }

            attempts++;
            var saved = Save(bp);
            var site = TryPlaceSite(
                bp, PathCount(bp), anchor.Path, anchor.Index, radius, GuaranteeLakeMax, GuaranteeMinFromSpring, widthTrial);
            if (site is not null)
            {
                BuildRegion(bp, site);
                if (CoveredCandidates(candidates, _options.BogReach) > 0)
                {
                    return true;
                }

            }

            Restore(saved, bp);
        }

        return false;
    }

    private bool GuaranteeSpawn(
        BogPaths bp,
        List<HexCoord> candidates,
        Dictionary<HexCoord, int> coverage,
        Func<BogPaths, List<RiverTile>> widthTrial,
        Func<HexCoord, int, BogPaths, HashSet<HexCoord>, List<HexCoord>?> traceRiver)
    {
        var count = PathCount(bp);
        var anchors = new List<(HexCoord Tile, int Cover, double Hash)>();
        foreach (var tile in _islandTiles)
        {
            var cover = coverage.GetValueOrDefault(tile);
            if (cover == 0 || !_coastDist.TryGetValue(tile, out var cd) || cd < GuaranteeMinCoastDist || !Allowed(tile))
            {
                continue;
            }

            anchors.Add((tile, cover, ValueNoise.Hash2(tile.Q, tile.R, _seed + 107)));
        }

        anchors.Sort((a, b) =>
        {
            var byCover = b.Cover.CompareTo(a.Cover);
            if (byCover != 0)
            {
                return byCover;
            }

            var byHash = b.Hash.CompareTo(a.Hash);
            return byHash != 0 ? byHash : Cmp(a.Tile, b.Tile);
        });

        var attempts = 0;
        foreach (var anchor in anchors)
        {
            if (attempts >= MaxSpawnAttempts)
            {
                break;
            }

            if (anchor.Tile.WithinRadius(3).Any(count.ContainsKey))
            {
                continue;
            }

            attempts++;
            var saved = Save(bp);
            if (TrySpawnSite(bp, anchor.Tile, widthTrial, traceRiver))
            {
                if (CoveredCandidates(candidates, _options.BogReach) > 0)
                {
                    return true;
                }

            }

            Restore(saved, bp);
        }

        return false;
    }

    /// <summary>
    /// A small bog on river-free ground: a lake, a creek from a spring inside the disc into one mouth, and a creek out of another mouth
    /// that leaves the disc and continues as a normal river to the sea (or a trunk). The river that runs through the lake is the
    /// spawned one. Commits only when the river traces and every width check holds.
    /// </summary>
    private bool TrySpawnSite(
        BogPaths bp,
        HexCoord a,
        Func<BogPaths, List<RiverTile>> widthTrial,
        Func<HexCoord, int, BogPaths, HashSet<HexCoord>, List<HexCoord>?> traceRiver)
    {
        var radius = _options.BogGuaranteeRadius;
        var count = PathCount(bp);
        bool IsOther(HexCoord t) => count.ContainsKey(t);
        var disc = new HashSet<HexCoord>(a.WithinRadius(radius));
        var grown = GrowLake(a, disc, radius, GuaranteeLakeMax, IsOther);
        if (grown is null)
        {
            return false;
        }

        var (lake, _, mouthDir) = grown.Value;
        bool CreekOk(HexCoord t) => disc.Contains(t) && Allowed(t) && !lake.Contains(t) && !IsOther(t) && LakeMask(t, lake) == 0;

        var springs = Sorted(disc)
            .Where(t => CreekOk(t) && MinDistance(t, lake) >= 3)
            .OrderByDescending(t => ValueNoise.Hash2(t.Q, t.R, _seed + 109))
            .ThenBy(t => t.Q)
            .ThenBy(t => t.R)
            .Take(MaxSpringCandidates)
            .ToList();

        foreach (var s in springs)
        {
            var inRoutes = RoutesFrom(s, -1, CreekOk, mouthDir);
            if (inRoutes.Count == 0)
            {
                continue;
            }


            var inRoute = inRoutes.Values.OrderBy(r => r.Tiles.Count).ThenBy(r => r.Mouth.Q).ThenBy(r => r.Mouth.R).First();
            var taken = new HashSet<HexCoord>(inRoute.Tiles) { s, inRoute.Mouth };
            bool OutOk(HexCoord t) => CreekOk(t) && !taken.Contains(t);

            foreach (var mouth in Sorted(mouthDir.Keys))
            {
                if (mouth == inRoute.Mouth || HexCoord.Distance(mouth, inRoute.Mouth) < 3)
                {
                    continue;
                }

                var water = mouthDir[mouth];
                var exits = OutflowExits(mouth, Opp(water), lake, disc, count, taken, OutOk, out var parent);
                foreach (var (exit, dir, from) in exits.Take(4))
                {
                    var flow = BuildRoute(exit, dir, from, dir, parent);
                    var blocked = new HashSet<HexCoord>(_bog);
                    blocked.UnionWith(_lake);
                    blocked.UnionWith(lake);
                    blocked.UnionWith(NeighboursOf(lake));
                    blocked.UnionWith(taken);
                    blocked.UnionWith(flow.Tiles);
                    blocked.Add(mouth);
                    var traced = traceRiver(exit, Opp(dir), bp, blocked);
                    if (traced is null)
                    {
                        continue;
                    }

                    var trial = bp.Clone();
                    trial.Paths.Add(traced);
                    trial.Merged.Add(count.ContainsKey(traced[^1]));
                    trial.BogIn[exit] = Opp(dir);
                    if (!TrialOk(trial, widthTrial, traced.Where(c => !count.ContainsKey(c)), trial.RequireRiver))
                    {
                        continue;
                    }

                    // Commit: the lake, the spring's creek into it, the creek out of it (reversed: it is laid out from the river tile).
                    var site = new Site { Id = _sites.Count, Anchor = a, Radius = radius };
                    foreach (var t in lake)
                    {
                        site.Lake.Add(t);
                        site.Core.Add(t);
                        _lake.Add(t);
                    }

                    AddBuffer(site);
                    _spring[s] = inRoute.Dirs[0];
                    _bog.Add(s);
                    site.Creeks.Add(s);
                    site.Core.Add(s);
                    CommitRoute(site, inRoute, forward: true, lake);

                    var back = new Route { Mouth = mouth, Water = water };
                    for (var j = flow.Tiles.Count - 1; j >= 0; j--)
                    {
                        back.Tiles.Add(flow.Tiles[j]);
                    }

                    for (var j = flow.Dirs.Count - 1; j >= 0; j--)
                    {
                        back.Dirs.Add(Opp(flow.Dirs[j]));
                    }

                    CommitRoute(site, back, forward: false, lake);
                    _sites.Add(site);

                    bp.Paths.Add(traced);
                    bp.Merged.Add(count.ContainsKey(traced[^1]));
                    bp.BogIn[exit] = Opp(dir);
                    BuildRegion(bp, site);
                    return true;
                }
            }
        }

        return false;
    }

    /// <summary>
    /// The tiles just outside the disc that a creek leaving <paramref name="mouth"/> in direction <paramref name="first"/> can reach
    /// through creek-fit tiles (straight or 60 degrees off straight per step), first found first; <paramref name="parent"/> holds the search tree.
    /// </summary>
    private List<(HexCoord Exit, int Dir, (HexCoord, int)? From)> OutflowExits(
        HexCoord mouth,
        int first,
        HashSet<HexCoord> lake,
        HashSet<HexCoord> disc,
        Dictionary<HexCoord, int> count,
        HashSet<HexCoord> taken,
        Func<HexCoord, bool> creekOk,
        out Dictionary<(HexCoord, int), (HexCoord, int)?> parent)
    {
        var parents = new Dictionary<(HexCoord, int), (HexCoord, int)?>();
        parent = parents;
        var depth = new Dictionary<(HexCoord, int), int>();
        var queue = new Queue<(HexCoord Tile, int Fwd)>();
        var exits = new List<(HexCoord Exit, int Dir, (HexCoord, int)? From)>();

        void Visit(HexCoord origin, (HexCoord, int)? fromState, int dir, int d)
        {
            var n = Nb(origin, dir);
            if (!_islandLand.Contains(n) || d > MaxCreekLength)
            {
                return;
            }

            // A creek tile stays inside the disc on fit ground; anything else that is free land is where the river starts (near the
            // coast that is a tile the creek may not use: the river there is only a tile or two long).
            if (disc.Contains(n) && creekOk(n))
            {
                if (depth.ContainsKey((n, dir)))
                {
                    return;
                }

                depth[(n, dir)] = d;
                parents[(n, dir)] = fromState;
                queue.Enqueue((n, dir));
                return;
            }

            if (!taken.Contains(n) && !count.ContainsKey(n) && !_bog.Contains(n) && !_lake.Contains(n) && !_lakeBuffer.ContainsKey(n)
                && !lake.Contains(n) && LakeMask(n, lake) == 0 && !PocketRing.Contains(n))
            {
                exits.Add((n, dir, fromState));
            }

            return;
        }

        Visit(mouth, null, first, 1);
        while (queue.Count > 0 && exits.Count < 4)
        {
            var (tile, fwd) = queue.Dequeue();
            var d = depth[(tile, fwd)];
            foreach (var turn in new[] { 0, 1, 5 })
            {
                Visit(tile, (tile, fwd), (fwd + turn) % 6, d + 1);
            }
        }

        return exits;
    }

    // ---------------------------------------------------------------- region

    private HashSet<HexCoord> ProvisionalRegion(BogPaths bp, Site site) => ComputeRegion(bp, site);

    private void BuildRegion(BogPaths bp, Site site)
    {
        foreach (var t in ComputeRegion(bp, site))
        {
            if (!site.Lake.Contains(t))
            {
                _bog.Add(t);
            }
        }
    }

    /// <summary>
    /// The bog moss of a site: everything within a noisy reach of the lake and the creeks, restricted to fit tiles and never on or
    /// beside a river that is not this bog's own; always the core (lake, shores, creeks, mouths).
    /// </summary>
    private HashSet<HexCoord> ComputeRegion(BogPaths bp, Site site)
    {
        var count = PathCount(bp);
        var reach = site.Radius - 2;
        var dist = new Dictionary<HexCoord, int>();
        var queue = new Queue<HexCoord>();
        foreach (var t in Sorted(site.Core.Concat(site.Lake)))
        {
            dist[t] = 0;
            queue.Enqueue(t);
        }

        while (queue.Count > 0)
        {
            var c = queue.Dequeue();
            var dc = dist[c];
            if (dc >= reach)
            {
                continue;
            }

            for (var d = 0; d < 6; d++)
            {
                var n = Nb(c, d);
                if (!dist.ContainsKey(n))
                {
                    dist[n] = dc + 1;
                    queue.Enqueue(n);
                }
            }
        }

        bool Fit(HexCoord t)
        {
            if (!_islandLand.Contains(t) || _land[t] is not (Terrain.Grass or Terrain.Forest))
            {
                return false;
            }

            if (!_coastDist.TryGetValue(t, out var cd) || cd <= 2)
            {
                return false;
            }

            if (count.ContainsKey(t) || _lake.Contains(t) || (_lakeBuffer.TryGetValue(t, out var owner) && owner != site.Id))
            {
                return false;
            }

            foreach (var n in Nb6(t))
            {
                if (count.ContainsKey(n))
                {
                    return false;
                }
            }

            // Another bog's moss (not this site's own) is never taken over.
            return !_bog.Contains(t) || site.Core.Contains(t) || site.Ring.Contains(t);
        }

        var region = new HashSet<HexCoord>(site.Core);
        foreach (var t in Sorted(dist.Keys))
        {
            var d = dist[t];
            if (d == 0 || region.Contains(t))
            {
                continue;
            }

            if (!Fit(t))
            {
                continue;
            }

            if (d == 1 || ValueNoise.Sample(t.Q, t.R, _seed + 79, 3.0) > (d - 1.0) / reach)
            {
                region.Add(t);
            }
        }

        // Keep only what connects to the core.
        var kept = new HashSet<HexCoord>();
        var stack = new Stack<HexCoord>();
        foreach (var t in Sorted(site.Core))
        {
            if (kept.Add(t))
            {
                stack.Push(t);
            }
        }

        while (stack.Count > 0)
        {
            var c = stack.Pop();
            foreach (var n in Nb6(c))
            {
                if (region.Contains(n) && kept.Add(n))
                {
                    stack.Push(n);
                }
            }
        }

        return kept;
    }

    // ---------------------------------------------------------------- output

    /// <summary>Every bog tile classified by what art it needs, sorted by (Q, R).</summary>
    public List<BogTile> Classify()
    {
        var tiles = new List<BogTile>(_bog.Count + _lake.Count);
        foreach (var t in Sorted(_lake))
        {
            tiles.Add(new BogTile(t, BogTileKind.Lake, [], null, []));
        }

        foreach (var t in Sorted(_bog))
        {
            if (_lake.Contains(t))
            {
                continue;
            }

            var mask = LakeMask(t, _lake);
            var edges = WaterRun(mask);
            if (_mouth.TryGetValue(t, out var m))
            {
                tiles.Add(new BogTile(t, BogTileKind.Mouth, [(TileOrientation)m.In], (TileOrientation)m.Out, [(TileOrientation)m.Water]));
            }
            else if (_creek.TryGetValue(t, out var c))
            {
                tiles.Add(new BogTile(t, BogTileKind.Creek, [(TileOrientation)c.In], (TileOrientation)c.Out, []));
            }
            else if (_spring.TryGetValue(t, out var s))
            {
                tiles.Add(new BogTile(t, BogTileKind.CreekSpring, [], (TileOrientation)s, []));
            }
            else
            {
                var kind = edges.Count switch
                {
                    0 => BogTileKind.Bog,
                    1 => BogTileKind.Inlet,
                    2 => BogTileKind.Shore,
                    _ => BogTileKind.Half,
                };
                tiles.Add(new BogTile(t, kind, [], null, [.. edges.Select(d => (TileOrientation)d)]));
            }
        }

        tiles.Sort((a, b) => Cmp(a.Coord, b.Coord));
        return tiles;
    }

    /// <summary>The directions of a contiguous water run in ascending cyclic order, starting where the run starts.</summary>
    internal static List<int> WaterRun(int mask)
    {
        var run = new List<int>();
        if (mask == 0)
        {
            return run;
        }

        var start = 0;
        for (var d = 0; d < 6; d++)
        {
            if (((mask >> d) & 1) == 1 && ((mask >> ((d + 5) % 6)) & 1) == 0)
            {
                start = d;
                break;
            }
        }

        for (var k = 0; k < 6; k++)
        {
            var d = (start + k) % 6;
            if (((mask >> d) & 1) == 1)
            {
                run.Add(d);
            }
            else
            {
                break;
            }
        }

        return run;
    }
}
