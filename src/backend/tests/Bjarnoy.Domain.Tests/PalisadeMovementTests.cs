using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// How palisades move land armies (<c>docs/design/economy.md</c> section 5, <see cref="PalisadeIndex"/>): every wall hex blocks, the owner's
/// gate lets only the owner's armies through, a land end is half open at a flat 3 unless it touches a mountain or a wide river, and a
/// wall to the sea ends in a sea end that stays sea. The scene is a strip of grass (q 0..6, r -3..3) with a wall down the column q = 3.
/// </summary>
public sealed class PalisadeMovementTests
{
    private static readonly Guid Owner = Guid.Parse("00000000-0000-0000-0000-00000000000a");
    private static readonly Guid Stranger = Guid.Parse("00000000-0000-0000-0000-00000000000b");

    private static readonly HexCoord West = new(1, 0);
    private static readonly HexCoord East = new(5, 0);

    private static Dictionary<HexCoord, Terrain> Strip()
    {
        var terrain = new Dictionary<HexCoord, Terrain>();
        for (var q = 0; q <= 6; q++)
        {
            for (var r = -3; r <= 3; r++)
            {
                terrain[new HexCoord(q, r)] = Terrain.Grass;
            }
        }

        // Everything else is sea. The top end of the column is closed by a mountain; the bottom end is up to each test.
        terrain[new HexCoord(3, -4)] = Terrain.Mountain;
        return terrain;
    }

    private static IEnumerable<StandingWall> Column(int fromR, int toR, int? gateAtR = null) =>
        Enumerable.Range(fromR, toR - fromR + 1)
            .Select(r => new StandingWall(new HexCoord(3, r), r == gateAtR, Owner));

    private static PalisadeIndex Index(IReadOnlyDictionary<HexCoord, Terrain> terrain, IEnumerable<StandingWall> walls) =>
        new(walls, h => terrain.GetValueOrDefault(h, Terrain.Sea), _ => false);

    private static IReadOnlyList<HexCoord>? Route(
        IReadOnlyDictionary<HexCoord, Terrain> terrain, PalisadeIndex walls, Guid walker, bool landUnit = true)
    {
        var rules = walls.ForOwner(walker);
        return HexPathfinder.FindPath(
            West, East, h => terrain.GetValueOrDefault(h, Terrain.Sea), landUnit,
            blocked: rules?.Blocked, friendlyGate: rules?.FriendlyGate, halfOpen: rules?.HalfOpen);
    }

    [Fact]
    public void Without_a_wall_the_strip_is_crossed_in_a_straight_line()
    {
        var path = Route(Strip(), Index(Strip(), []), Stranger);

        Assert.NotNull(path);
        Assert.Equal(5, path!.Count);
    }

    [Fact]
    public void A_wall_sealed_by_a_mountain_at_one_end_and_a_mountain_at_the_other_stops_every_army_including_the_owner()
    {
        var terrain = Strip();
        terrain[new HexCoord(3, 4)] = Terrain.Mountain;
        var walls = Index(terrain, Column(-3, 3));

        Assert.Null(Route(terrain, walls, Stranger));
        Assert.Null(Route(terrain, walls, Owner));
    }

    [Fact]
    public void The_owner_passes_its_gate_at_the_normal_terrain_cost_and_a_stranger_does_not()
    {
        var terrain = Strip();
        terrain[new HexCoord(3, 4)] = Terrain.Mountain;
        var walls = Index(terrain, Column(-3, 3, gateAtR: 0));

        Assert.Null(Route(terrain, walls, Stranger));

        var path = Route(terrain, walls, Owner);
        Assert.NotNull(path);
        Assert.Contains(new HexCoord(3, 0), path!);
        var hours = HexPathfinder.CumulativeHours(
            path, h => terrain.GetValueOrDefault(h, Terrain.Sea), hexesPerHour: 1.0,
            blocked: walls.ForOwner(Owner)!.Blocked, friendlyGate: walls.ForOwner(Owner)!.FriendlyGate, halfOpen: walls.ForOwner(Owner)!.HalfOpen);
        Assert.Equal(4.0, hours[^1]); // four grass steps through the gate: the gate costs what grass costs
    }

    [Fact]
    public void A_gate_of_another_owner_is_a_wall()
    {
        var terrain = Strip();
        terrain[new HexCoord(3, 4)] = Terrain.Mountain;
        var walls = Index(
            terrain,
            [.. Column(-3, 3).Where(w => w.Coord.R != 0), new StandingWall(new HexCoord(3, 0), IsGate: true, Stranger)]);

        Assert.Null(Route(terrain, walls, Owner));
        Assert.NotNull(Route(terrain, walls, Stranger));
    }

