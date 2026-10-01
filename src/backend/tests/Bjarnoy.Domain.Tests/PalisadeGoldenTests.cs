using System.Text.Json;
using Bjarnoy.Domain.Palisades;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Anti-drift guard for the palisade: <c>src/shared/palisade-golden.json</c> (generated from the frontend's <c>palisadeTiles.ts</c> by
/// <c>scripts/regen-goldens/palisade-golden.ts</c>) is asserted here against <see cref="PalisadeRules"/> and by
/// <c>palisadeTiles.golden.test.ts</c> against the frontend, so the two resolvers agree on every piece, rotation, refusal and land-end
/// classification.
/// </summary>
public class PalisadeGoldenTests
{
    private static readonly JsonDocument Fixture = Load();

    private static JsonElement Section(string name) => Fixture.RootElement.GetProperty(name);

    public static IEnumerable<object[]> TileCases() =>
        Section("tileCases").EnumerateArray().Select((_, i) => new object[] { i });

    public static IEnumerable<object[]> PlacementCases() =>
        Section("placementCases").EnumerateArray().Select(c => new object[] { c.GetProperty("name").GetString()! });

    public static IEnumerable<object[]> EndCases() =>
        Section("classifyEndCases").EnumerateArray().Select(c => new object[] { c.GetProperty("name").GetString()! });

    [Theory]
    [MemberData(nameof(TileCases))]
    public void The_piece_and_camera_of_every_neighbour_pattern_match_the_shared_golden(int index)
    {
        var c = Section("tileCases")[index];
        var flags = c.GetProperty("wallNeighbours").EnumerateArray().Select(e => e.GetBoolean()).ToList();
        var coastal = c.GetProperty("coastalWater").GetBoolean();
        var gate = c.GetProperty("gate").GetBoolean();
        var expected = c.GetProperty("expected");

        var result = PalisadeRules.TileFor(flags, coastal, gate);

        if (expected.TryGetProperty("refusal", out var refusal))
        {
            Assert.Equal(refusal.GetString(), RefusalName(result.Refusal));
            return;
        }

        Assert.False(result.IsRefusal, $"expected a piece, got {RefusalName(result.Refusal)}");
        var tile = result.Tile!;
        Assert.Equal(expected.GetProperty("piece").GetString(), PieceName(tile.Piece));
        Assert.Equal(expected.GetProperty("dir").GetString(), tile.Dir.ToWireName());
        Assert.Equal(expected.GetProperty("edges").EnumerateArray().Select(e => e.GetInt32()), tile.Edges);
    }

    [Theory]
    [MemberData(nameof(PlacementCases))]
    public void Placements_are_accepted_or_refused_as_in_the_shared_golden(string name)
    {
        var c = Section("placementCases").EnumerateArray().Single(e => e.GetProperty("name").GetString() == name);
        var terrain = c.GetProperty("terrain").EnumerateObject().ToDictionary(p => ParseKey(p.Name), p => ParseTerrain(p.Value.GetString()!));
        var rivers = c.GetProperty("rivers").EnumerateArray().Select(e => ParseKey(e.GetString()!)).ToHashSet();
        var walls = c.GetProperty("walls").EnumerateArray().Select(e => ParseKey(e.GetString()!)).ToHashSet();
        var gates = c.GetProperty("gates").EnumerateArray().Select(e => ParseKey(e.GetString()!)).ToHashSet();
        var expected = c.GetProperty("expected");

        var refusal = PalisadeRules.CanPlace(
            ParseKey(c.GetProperty("coord").GetString()!),
            new WallSet(walls, gates),
            new PalisadePlacementContext(h => terrain.GetValueOrDefault(h, Terrain.Grass), rivers.Contains),
            c.GetProperty("gate").GetBoolean());

        if (expected.TryGetProperty("ok", out _))
        {
            Assert.True(refusal is null, $"{name}: expected ok, got {RefusalName(refusal)}");
            return;
        }

        Assert.Equal(expected.GetProperty("reason").GetString(), RefusalName(refusal));
    }

    [Theory]
    [MemberData(nameof(EndCases))]
    public void Land_ends_are_half_open_or_sealed_as_in_the_shared_golden(string name)
    {
        var c = Section("classifyEndCases").EnumerateArray().Single(e => e.GetProperty("name").GetString() == name);
        var terrain = c.GetProperty("terrain").EnumerateObject().ToDictionary(p => ParseKey(p.Name), p => ParseTerrain(p.Value.GetString()!));
        var wide = c.GetProperty("wideRivers").EnumerateArray().Select(e => ParseKey(e.GetString()!)).ToHashSet();

        var sealedEnd = PalisadeRules.IsSealedEnd(
            ParseKey(c.GetProperty("coord").GetString()!), h => terrain.GetValueOrDefault(h, Terrain.Grass), wide.Contains);

        Assert.Equal(c.GetProperty("expected").GetString(), sealedEnd ? "sealed" : "halfOpen");
    }

    [Fact]
    public void The_fixture_covers_every_piece_and_every_refusal()
    {
        var pieces = Section("tileCases").EnumerateArray()
            .Select(c => c.GetProperty("expected"))
            .Where(e => e.TryGetProperty("piece", out _))
            .Select(e => e.GetProperty("piece").GetString())
            .ToHashSet();
        Assert.Equal(new HashSet<string?> { "straight180", "bend60", "bend120", "gate180", "end", "end_coast" }, pieces);

        var reasons = Section("placementCases").EnumerateArray()
            .Select(c => c.GetProperty("expected"))
            .Where(e => e.TryGetProperty("reason", out _))
            .Select(e => e.GetProperty("reason").GetString())
            .ToHashSet();
        Assert.Superset(new HashSet<string?> { "branch", "gateNotStraight", "notAllowedOnTerrain", "occupied" }, reasons);
    }

    [Fact]
    public void Every_piece_maps_to_the_atlas_family_the_frontend_uses()
    {
        Assert.Equal(
            ["palisade_straight180", "palisade_bend60", "palisade_bend120", "palisade_gate180", "palisade_end", "palisade_end_coast"],
            Enum.GetValues<PalisadePiece>().Select(PalisadeRules.FamilyOf));
    }

    private static string PieceName(PalisadePiece piece) => piece switch
    {
        PalisadePiece.Straight180 => "straight180",
        PalisadePiece.Bend60 => "bend60",
        PalisadePiece.Bend120 => "bend120",
        PalisadePiece.Gate180 => "gate180",
        PalisadePiece.End => "end",
        PalisadePiece.EndCoast => "end_coast",
        _ => throw new ArgumentOutOfRangeException(nameof(piece)),
    };

    private static string? RefusalName(PalisadeRefusal? refusal) => refusal switch
    {
        null => null,
        PalisadeRefusal.Branch => "branch",
        PalisadeRefusal.GateNotStraight => "gateNotStraight",
        PalisadeRefusal.NotAllowedOnTerrain => "notAllowedOnTerrain",
        PalisadeRefusal.Isolated => "isolated",
        PalisadeRefusal.Occupied => "occupied",
        _ => throw new ArgumentOutOfRangeException(nameof(refusal)),
    };

    private static HexCoord ParseKey(string key)
    {
        var parts = key.Split(',');
        return new HexCoord(int.Parse(parts[0]), int.Parse(parts[1]));
    }

    private static Terrain ParseTerrain(string name) => Enum.Parse<Terrain>(name, ignoreCase: true);

    private static JsonDocument Load()
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

        return JsonDocument.Parse(File.ReadAllText(Path.Combine(dir.Parent.FullName, "shared", "palisade-golden.json")));
    }
}
