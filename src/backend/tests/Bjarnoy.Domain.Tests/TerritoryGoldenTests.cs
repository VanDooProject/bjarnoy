using System.Text.Json;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// The giants territory rule's anti-drift guard. <c>src/shared/territory-giants-golden.json</c>
/// is read by this suite and (later) by a frontend test — each side computes
/// against the same discs/giants/bounds using its OWN production
/// implementation of the rule, then asserts the fixture's frozen claimed
/// sets. Either side's territory logic drifting from the other turns its own
/// suite red instead of the client's map painting a giant claimed (or not)
/// differently from what the server actually enforces.
/// </summary>
public class TerritoryGoldenTests
{
    private static readonly IReadOnlyList<Scenario> Scenarios = LoadScenarios();

    public static IEnumerable<object[]> Cases() => Scenarios.Select(s => new object[] { s });

    [Theory]
    [MemberData(nameof(Cases))]
    public void Matches_the_shared_golden_fixture(Scenario scenario)
    {
        var giants = scenario.Giants
            .Select(g => new Giant(new HexCoord(g.Q, g.R), "giantmountain", TileOrientation.E))
            .ToList();
        var index = new GiantIndex(giants);
        var discs = scenario.Discs.Select(d => (new HexCoord(d.Q, d.R), d.Radius)).ToList();

        var boundsCentre = new HexCoord(scenario.Bounds.Q, scenario.Bounds.R);
        var actual = boundsCentre.WithinRadius(scenario.Bounds.Radius)
            .Where(coord => Territory.Claims(discs, coord, index))
            .OrderBy(c => c.Q).ThenBy(c => c.R)
            .Select(c => new[] { c.Q, c.R })
            .ToList();

        var expected = scenario.Claimed.OrderBy(c => c[0]).ThenBy(c => c[1]).ToList();

        Assert.Equal(expected.Count, actual.Count);
        for (var i = 0; i < expected.Count; i++)
        {
            Assert.True(
                expected[i][0] == actual[i][0] && expected[i][1] == actual[i][1],
                $"{scenario.Name}: claimed set mismatch at index {i} — expected ({expected[i][0]},{expected[i][1]}), got ({actual[i][0]},{actual[i][1]}).");
        }
    }

    private static IReadOnlyList<Scenario> LoadScenarios()
    {
        var json = File.ReadAllText(GoldenFixturePath());
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var raw = JsonSerializer.Deserialize<RawFixture>(json, options)
            ?? throw new InvalidOperationException("territory-giants-golden.json deserialized to null.");

        return raw.Scenarios;
    }

    /// <summary>
    /// Walks up from the test assembly's output directory to find the repo
    /// root — mirrors <c>HexPathfinderGoldenTests.GoldenFixturePath</c>.
    /// </summary>
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

        return Path.Combine(dir.Parent.FullName, "shared", "territory-giants-golden.json");
    }

    private sealed class RawFixture
    {
        public List<Scenario> Scenarios { get; set; } = [];
    }

    public sealed class Scenario
    {
        public string Name { get; set; } = "";

        public string Comment { get; set; } = "";

        public List<DiscDto> Discs { get; set; } = [];

        public List<HexCoordDto> Giants { get; set; } = [];

        public BoundsDto Bounds { get; set; } = new();

        public List<int[]> Claimed { get; set; } = [];

        public override string ToString() => Name;
    }

    public sealed class DiscDto
    {
        public int Q { get; set; }

        public int R { get; set; }

        public int Radius { get; set; }
    }

    public sealed class HexCoordDto
    {
        public int Q { get; set; }

        public int R { get; set; }
    }

    public sealed class BoundsDto
    {
        public int Q { get; set; }

        public int R { get; set; }

        public int Radius { get; set; }
    }
}
