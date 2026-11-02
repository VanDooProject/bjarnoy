using System.Text.Json;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Bog generation's cross-language anti-drift guard. <c>src/shared/bog-generation-golden.json</c> is read by this suite and by
/// the frontend's <c>bogGenerator.golden.test.ts</c>: each side generates the rivers and the bogland of the same island (tiles
/// with seed terrain, world seed, island index) with its OWN production implementation (<see cref="RiverGenerator.GenerateWithBogs"/>
/// here, <c>generateRiversWithBogs</c> there) and asserts the fixture's frozen, ORDER-SENSITIVE lists.
/// </summary>
public class BogGenerationGoldenTests
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
            land[tiles[i]] = Enum.Parse<Terrain>(scenario.Tiles[i][2].GetString()!, ignoreCase: true);
        }

        var options = TestWorlds.Options(scenario.WorldSeed);
        var sampler = new TerrainSampler(options);
        var actual = RiverGenerator.GenerateWithBogs(tiles, land, sampler, options, scenario.IslandIndex);

        Assert.Equal(scenario.Rivers.Count, actual.Rivers.Count);
        for (var i = 0; i < scenario.Rivers.Count; i++)
        {
            var expected = scenario.Rivers[i];
            var got = actual.Rivers[i];
            Assert.True(
                expected.Q == got.Coord.Q && expected.R == got.Coord.R
                && expected.Shape == got.Shape.ToString().ToLowerInvariant()
                && expected.Width == got.Width.ToString().ToLowerInvariant()
                && expected.OutDirection == got.OutDirection?.ToWireName()
                && expected.InDirections.SequenceEqual(got.InDirections.Select(d => d.ToWireName())),
                $"{scenario.Name}: river tile #{i} ({expected.Q},{expected.R}) differs - got {got.Shape} {got.Width} in [{string.Join(",", got.InDirections)}] out {got.OutDirection}.");
        }

        Assert.Equal(scenario.Bogs.Count, actual.Bogs.Count);
        for (var i = 0; i < scenario.Bogs.Count; i++)
        {
            var expected = scenario.Bogs[i];
            var got = actual.Bogs[i];
            Assert.True(
                expected.Q == got.Coord.Q && expected.R == got.Coord.R
                && expected.Kind == got.Kind.ToString().ToLowerInvariant()
                && expected.OutDirection == got.OutDirection?.ToWireName()
                && expected.InDirections.SequenceEqual(got.InDirections.Select(d => d.ToWireName()))
                && expected.WaterEdges.SequenceEqual(got.WaterEdges.Select(d => d.ToWireName())),
                $"{scenario.Name}: bog tile #{i} ({expected.Q},{expected.R}) differs - got {got.Kind} in [{string.Join(",", got.InDirections)}] out {got.OutDirection} water [{string.Join(",", got.WaterEdges)}].");
        }

        // The frozen result is also a legal bog: the rules hold on it.
        Assert.Equal(0, BogRules.Check(actual.Bogs, actual.Rivers, sampler.TerrainAt).Total);
    }

    private static IReadOnlyList<Scenario> LoadScenarios()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Bjarnoy.slnx")))
        {
            dir = dir.Parent;
        }

        var path = Path.Combine(dir!.Parent!.FullName, "shared", "bog-generation-golden.json");
        var raw = JsonSerializer.Deserialize<RawFixture>(File.ReadAllText(path), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("bog-generation-golden.json deserialized to null.");
        return raw.Scenarios;
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

        public List<RiverDto> Rivers { get; set; } = [];

        public List<BogDto> Bogs { get; set; } = [];

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

    public sealed class BogDto
    {
        public int Q { get; set; }

        public int R { get; set; }

        public string Kind { get; set; } = "";

        public List<string> InDirections { get; set; } = [];

        public string? OutDirection { get; set; }

        public List<string> WaterEdges { get; set; } = [];
    }
}
