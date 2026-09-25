using System.Text.Json;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Wasted-island terrain's cross-language anti-drift guard.
/// <c>src/shared/wasted-terrain-golden.json</c> is read by this suite and by
/// the frontend's <c>wastedTerrain.golden.test.ts</c> — each side samples the
/// same seeds/radius using its OWN production implementation
/// (<see cref="TerrainSampler.WastedTerrainAt"/> here, <c>wastedTerrainAt</c>
/// there), then asserts the fixture's frozen, sorted list of wasted-land
/// hexes. Mirrors <see cref="GiantPlacementGoldenTests"/>'s own pattern for
/// loading a <c>src/shared/*.json</c> fixture.
/// </summary>
public class WastedTerrainGoldenTests
{
    private static readonly IReadOnlyList<Scenario> Scenarios = LoadScenarios();

    public static IEnumerable<object[]> Cases() => Scenarios.Select(s => new object[] { s });

    [Theory]
    [MemberData(nameof(Cases))]
    public void Matches_the_shared_golden_fixture(Scenario scenario)
    {
        var options = WorldGenerationOptions.ForSeed(scenario.Seed) with { Radius = scenario.Radius };
        var sampler = new TerrainSampler(options);

        var actual = new List<(int Q, int R, string Terrain)>();
        foreach (var coord in HexCoord.Origin.WithinRadius(scenario.Radius))
        {
            var terrain = sampler.WastedTerrainAt(coord);
            if (terrain.IsLand())
            {
                actual.Add((coord.Q, coord.R, terrain.ToWireName()));
            }
        }

        actual.Sort((a, b) => a.Q != b.Q ? a.Q.CompareTo(b.Q) : a.R.CompareTo(b.R));

        Assert.Equal(scenario.Hexes.Count, actual.Count);
        for (var i = 0; i < scenario.Hexes.Count; i++)
        {
            var expected = scenario.Hexes[i];
            var expectedQ = expected[0].GetInt32();
            var expectedR = expected[1].GetInt32();
            var expectedTerrain = expected[2].GetString();
            Assert.True(
                expectedQ == actual[i].Q && expectedR == actual[i].R && expectedTerrain == actual[i].Terrain,
                $"seed={scenario.Seed}: hex #{i} mismatch — expected ({expectedQ},{expectedR},{expectedTerrain}), " +
                $"got ({actual[i].Q},{actual[i].R},{actual[i].Terrain}).");
        }
    }

    /// <summary>
    /// A wasted-terrain scan must never change what <see cref="TerrainSampler.TerrainAt"/>
    /// returns for any hex — wasted land stays invisible sea to every existing
    /// caller, on green islands or elsewhere, until a caller explicitly asks
    /// <see cref="TerrainSampler.WastedTerrainAt"/> instead.
    /// </summary>
    [Theory]
    [InlineData(12)]
    [InlineData(19)]
    [InlineData(36)]
    [InlineData(9000)]
    public void TerrainAt_is_unchanged_by_the_existence_of_wasted_islands(int seed)
    {
        var options = WorldGenerationOptions.ForSeed(seed) with { Radius = 40 };
        var sampler = new TerrainSampler(options);

        foreach (var coord in HexCoord.Origin.WithinRadius(40))
        {
            var terrain = sampler.TerrainAt(coord);
            var wasted = sampler.WastedTerrainAt(coord);

            // A hex can never be both a green terrain and wasted land at once
            // — TerrainAt must report Sea for anything WastedTerrainAt claims
            // as land, since wasted land is defined to sit only where
            // IslandDepthAt (green) is null.
            if (wasted.IsLand())
            {
                Assert.Equal(Terrain.Sea, terrain);
            }
        }
    }

    private static IReadOnlyList<Scenario> LoadScenarios()
    {
        var json = File.ReadAllText(GoldenFixturePath());
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var raw = JsonSerializer.Deserialize<RawFixture>(json, options)
            ?? throw new InvalidOperationException("wasted-terrain-golden.json deserialized to null.");

        return raw.Scenarios;
    }

    /// <summary>Walks up from the test assembly's output directory to find the repo root — mirrors <c>GiantPlacementGoldenTests.GoldenFixturePath</c>.</summary>
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

        return Path.Combine(dir.Parent.FullName, "shared", "wasted-terrain-golden.json");
    }

    private sealed class RawFixture
    {
        public List<Scenario> Scenarios { get; set; } = [];
    }

    public sealed class Scenario
    {
        public int Seed { get; set; }

        public int Radius { get; set; }

        public List<List<JsonElement>> Hexes { get; set; } = [];

        public override string ToString() => $"seed={Seed}";
    }
}
