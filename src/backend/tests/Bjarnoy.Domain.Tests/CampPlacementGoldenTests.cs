using System.Text.Json;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Wildlife camp placement's cross-language anti-drift guard.
/// <c>src/shared/camp-placement-golden.json</c> is read by this suite and by the frontend's
/// <c>campPlacement.golden.test.ts</c>: each side computes against the same island (tiles with
/// terrain, river tiles, giant anchors, world seed, island index, wasted flag) with its OWN
/// production implementation (<see cref="CampGenerator.PlaceCore"/> here, <c>placeCamps</c>
/// there) and asserts the fixture's frozen, ORDER-SENSITIVE camp list.
/// </summary>
public class CampPlacementGoldenTests
{
    private static readonly IReadOnlyList<Scenario> Scenarios = LoadScenarios();

    public static IEnumerable<object[]> Cases() => Scenarios.Select(s => new object[] { s });

    [Theory]
    [MemberData(nameof(Cases))]
    public void Matches_the_shared_golden_fixture(Scenario scenario)
    {
        var tiles = scenario.Tiles.Select(t => new HexCoord(t[0].GetInt32(), t[1].GetInt32())).ToList();
        var land = new Dictionary<HexCoord, Terrain>();
        for (var i = 0; i < scenario.Tiles.Count; i++)
        {
            land[tiles[i]] = ParseTerrain(scenario.Tiles[i][2].GetString()!);
        }

        var rivers = scenario.Rivers.Select(r => new RiverTile(
            new HexCoord(r.Q, r.R),
            ParseShape(r.Shape),
            [.. r.InDirections.Select(ParseOrientation)],
            r.OutDirection is null ? null : ParseOrientation(r.OutDirection),
            ParseWidth(r.Width))).ToList();
        var giants = scenario.Giants.Select(g => new HexCoord(g[0], g[1])).ToList();

        var actual = CampGenerator.PlaceCore(tiles, land, rivers, giants, scenario.WorldSeed, scenario.IslandIndex, scenario.Wasted);

        Assert.Equal(scenario.Camps.Count, actual.Count);
        for (var i = 0; i < scenario.Camps.Count; i++)
        {
            var expected = scenario.Camps[i];
            var got = actual[i];
            Assert.True(
                expected.Q == got.Coord.Q && expected.R == got.Coord.R && expected.Family == got.Family
                && expected.Level == got.Level && expected.Orientation == got.Orientation?.ToWireName(),
                $"{scenario.Name}: camp #{i} mismatch - expected ({expected.Q},{expected.R},{expected.Family},L{expected.Level},{expected.Orientation ?? "null"}), "
                + $"got ({got.Coord.Q},{got.Coord.R},{got.Family},L{got.Level},{got.Orientation?.ToWireName() ?? "null"}).");
        }
    }

    private static Terrain ParseTerrain(string wireName) => wireName switch
    {
        "sea" => Terrain.Sea,
        "sand" => Terrain.Sand,
        "grass" => Terrain.Grass,
        "forest" => Terrain.Forest,
        "mountain" => Terrain.Mountain,
        _ => throw new InvalidOperationException($"Unknown terrain wire name '{wireName}'."),
    };

    private static RiverTileShape ParseShape(string wireName) => wireName switch
    {
        "spring" => RiverTileShape.Spring,
        "straight" => RiverTileShape.Straight,
        "bend" => RiverTileShape.Bend,
        "confluence" => RiverTileShape.Confluence,
        "mouth" => RiverTileShape.Mouth,
        "bend60" => RiverTileShape.Bend60,
        _ => throw new InvalidOperationException($"Unknown river shape '{wireName}'."),
    };

    private static RiverWidth ParseWidth(string wireName) => wireName switch
    {
        "river" => RiverWidth.River,
        "stream" => RiverWidth.Stream,
        "widen" => RiverWidth.Widen,
        "riverstream" => RiverWidth.RiverStream,
        _ => throw new InvalidOperationException($"Unknown river width '{wireName}'."),
    };

    private static TileOrientation ParseOrientation(string wireName) =>
        Enum.Parse<TileOrientation>(wireName);

    private static IReadOnlyList<Scenario> LoadScenarios()
    {
        var json = File.ReadAllText(GoldenFixturePath());
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var raw = JsonSerializer.Deserialize<RawFixture>(json, options)
            ?? throw new InvalidOperationException("camp-placement-golden.json deserialized to null.");
        return raw.Scenarios;
    }

    private static string GoldenFixturePath()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Bjarnoy.slnx")))
        {
            dir = dir.Parent;
        }

        if (dir?.Parent is null)
        {
            throw new InvalidOperationException("Could not locate Bjarnoy.slnx while searching for the repo root.");
        }

        return Path.Combine(dir.Parent.FullName, "shared", "camp-placement-golden.json");
    }

    private sealed class RawFixture
    {
        public List<Scenario> Scenarios { get; set; } = [];
    }

    public sealed class Scenario
    {
        public string Name { get; set; } = "";

        public int WorldSeed { get; set; }

        public int IslandIndex { get; set; }

        public bool Wasted { get; set; }

        public List<List<JsonElement>> Tiles { get; set; } = [];

        public List<RiverDto> Rivers { get; set; } = [];

        public List<int[]> Giants { get; set; } = [];

        public List<CampDto> Camps { get; set; } = [];

        public override string ToString() => Name;
    }

    public sealed class RiverDto
    {
        public int Q { get; set; }

        public int R { get; set; }

        public string Shape { get; set; } = "";

        public List<string> InDirections { get; set; } = [];

        public string? OutDirection { get; set; }

        public string Width { get; set; } = "river";
    }

    public sealed class CampDto
    {
        public int Q { get; set; }

        public int R { get; set; }

        public string Family { get; set; } = "";

        public int Level { get; set; }

        public string? Orientation { get; set; }
    }
}
