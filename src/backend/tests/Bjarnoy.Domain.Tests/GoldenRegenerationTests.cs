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

        Candidate Smallest(string what, Func<Candidate, bool> filter) =>
            candidates.Where(filter).OrderBy(c => c.Island.TileCount).ThenBy(c => c.Seed).FirstOrDefault()
            ?? throw new InvalidOperationException($"no candidate island for '{what}' in seeds 1-40");

        var scenarios = new (string Name, Candidate Pick)[]
        {
            ("green_island_simple_river", Smallest("simple", c => !c.Island.IsWasted
                && !Has(c.Island, RiverTileShape.Confluence) && !Has(c.Island, RiverTileShape.Bend60)
                && c.Island.RiverTiles.Count >= 5)),
            ("green_island_confluence", Smallest("confluence", c => !c.Island.IsWasted && Has(c.Island, RiverTileShape.Confluence))),
            ("green_island_bend60", Smallest("bend60", c => !c.Island.IsWasted && Has(c.Island, RiverTileShape.Bend60))),
            ("wasted_island_lava_stream", Smallest("wasted", c => c.Island.IsWasted)),
        };

        var options = new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        var sb = new StringBuilder();
        sb.Append("{\n  \"_comment\": ").Append(JsonSerializer.Serialize(
            "Cross-language parity fixture for river generation (RiverGenerator.Generate backend / generateRivers frontend): given an island's tiles (with terrain), a world seed, an island index, and wasted/allowConfluence flags, both sides must trace the same rivers in the same order. Covers: a green island with one simple spring-to-mouth river, a green island whose traced rivers collide into a confluence, a green island whose river takes at least one sharp (bend60) turn, and a wasted island whose lava stream (allowConfluence: false) never merges. Every scenario is a real island of a real WorldGenerator.Generate() run at the default world size (the smallest one of seeds 1-40 with the wanted feature), so terrain, depth-field noise and the river trace all agree byte-for-byte with what that seed really produces. Regenerate with GoldenRegenerationTests (BJARNOY_REGEN_GOLDENS=1). RiverGenerationGoldenTests.cs (backend) and riverGenerator.golden.test.ts (frontend) each compute against this fixture using their own production river-tracing implementation, then assert the frozen `rivers` list below (order matters: sorted by (q, r), same as RiverGenerator.BuildRiverTiles's own output order).",
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
                + (t.OutDirection is { } o ? $"\"{o.ToWireName()}\"" : "null") + ", \"wasted\": " + (island.IsWasted ? "true" : "false") + "}")));
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
        };

        var options = new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        var sb = new StringBuilder();
        sb.Append("{\n  \"_comment\": ").Append(JsonSerializer.Serialize(
            "Cross-language parity fixture for wildlife camp placement (CampGenerator.PlaceCore backend / placeCamps frontend): given a real island's tiles (with terrain), its river tiles, its giants' anchors, a world seed, an island index and the wasted flag, both sides must place the same camps in the same order (family, level, and - for bearrapids only, which follows its river - orientation). Covers: a small island that gets exactly one camp, a mixed island whose camps take at least four families including a bearrapids on a straight river tile, an island whose giants' footprints are kept clear, and a wasted island that only gets fenrirbrood on wasteland. Every scenario is a real island of a real WorldGenerator.Generate() run at radius 1000 (the smallest of seeds 1-40 with the wanted feature). Regenerate with GoldenRegenerationTests (BJARNOY_REGEN_GOLDENS=1). CampPlacementGoldenTests.cs (backend) and campPlacement.golden.test.ts (frontend) each compute against this fixture with their own production implementation, then assert the frozen `camps` list (order matters: it is the placement order).",
            options)).Append(",\n  \"scenarios\": [\n");

        for (var s = 0; s < scenarios.Length; s++)
        {
            var (name, pick) = scenarios[s];
            var island = pick.Island;
            var terrain = new TerrainSampler(TestWorlds.Options(pick.Seed));
            sb.Append("    {\n");
            sb.Append($"      \"name\": \"{name}\",\n      \"worldSeed\": {pick.Seed},\n      \"islandIndex\": {island.Index},\n");
            sb.Append($"      \"wasted\": {(island.IsWasted ? "true" : "false")},\n");
            sb.Append("      \"tiles\": [\n");
            sb.Append(string.Join(",\n", island.Tiles.Select(t =>
                $"        [{t.Q}, {t.R}, \"{(island.IsWasted ? terrain.WastedTerrainAt(t) : terrain.TerrainAt(t)).ToWireName()}\"]")));
            sb.Append("\n      ],\n      \"rivers\": [\n");
            sb.Append(string.Join(",\n", island.RiverTiles.Select(t =>
                "        {\"q\": " + t.Coord.Q + ", \"r\": " + t.Coord.R + ", \"shape\": \"" + ShapeName(t.Shape) + "\", \"inDirections\": ["
                + string.Join(", ", t.InDirections.Select(d => $"\"{d.ToWireName()}\"")) + "], \"outDirection\": "
                + (t.OutDirection is { } o ? $"\"{o.ToWireName()}\"" : "null") + "}")));
            sb.Append("\n      ],\n      \"giants\": [\n");
            sb.Append(string.Join(",\n", island.Giants.Select(g => $"        [{g.Anchor.Q}, {g.Anchor.R}]")));
            sb.Append("\n      ],\n      \"camps\": [\n");

            // The frozen expectation is the placement core's own output (Generate adds the
            // sampler orientation for every camp that is not on a river).
            var placements = CampGenerator.PlaceCore(
                island.Tiles,
                island.Tiles.ToDictionary(t => t, t => island.IsWasted ? terrain.WastedTerrainAt(t) : terrain.TerrainAt(t)),
                island.RiverTiles,
                island.Giants.Select(g => g.Anchor).ToList(),
                pick.Seed,
                island.Index,
                island.IsWasted);
            sb.Append(string.Join(",\n", placements.Select(p =>
                "        {\"q\": " + p.Coord.Q + ", \"r\": " + p.Coord.R + ", \"family\": \"" + p.Family + "\", \"level\": " + p.Level
                + ", \"orientation\": " + (p.Orientation is { } o ? $"\"{o.ToWireName()}\"" : "null") + "}")));
            sb.Append("\n      ]\n    }").Append(s < scenarios.Length - 1 ? ",\n" : "\n");
        }

        sb.Append("  ]\n}\n");
        File.WriteAllText(SharedPath("camp-placement-golden.json"), sb.ToString());
    }

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
