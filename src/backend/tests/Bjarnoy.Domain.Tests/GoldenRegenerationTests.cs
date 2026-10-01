using System.Text;
using System.Text.Json;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// One-off fixture generators, skipped unless <c>BJARNOY_REGEN_GOLDENS=1</c>. They are how
/// <c>src/shared/river-generation-golden.json</c> is (re)built after an intentional change to
/// the terrain function: the scenarios are real islands from real
/// <see cref="WorldGenerator.Generate"/> runs at the default world size, so the tiles, the
/// terrain and the depth field all agree with what a live world produces.
/// <para>
/// <c>BJARNOY_REGEN_GOLDENS=1 dotnet test --project tests/Bjarnoy.Domain.Tests -c Release
/// --filter-class "*GoldenRegenerationTests"</c>, then run the frontend's golden suites
/// (<c>npx vitest run src/lib/map/riverGenerator.golden.test.ts</c>) and the
/// <c>RiverGenerationGoldenTests</c> — both sides must pass against the regenerated file.
/// The terrain-derived fixtures (island shape, terrain checksums, wasted terrain) are
/// generated from the frontend instead: <c>scripts/regen-goldens/</c>.
/// </para>
/// </summary>
public class GoldenRegenerationTests
{
    private const string EnvVar = "BJARNOY_REGEN_GOLDENS";

    private sealed record Candidate(int Seed, GeneratedIsland Island);

