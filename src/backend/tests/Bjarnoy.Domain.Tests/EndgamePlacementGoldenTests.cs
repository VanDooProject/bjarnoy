using System.Text.Json;
using Bjarnoy.Domain.Palisades;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The endgame map's cross-language anti-drift guard. <c>src/shared/endgame-placement-golden.json</c> is read by this suite and by
/// the frontend's <c>endgamePlacement.golden.test.ts</c>: each side computes against the same wasted island (tiles with terrain,
/// river tiles, giants, camp hexes, world seed, island index) with its OWN production implementation
/// (<see cref="EndgameGenerator.PlaceCore"/> here, <c>placeEndgame</c> there) and asserts the fixture's frozen, ORDER-SENSITIVE
/// wall and tower lists.
/// </summary>
public class EndgamePlacementGoldenTests
{
    private static readonly IReadOnlyList<Scenario> Scenarios = LoadScenarios();

    public static IEnumerable<object[]> Cases() => Scenarios.Select(s => new object[] { s });

    [Theory]
    [MemberData(nameof(Cases))]
    public void Matches_the_shared_golden_fixture(Scenario scenario)
    {
        var tiles = scenario.Tiles.Select(t => new HexCoord(t[0].GetInt32(), t[1].GetInt32())).ToList();
        var land = new Dictionary<HexCoord, Terrain>();
        for (var i = 0; i < tiles.Count; i++)
        {
            land[tiles[i]] = ParseTerrain(scenario.Tiles[i][2].GetString()!);
        }

        var actual = EndgameGenerator.PlaceCore(
            tiles,
            land,
            scenario.Rivers.Select(r => new HexCoord(r[0], r[1])).ToHashSet(),
            [.. scenario.Giants.Select(g => new GiantGenerator.Placement(new HexCoord(g.Q, g.R), g.Family))],
            scenario.Camps.Select(c => new HexCoord(c[0], c[1])).ToHashSet(),
            scenario.WorldSeed,
            scenario.IslandIndex);

        Assert.Equal(scenario.Walls.Count, actual.Walls.Count);
        for (var i = 0; i < scenario.Walls.Count; i++)
        {
            var expected = scenario.Walls[i];
            var got = actual.Walls[i];
            var gotPiece = PalisadeRules.FamilyOf(got.Piece)["palisade_".Length..];
            Assert.True(
                expected.Q == got.Coord.Q && expected.R == got.Coord.R && expected.Ring == (got.Ring == UtgardRing.Inner ? "inner" : "outer")
                && expected.Piece == gotPiece && expected.Dir == got.Dir.ToWireName() && expected.Gate == got.IsGate && expected.Level == got.Level,
                $"{scenario.Name}: wall #{i} mismatch - expected ({expected.Q},{expected.R},{expected.Ring},{expected.Piece},{expected.Dir},gate={expected.Gate},L{expected.Level}), "
                + $"got ({got.Coord.Q},{got.Coord.R},{got.Ring},{gotPiece},{got.Dir.ToWireName()},gate={got.IsGate},L{got.Level}).");
        }

        Assert.Equal(
            scenario.Towers.Select(t => (t[0], t[1])),
            actual.Towers.Select(t => (t.Q, t.R)));
    }

    [Fact]
    public void The_fixture_covers_the_shapes_the_rules_care_about()
    {
        Assert.Contains(Scenarios, s => s.Walls.Select(w => w.Ring).Distinct().Count() == 2);
        Assert.Contains(Scenarios, s => s.Walls.Select(w => w.Ring).Distinct().Count() == 1);
        Assert.Contains(Scenarios, s => s.Walls.Any(w => w.Gate));
        Assert.Contains(Scenarios, s => s.Walls.Any(w => w.Piece == "end_coast"));
        Assert.Contains(Scenarios, s => s.Towers.Count == EndgameRules.MaxTowers);
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

    private static IReadOnlyList<Scenario> LoadScenarios()
    {
        var json = File.ReadAllText(GoldenFixturePath());
        var raw = JsonSerializer.Deserialize<RawFixture>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("endgame-placement-golden.json deserialized to null.");
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

        return Path.Combine(dir.Parent.FullName, "shared", "endgame-placement-golden.json");
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

        public List<List<JsonElement>> Tiles { get; set; } = [];

        public List<int[]> Rivers { get; set; } = [];

        public List<GiantDto> Giants { get; set; } = [];

        public List<int[]> Camps { get; set; } = [];

        public List<WallDto> Walls { get; set; } = [];

        public List<int[]> Towers { get; set; } = [];

        public override string ToString() => Name;
    }

    public sealed class GiantDto
    {
        public int Q { get; set; }

        public int R { get; set; }

        public string Family { get; set; } = "";
    }

    public sealed class WallDto
    {
        public int Q { get; set; }

        public int R { get; set; }

        public string Ring { get; set; } = "";

        public string Piece { get; set; } = "";

        public string Dir { get; set; } = "";

        public bool Gate { get; set; }

        public int Level { get; set; }
    }
}