    [Fact]
    public void A_half_open_end_is_crossed_by_every_army_at_a_flat_3()
    {
        // The wall runs r -3..2; below it (3,3) is sea (not in the strip), so the tip (3,2) touches no mountain or wide river.
        var terrain = Strip();
        terrain.Remove(new HexCoord(3, 3));
        var walls = Index(terrain, Column(-3, 2));

        Assert.True(walls.IsHalfOpen(new HexCoord(3, 2)));
        Assert.False(walls.IsHalfOpen(new HexCoord(3, 1)));

        foreach (var walker in new[] { Owner, Stranger })
        {
            var path = Route(terrain, walls, walker);
            Assert.NotNull(path);
            var tip = path!.ToList().IndexOf(new HexCoord(3, 2));
            Assert.True(tip > 0, "the route has to cross the wall over the half-open end");

            var rules = walls.ForOwner(walker)!;
            var hours = HexPathfinder.CumulativeHours(
                path, h => terrain.GetValueOrDefault(h, Terrain.Sea), hexesPerHour: 1.0,
                blocked: rules.Blocked, friendlyGate: rules.FriendlyGate, halfOpen: rules.HalfOpen);
            Assert.Equal(HexPathfinder.HalfOpenEndCost, hours[tip] - hours[tip - 1]);
            Assert.Equal(3.0, HexPathfinder.HalfOpenEndCost);
        }
    }

    [Fact]
    public void A_land_end_that_touches_a_mountain_is_sealed_and_blocks()
    {
        var terrain = Strip();
        terrain[new HexCoord(3, 3)] = Terrain.Mountain;
        var walls = Index(terrain, Column(-3, 2));

        Assert.False(walls.IsHalfOpen(new HexCoord(3, 2)));
        Assert.Null(Route(terrain, walls, Stranger));
        Assert.Null(Route(terrain, walls, Owner));
    }

    [Fact]
    public void A_land_end_that_touches_a_wide_river_is_sealed()
    {
        var terrain = Strip();
        terrain.Remove(new HexCoord(3, 3));
        var river = new HexCoord(2, 3);
        var walls = new PalisadeIndex(
            Column(-3, 2), h => terrain.GetValueOrDefault(h, Terrain.Sea), h => h == river);

        Assert.False(walls.IsHalfOpen(new HexCoord(3, 2)));
    }

    [Fact]
    public void A_wall_that_runs_into_the_sea_ends_in_a_sea_end_that_seals_it()
    {
        // The sea end on the water hex (3,3) joins (3,2), which then has two wall neighbours and is no end any more.
        var terrain = Strip();
        terrain.Remove(new HexCoord(3, 3));
        var walls = Index(terrain, Column(-3, 3));

        Assert.False(walls.IsHalfOpen(new HexCoord(3, 2)));
        Assert.False(walls.IsHalfOpen(new HexCoord(3, 3)));
        Assert.Null(Route(terrain, walls, Stranger));
        Assert.Null(Route(terrain, walls, Owner));
    }

    [Fact]
    public void A_single_isolated_wall_hex_blocks_and_is_walked_round()
    {
        var terrain = Strip();
        var walls = Index(terrain, [new StandingWall(new HexCoord(3, 0), IsGate: false, Owner)]);

        Assert.False(walls.IsHalfOpen(new HexCoord(3, 0)));
        var path = Route(terrain, walls, Stranger);
        Assert.NotNull(path);
        Assert.DoesNotContain(new HexCoord(3, 0), path!);
    }

    [Fact]
    public void Fleets_are_unaffected_by_walls()
    {
        // All sea: a wall hex on the water is no obstacle for a ship.
        var sea = new Dictionary<HexCoord, Terrain>();
        for (var q = 0; q <= 6; q++)
        {
            for (var r = -3; r <= 3; r++)
            {
                sea[new HexCoord(q, r)] = Terrain.Sea;
            }
        }

        var walls = Index(sea, Column(-3, 3));

        Assert.NotNull(Route(sea, walls, Stranger, landUnit: false));
    }

    [Fact]
    public void No_standing_wall_means_no_wall_rules()
    {
        Assert.Null(Index(Strip(), []).ForOwner(Owner));
    }
}