    [Fact]
    public void Regenerate_river_generation_golden()
    {
        Assert.SkipUnless(Environment.GetEnvironmentVariable(EnvVar) == "1", $"set {EnvVar}=1 to regenerate");

        var candidates = new List<Candidate>();
        for (var seed = 1; seed <= 40; seed++)
        {
            var world = new WorldGenerator(TestWorlds.Options(seed)).Generate(TestContext.Current.CancellationToken);
            candidates.AddRange(world.Islands.Where(i => i.RiverTiles.Count > 0).Select(i => new Candidate(seed, i)));
        }

        static bool Has(GeneratedIsland i, RiverTileShape shape) => i.RiverTiles.Any(t => t.Shape == shape);

        // Valley streams only happen on big islands with a mountain-enclosed valley, so the search is limited to seeds 1-8.
        static bool CarvesValleyStream(Candidate c)
        {
            if (c.Island.IsWasted || c.Seed > 8)
            {
                return false;
            }

            var options = TestWorlds.Options(c.Seed);
            var sampler = new TerrainSampler(options);
            var land = c.Island.Tiles.ToDictionary(t => t, t => sampler.TerrainAt(t));
            var stats = new RiverGenerator.RiverStats();
            RiverGenerator.GenerateWithBogs(c.Island.Tiles, land, sampler, options, c.Island.Index, stats: stats);
            return stats.ValleyStreams > 0;
        }

        Candidate Smallest(string what, Func<Candidate, bool> filter) =>
            candidates.Where(filter).OrderBy(c => c.Island.TileCount).ThenBy(c => c.Seed).FirstOrDefault()
            ?? throw new InvalidOperationException($"no candidate island for '{what}' in seeds 1-40");

        var scenarios = new (string Name, Candidate Pick)[]
        {
            ("green_island_smallest_network", Smallest("smallest", c => !c.Island.IsWasted)),
            ("green_island_confluence", Smallest("confluence", c => !c.Island.IsWasted && Has(c.Island, RiverTileShape.Confluence))),
            ("green_island_bend60", Smallest("bend60", c => !c.Island.IsWasted && Has(c.Island, RiverTileShape.Bend60))),
            ("green_island_widening_straight", Smallest("widening straight", c => !c.Island.IsWasted
                && c.Island.RiverTiles.Any(t => t.Shape == RiverTileShape.Straight && t.Width == RiverWidth.Widen))),
            ("green_island_stream_confluence", Smallest("stream confluence", c => !c.Island.IsWasted
                && c.Island.RiverTiles.Any(t => t.Shape == RiverTileShape.Confluence && t.Width == RiverWidth.Widen))),
            ("green_island_river_confluence", Smallest("river confluence", c => !c.Island.IsWasted
                && c.Island.RiverTiles.Any(t => t.Shape == RiverTileShape.Confluence && t.Width == RiverWidth.River))),
            ("green_island_riverstream_confluence", Smallest("river-stream confluence", c => !c.Island.IsWasted
                && c.Island.RiverTiles.Any(t => t.Shape == RiverTileShape.Confluence && t.Width == RiverWidth.RiverStream))),
            ("green_island_widening_mouth", Smallest("widening mouth", c => !c.Island.IsWasted
                && c.Island.RiverTiles.Any(t => t.Shape == RiverTileShape.Mouth && t.Width == RiverWidth.Widen))),
            ("green_island_valley_stream", Smallest("valley stream", CarvesValleyStream)),
            ("wasted_island_lava_stream", Smallest("wasted", c => c.Island.IsWasted)),
        };

        var options = new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        var sb = new StringBuilder();
        sb.Append("{\n  \"_comment\": ").Append(JsonSerializer.Serialize(
            "Cross-language parity fixture for river generation (RiverGenerator.Generate backend / generateRivers frontend): given an island's tiles (with terrain), a world seed, an island index, and wasted/allowConfluence flags, both sides must trace the same rivers in the same order. Covers: the smallest green island that keeps any rivers (a small drainage network), a stream that widens on a straight tile, a smallwide Y where two streams join, a river-width confluence (a tributary widened before joining), a stream joining a river at the wide Y (the river-stream Y), a stream widening on its mouth tile, a green island whose traced rivers collide into a confluence, a green island whose river takes at least one sharp (bend60) turn, a green island with a stream carved out of a mountain-enclosed valley (valley streams), and a wasted island whose lava stream (allowConfluence: false) never merges. Every scenario is a real island of a real WorldGenerator.Generate() run at the default world size (the smallest one of seeds 1-40 with the wanted feature; of seeds 1-8 for the valley stream), so terrain, depth-field noise and the river trace all agree byte-for-byte with what that seed really produces. Regenerate with GoldenRegenerationTests (BJARNOY_REGEN_GOLDENS=1). RiverGenerationGoldenTests.cs (backend) and riverGenerator.golden.test.ts (frontend) each compute against this fixture using their own production river-tracing implementation, then assert the frozen `rivers` list below (order matters: sorted by (q, r), same as RiverGenerator.BuildRiverTiles's own output order).",
            options)).Append(",\n  \"scenarios\": [\n");

        var sampler = (Func<int, TerrainSampler>)(seed => new TerrainSampler(TestWorlds.Options(seed)));
        for (var s = 0; s < scenarios.Length; s++)
        {
            var (name, pick) = scenarios[s];
            var island = pick.Island;
            var terrain = sampler(pick.Seed);
            sb.Append("    {\n");
            sb.Append($"      \"name\": \"{name}\",\n      \"worldSeed\": {pick.Seed},\n      \"islandIndex\": {island.Index},\n");
            sb.Append($"      \"wasted\": {(island.IsWasted ? "true" : "false")},\n      \"allowConfluence\": {(island.IsWasted ? "false" : "true")},\n");
            sb.Append("      \"tiles\": [\n");
            sb.Append(string.Join(",\n", island.Tiles.Select(t =>
                $"        [{t.Q}, {t.R}, \"{(island.IsWasted ? terrain.WastedTerrainAt(t) : terrain.TerrainAt(t)).ToWireName()}\"]")));
            sb.Append("\n      ],\n      \"rivers\": [\n");
            sb.Append(string.Join(",\n", island.RiverTiles.Select(t =>
                "        {\"q\": " + t.Coord.Q + ", \"r\": " + t.Coord.R + ", \"shape\": \"" + ShapeName(t.Shape) + "\", \"inDirections\": ["
                + string.Join(", ", t.InDirections.Select(d => $"\"{d.ToWireName()}\"")) + "], \"outDirection\": "
                + (t.OutDirection is { } o ? $"\"{o.ToWireName()}\"" : "null") + ", \"width\": \"" + WidthName(t.Width) + "\", \"wasted\": " + (island.IsWasted ? "true" : "false") + "}")));
            sb.Append("\n      ]\n    }").Append(s < scenarios.Length - 1 ? ",\n" : "\n");
        }

        sb.Append("  ]\n}\n");
        File.WriteAllText(SharedPath("river-generation-golden.json"), sb.ToString());
    }

