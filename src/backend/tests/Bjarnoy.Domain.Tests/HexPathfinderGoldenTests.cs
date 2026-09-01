using System.Text.Json;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Issue #159 part B's anti-drift guard. <c>src/shared/river-pathing-golden.json</c>
/// is read by this suite and by <c>hexPath.golden.test.ts</c> on the frontend —
/// each side computes against the same terrain patch and cases using its OWN
/// production cost tables/river rule, then asserts the fixture's frozen
/// numbers. Either side's cost model drifting from the other turns its own
/// suite red instead of the client's range tint quietly disagreeing with what
/// the server actually paths over.
/// </summary>
public class HexPathfinderGoldenTests
{
    private static readonly GoldenFixture Fixture = LoadFixture();

    public static IEnumerable<object[]> FindPathCases() => Fixture.FindPathCases.Select(c => new object[] { c });

    [Theory]
    [MemberData(nameof(FindPathCases))]
    public void Matches_the_shared_golden_fixture(FindPathCase testCase)
    {
        Terrain TerrainAt(HexCoord c) => Fixture.Terrain.GetValueOrDefault(Key(c), Terrain.Sea);
        bool IsRiver(HexCoord c) => Fixture.RiverTiles.Contains(Key(c));

        var from = new HexCoord(testCase.From.Q, testCase.From.R);
        var to = new HexCoord(testCase.To.Q, testCase.To.R);

        var path = HexPathfinder.FindPath(from, to, TerrainAt, testCase.IsLandUnit, IsRiver);

        Assert.True(path is not null, $"{testCase.Name}: expected a path, found none");
        var expectedPath = testCase.ExpectedPath.Select(p => new HexCoord(p.Q, p.R)).ToList();
        Assert.Equal(expectedPath, path);

        var hours = HexPathfinder.CumulativeHours(path!, TerrainAt, hexesPerHour: 1.0, testCase.IsLandUnit, isRiver: IsRiver);
        Assert.Equal(testCase.ExpectedCumulativeHours.Count, hours.Count);
        for (var i = 0; i < hours.Count; i++)
        {
            Assert.True(
                Math.Abs(testCase.ExpectedCumulativeHours[i] - hours[i]) < 1e-9,
                $"{testCase.Name}: hour {i} expected {testCase.ExpectedCumulativeHours[i]}, got {hours[i]}");
        }
    }

    private static string Key(HexCoord c) => $"{c.Q},{c.R}";

    private static GoldenFixture LoadFixture()
    {
        var json = File.ReadAllText(GoldenFixturePath());
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var raw = JsonSerializer.Deserialize<RawFixture>(json, options)
            ?? throw new InvalidOperationException("river-pathing-golden.json deserialized to null.");

        var terrain = raw.Terrain.ToDictionary(kv => kv.Key, kv => ParseTerrain(kv.Value));
        var riverTiles = new HashSet<string>(raw.RiverTiles);
        return new GoldenFixture(terrain, riverTiles, raw.FindPathCases);
    }

    private static Terrain ParseTerrain(string name) => name switch
    {
        "sea" => Terrain.Sea,
        "sand" => Terrain.Sand,
        "grass" => Terrain.Grass,
        "forest" => Terrain.Forest,
        "mountain" => Terrain.Mountain,
        _ => throw new ArgumentOutOfRangeException(nameof(name), name, "Unknown terrain in golden fixture."),
    };

    /// <summary>
    /// Walks up from the test assembly's output directory to find the repo
    /// root (marked by <c>Bjarnoy.slnx</c>, the backend solution file, one
    /// level below <c>src/</c>) rather than a hand-relative <c>../../..</c>
    /// path, which would silently break the moment either project's own
    /// output layout changes.
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

        return Path.Combine(dir.Parent.FullName, "shared", "river-pathing-golden.json");
    }

    private sealed record GoldenFixture(
        IReadOnlyDictionary<string, Terrain> Terrain,
        IReadOnlySet<string> RiverTiles,
        IReadOnlyList<FindPathCase> FindPathCases);

    private sealed class RawFixture
    {
        public Dictionary<string, string> Terrain { get; set; } = [];

        public List<string> RiverTiles { get; set; } = [];

        public List<FindPathCase> FindPathCases { get; set; } = [];
    }

    public sealed class FindPathCase
    {
        public string Name { get; set; } = "";

        public HexCoordDto From { get; set; } = new();

        public HexCoordDto To { get; set; } = new();

        public bool IsLandUnit { get; set; }

        public List<HexCoordDto> ExpectedPath { get; set; } = [];

        public List<double> ExpectedCumulativeHours { get; set; } = [];

        public override string ToString() => Name;
    }

    public sealed class HexCoordDto
    {
        public int Q { get; set; }

        public int R { get; set; }
    }
}