    [Fact]
    public void Regenerate_camp_placement_golden()
    {
        Assert.SkipUnless(Environment.GetEnvironmentVariable(EnvVar) == "1", $"set {EnvVar}=1 to regenerate");

        var candidates = new List<Candidate>();
        for (var seed = 1; seed <= 40; seed++)
        {
            var world = new WorldGenerator(TestWorlds.Options(seed)).Generate(TestContext.Current.CancellationToken);
            candidates.AddRange(world.Islands.Where(i => i.Camps.Count > 0).Select(i => new Candidate(seed, i)));
        }

        Candidate Smallest(string what, Func<Candidate, bool> filter) =>
            candidates.Where(filter).OrderBy(c => c.Island.TileCount).ThenBy(c => c.Seed).FirstOrDefault()
            ?? throw new InvalidOperationException($"no candidate island for '{what}' in seeds 1-40");

        var scenarios = new (string Name, Candidate Pick)[]
        {
            ("green_island_single_camp", Smallest("single", c => !c.Island.IsWasted && c.Island.Camps.Count == 1)),
            ("green_island_mixed_with_bearrapids", Smallest("mixed", c => !c.Island.IsWasted
                && c.Island.Camps.Count >= 4
                && c.Island.Camps.Any(k => k.Family == CampFamilies.Bearrapids)
                && c.Island.Camps.Select(k => k.Family).Distinct().Count() >= 4)),
            ("green_island_with_giants", Smallest("giants", c => !c.Island.IsWasted
                && c.Island.Giants.Count >= 1 && c.Island.Camps.Count >= 3)),
            ("wasted_island_fenrir_only", Smallest("wasted", c => c.Island.IsWasted && c.Island.Camps.Count >= 2)),
            ("green_island_bog_camps", Smallest("bog camps", c => !c.Island.IsWasted
                && c.Island.Camps.Count(k => k.Family is CampFamilies.Moosemire or CampFamilies.Beaverlodge or CampFamilies.Cranedance) >= 2)),
        };

        var options = new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        var sb = new StringBuilder();
        sb.Append("{\n  \"_comment\": ").Append(JsonSerializer.Serialize(
            "Cross-language parity fixture for wildlife camp placement (CampGenerator.PlaceCore backend / placeCamps frontend): given a real island's tiles (with terrain), its river tiles, its giants' anchors, a world seed, an island index and the wasted flag, both sides must place the same camps in the same order (family, level, and - for bearrapids only, which follows its river - orientation). Covers: a small island that gets exactly one camp, a mixed island whose camps take at least four families including a bearrapids on a straight river tile, an island whose giants' footprints are kept clear, bearrapids only on River-width straight tiles (each river tile carries its width), and a wasted island that only gets fenrirbrood on wasteland. Every scenario is a real island of a real WorldGenerator.Generate() run at radius 1000 (the smallest of seeds 1-40 with the wanted feature). Regenerate with GoldenRegenerationTests (BJARNOY_REGEN_GOLDENS=1). CampPlacementGoldenTests.cs (backend) and campPlacement.golden.test.ts (frontend) each compute against this fixture with their own production implementation, then assert the frozen `camps` list (order matters: it is the placement order).",
            options)).Append(",\n  \"scenarios\": [\n");

        for (var s = 0; s < scenarios.Length; s++)
        {
            var (name, pick) = scenarios[s];
            var island = pick.Island;
            var terrain = new TerrainSampler(TestWorlds.Options(pick.Seed));
            sb.Append("    {\n");
            sb.Append($"      \"name\": \"{name}\",\n      \"worldSeed\": {pick.Seed},\n      \"islandIndex\": {island.Index},\n");
            sb.Append($"      \"wasted\": {(island.IsWasted ? "true" : "false")},\n");
            // A bog hex is terrain bog (lake water: lake), laid over the seed's terrain exactly as the game does.
            var bogKinds = island.BogTiles.ToDictionary(b => b.Coord);
            Terrain TerrainOf(HexCoord t) => bogKinds.TryGetValue(t, out var b) ? b.Terrain
                : island.IsWasted ? terrain.WastedTerrainAt(t) : terrain.TerrainAt(t);
            sb.Append("      \"tiles\": [\n");
            sb.Append(string.Join(",\n", island.Tiles.Select(t => $"        [{t.Q}, {t.R}, \"{TerrainOf(t).ToWireName()}\"]")));
            sb.Append("\n      ],\n      \"plainBog\": [\n");
            sb.Append(string.Join(",\n", island.BogTiles.Where(b => b.Kind == BogTileKind.Bog).Select(b => $"        [{b.Coord.Q}, {b.Coord.R}]")));
            sb.Append("\n      ],\n      \"rivers\": [\n");
            sb.Append(string.Join(",\n", island.RiverTiles.Select(t =>
                "        {\"q\": " + t.Coord.Q + ", \"r\": " + t.Coord.R + ", \"shape\": \"" + ShapeName(t.Shape) + "\", \"inDirections\": ["
                + string.Join(", ", t.InDirections.Select(d => $"\"{d.ToWireName()}\"")) + "], \"outDirection\": "
                + (t.OutDirection is { } o ? $"\"{o.ToWireName()}\"" : "null") + ", \"width\": \"" + WidthName(t.Width) + "\"}")));
            sb.Append("\n      ],\n      \"giants\": [\n");
            sb.Append(string.Join(",\n", island.Giants.Select(g => $"        [{g.Anchor.Q}, {g.Anchor.R}]")));
            sb.Append("\n      ],\n      \"camps\": [\n");

            // The frozen expectation is the placement core's own output (Generate adds the
            // sampler orientation for every camp that is not on a river).
            var placements = CampGenerator.PlaceCore(
                island.Tiles,
                island.Tiles.ToDictionary(t => t, TerrainOf),
                island.RiverTiles,
                island.Giants.Select(g => g.Anchor).ToList(),
                pick.Seed,
                island.Index,
                island.IsWasted,
                island.BogTiles.Where(b => b.Kind == BogTileKind.Bog).Select(b => b.Coord).ToHashSet());
            sb.Append(string.Join(",\n", placements.Select(p =>
                "        {\"q\": " + p.Coord.Q + ", \"r\": " + p.Coord.R + ", \"family\": \"" + p.Family + "\", \"level\": " + p.Level
                + ", \"orientation\": " + (p.Orientation is { } o ? $"\"{o.ToWireName()}\"" : "null") + "}")));
            sb.Append("\n      ]\n    }").Append(s < scenarios.Length - 1 ? ",\n" : "\n");
        }

        sb.Append("  ]\n}\n");
        File.WriteAllText(SharedPath("camp-placement-golden.json"), sb.ToString());
    }

    [Fact]
    public void Regenerate_bog_generation_golden()
    {
        Assert.SkipUnless(Environment.GetEnvironmentVariable(EnvVar) == "1", $"set {EnvVar}=1 to regenerate");

        var candidates = new List<Candidate>();
        for (var seed = 1; seed <= 40; seed++)
        {
            var world = new WorldGenerator(TestWorlds.Options(seed)).Generate(TestContext.Current.CancellationToken);
            candidates.AddRange(world.Islands.Where(i => !i.IsWasted && i.BogTiles.Count > 0).Select(i => new Candidate(seed, i)));
        }

        static bool IsPocket(Candidate c, TerrainSampler s) =>
            c.Island.BogTiles.Any(t => t.Kind == BogTileKind.Lake && s.TerrainAt(t.Coord) == Terrain.Sea);
        static int Outflows(GeneratedIsland i) =>
            i.BogTiles.Count(t => t.Kind == BogTileKind.Mouth && t.InDirections[0] == t.WaterEdges[0]);
        static int Inflows(GeneratedIsland i) =>
            i.BogTiles.Count(t => t.Kind == BogTileKind.Mouth && t.InDirections[0] != t.WaterEdges[0]);

        var samplers = new Dictionary<int, TerrainSampler>();
        TerrainSampler SamplerOf(int seed) => samplers.TryGetValue(seed, out var s) ? s : samplers[seed] = new TerrainSampler(TestWorlds.Options(seed));

        // A creek spring whose creek runs into a lake (the guarantee's spawn bog) as opposed to out to a river (a rolled spawn).
        static bool FeedsLake(GeneratedIsland island, BogTile spring)
        {
            var byCoord = island.BogTiles.ToDictionary(t => t.Coord);
            var cur = spring;
            for (var steps = 0; steps < 200 && cur.OutDirection is { } o; steps++)
            {
                var next = cur.Coord + HexCoord.Directions[(int)o];
                if (!byCoord.TryGetValue(next, out var tile))
                {
                    return false;
                }

                if (tile.Kind == BogTileKind.Lake)
                {
                    return true;
                }

                cur = tile;
            }

            return false;
        }

        Candidate Smallest(string what, Func<Candidate, bool> filter) =>
            candidates.Where(filter).OrderBy(c => c.Island.TileCount).ThenBy(c => c.Seed).FirstOrDefault()
            ?? throw new InvalidOperationException($"no candidate island for '{what}' in seeds 1-40");

        var scenarios = new (string Name, Candidate Pick)[]
        {
            ("green_island_through_lake", Smallest("one plain site", c => !IsPocket(c, SamplerOf(c.Seed)) && Outflows(c.Island) == 1 && Inflows(c.Island) == 1
                && !c.Island.BogTiles.Any(t => t.Kind == BogTileKind.CreekSpring))),
            ("green_island_sunk_river", Smallest("sink", c => !IsPocket(c, SamplerOf(c.Seed)) && Inflows(c.Island) > Outflows(c.Island))),
            ("green_island_spawned_river", Smallest("spawn", c => c.Island.BogTiles.Any(t => t.Kind == BogTileKind.CreekSpring && !FeedsLake(c.Island, t)))),
            ("green_island_guarantee_spawn", Smallest("guarantee spawn", c => c.Island.BogTiles.Any(t => t.Kind == BogTileKind.CreekSpring && FeedsLake(c.Island, t)))),
            ("green_island_enclosed_pocket", Smallest("pocket", c => IsPocket(c, SamplerOf(c.Seed)))),
            ("green_island_two_lakes", Smallest("two lakes", c => Outflows(c.Island) >= 2)),
        };

        var options = new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        var sb = new StringBuilder();
        sb.Append("{\n  \"_comment\": ").Append(JsonSerializer.Serialize(
            "Cross-language parity fixture for bog generation (RiverGenerator.GenerateWithBogs backend / generateRiversWithBogs frontend, BogGenerator inside the drainage pipeline): given a real green island's tiles (with seed terrain), a world seed and an island index, both sides must trace the same rivers and place the same bogland (lakes, shores, mouths, creeks, moss, in the same order). Covers: the smallest island with one plain through-river lake, one where a second river sinks into the lake, one where a bog spawns a river (a creek spring), one where the bog guarantee's spawn bog feeds a lake from a creek spring (the river through the lake is the spawned one), one with an enclosed sea pocket turned into a lake with a bog ring, and one with two lakes (the smallest island with one plain lake is a guaranteed bog on a relaxed through-river site). Every scenario is a real island of a real WorldGenerator.Generate() run at radius 1000 (the smallest of seeds 1-40 with the wanted feature), so terrain, depth-field noise and the trace all agree byte-for-byte with what that seed really produces. Regenerate with GoldenRegenerationTests (BJARNOY_REGEN_GOLDENS=1). BogGenerationGoldenTests.cs (backend) and bogGenerator.golden.test.ts (frontend) each compute against this fixture with their own production implementation, then assert the frozen `rivers` and `bogs` lists (order matters: sorted by (q, r)).",
            options)).Append(",\n  \"scenarios\": [\n");

        for (var s = 0; s < scenarios.Length; s++)
        {
            var (name, pick) = scenarios[s];
            var island = pick.Island;
            var terrain = SamplerOf(pick.Seed);
            sb.Append("    {\n");
            sb.Append($"      \"name\": \"{name}\",\n      \"worldSeed\": {pick.Seed},\n      \"islandIndex\": {island.Index},\n");
            sb.Append("      \"tiles\": [\n");
            sb.Append(string.Join(",\n", island.Tiles.Select(t => $"        [{t.Q}, {t.R}, \"{terrain.TerrainAt(t).ToWireName()}\"]")));
            sb.Append("\n      ],\n      \"rivers\": [\n");
            sb.Append(string.Join(",\n", island.RiverTiles.Select(t =>
                "        {\"q\": " + t.Coord.Q + ", \"r\": " + t.Coord.R + ", \"shape\": \"" + ShapeName(t.Shape) + "\", \"inDirections\": ["
                + string.Join(", ", t.InDirections.Select(d => $"\"{d.ToWireName()}\"")) + "], \"outDirection\": "
                + (t.OutDirection is { } o ? $"\"{o.ToWireName()}\"" : "null") + ", \"width\": \"" + WidthName(t.Width) + "\"}")));
            sb.Append("\n      ],\n      \"bogs\": [\n");
            sb.Append(string.Join(",\n", island.BogTiles.Select(t =>
                "        {\"q\": " + t.Coord.Q + ", \"r\": " + t.Coord.R + ", \"kind\": \"" + BogKindName(t.Kind) + "\", \"inDirections\": ["
                + string.Join(", ", t.InDirections.Select(d => $"\"{d.ToWireName()}\"")) + "], \"outDirection\": "
                + (t.OutDirection is { } o ? $"\"{o.ToWireName()}\"" : "null") + ", \"waterEdges\": ["
                + string.Join(", ", t.WaterEdges.Select(d => $"\"{d.ToWireName()}\"")) + "]}")));
            sb.Append("\n      ]\n    }").Append(s < scenarios.Length - 1 ? ",\n" : "\n");
        }

        sb.Append("  ]\n}\n");
        File.WriteAllText(SharedPath("bog-generation-golden.json"), sb.ToString());
    }

    private static string BogKindName(BogTileKind kind) => kind switch
    {
        BogTileKind.Bog => "bog",
        BogTileKind.Lake => "lake",
        BogTileKind.Inlet => "inlet",
        BogTileKind.Shore => "shore",
        BogTileKind.Half => "half",
        BogTileKind.Mouth => "mouth",
        BogTileKind.Creek => "creek",
        BogTileKind.CreekSpring => "creekspring",
        _ => throw new InvalidOperationException($"Unknown bog kind {kind}"),
    };

    private static string WidthName(RiverWidth width) => width switch
    {
        RiverWidth.River => "river",
        RiverWidth.Stream => "stream",
        RiverWidth.Widen => "widen",
        RiverWidth.RiverStream => "riverstream",
        _ => throw new InvalidOperationException($"Unknown width {width}"),
    };

    private static string ShapeName(RiverTileShape shape) => shape switch
    {
        RiverTileShape.Spring => "spring",
        RiverTileShape.Straight => "straight",
        RiverTileShape.Bend => "bend",
        RiverTileShape.Confluence => "confluence",
        RiverTileShape.Mouth => "mouth",
        RiverTileShape.Bend60 => "bend60",
        _ => throw new InvalidOperationException($"Unknown shape {shape}"),
    };

    private static string SharedPath(string file)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Bjarnoy.slnx")))
        {
            dir = dir.Parent;
        }

        return Path.Combine(dir!.Parent!.FullName, "shared", file);
    }
}
