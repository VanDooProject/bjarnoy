using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>The chain rule (<c>docs/design/economy.md</c> section 5): a tower claims only while it is connected to a longhouse.</summary>
public class ConnectedRealmTests
{
    private static readonly Guid A = Guid.Parse("00000000-0000-0000-0000-00000000000a");
    private static readonly Guid B = Guid.Parse("00000000-0000-0000-0000-00000000000b");

    // Longhouse level 2 claims radius 3; a level-2 tower claims radius 2.
    private static PlacedBuilding Longhouse(HexCoord at) => new(at, BuildingType.Longhouse, 2);

    private static PlacedBuilding Tower(int q, int level = 2) => new(new HexCoord(q, 0), BuildingType.Tower, level);

    private static RealmSettlement Settlement(Guid id, HexCoord centre, params PlacedBuilding[] towers) =>
        new(id, centre, [Longhouse(centre), .. towers]);

    private static Bjarnoy.Domain.Economy.ResourcePool StockFor(int longhouseLevel)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);
        return Bjarnoy.Domain.Economy.ResourcePool.Create(
            Bjarnoy.Domain.Economy.ResourceAmounts.Uniform(1_000_000), production, capacity, DateTimeOffset.UnixEpoch);
    }

    private static bool Claims(ConnectedRealm realm, int q) => realm.Covers(new HexCoord(q, 0));

    [Fact]
    public void A_straight_chain_from_the_longhouse_stays_connected()
    {
        // LH at 0 (reach 3), towers at 3 (reach 5), 5 (reach 7), 7 (reach 9).
        var realm = ConnectedRealm.Resolve([Settlement(A, new HexCoord(0, 0), Tower(3), Tower(5), Tower(7))]);

        Assert.True(realm.IsTowerConnected(A, new HexCoord(3, 0)));
        Assert.True(realm.IsTowerConnected(A, new HexCoord(5, 0)));
        Assert.True(realm.IsTowerConnected(A, new HexCoord(7, 0)));
        Assert.True(Claims(realm, 9));
        Assert.False(Claims(realm, 10));
    }

    [Fact]
    public void A_chain_broken_in_the_middle_drops_the_far_side()
    {
        // The tower at 5 fell: the one at 7 stands on ground nobody claims any more.
        var realm = ConnectedRealm.Resolve([Settlement(A, new HexCoord(0, 0), Tower(3), Tower(7))]);

        Assert.True(realm.IsTowerConnected(A, new HexCoord(3, 0)));
        Assert.False(realm.IsTowerConnected(A, new HexCoord(7, 0)));
        Assert.False(Claims(realm, 7));
        Assert.False(Claims(realm, 9));
        Assert.True(Claims(realm, 5));
    }

    [Fact]
    public void A_chain_reached_by_a_second_longhouse_on_the_far_side_stays_connected()
    {
        // Second longhouse at 10 (reach 13) covers the tower at 7 (distance 3); the middle tower at 5 is gone.
        var realm = ConnectedRealm.Resolve(
        [
            Settlement(A, new HexCoord(0, 0), Tower(3)),
            Settlement(B, new HexCoord(10, 0), Tower(7)),
        ]);

        Assert.True(realm.IsTowerConnected(B, new HexCoord(7, 0)));
        Assert.True(Claims(realm, 5));
        Assert.True(Claims(realm, 9));
    }

    [Fact]
    public void A_chain_reaches_across_settlements_in_either_direction()
    {
        // The tower of A at 7 stands on ground only B's longhouse (at 10) claims.
        var realm = ConnectedRealm.Resolve(
        [
            Settlement(A, new HexCoord(0, 0), Tower(7)),
            Settlement(B, new HexCoord(10, 0)),
        ]);

        Assert.True(realm.IsTowerConnected(A, new HexCoord(7, 0)));
        Assert.Contains((new HexCoord(7, 0), 2), realm.DiscsOf(A));
    }

    [Fact]
    public void Reconnecting_after_a_rebuild_connects_the_far_tower_again()
    {
        var broken = ConnectedRealm.Resolve([Settlement(A, new HexCoord(0, 0), Tower(3), Tower(7))]);
        var rebuilt = ConnectedRealm.Resolve([Settlement(A, new HexCoord(0, 0), Tower(3), Tower(5), Tower(7))]);

        Assert.False(broken.IsTowerConnected(A, new HexCoord(7, 0)));
        Assert.True(rebuilt.IsTowerConnected(A, new HexCoord(7, 0)));
    }

    [Fact]
    public void A_level_zero_stub_claims_nothing_and_connects_nothing()
    {
        // The stub at 3 is not a standing tower, so the level-2 tower at 6 (outside the longhouse's reach 3, inside the stub's
        // would-be reach) is not connected through it.
        var realm = ConnectedRealm.Resolve([Settlement(A, new HexCoord(0, 0), Tower(3, level: 0), Tower(6))]);

        Assert.False(realm.IsTowerConnected(A, new HexCoord(3, 0)));
        Assert.False(realm.IsTowerConnected(A, new HexCoord(6, 0)));
        Assert.False(Claims(realm, 6));
    }

    [Fact]
    public void A_tower_standing_on_another_own_settlements_ground_is_connected_through_it()
    {
        var realm = ConnectedRealm.Resolve(
        [
            Settlement(A, new HexCoord(0, 0)),
            Settlement(B, new HexCoord(20, 0), Tower(2)),
        ]);

        // B's tower at 2 is inside A's longhouse reach (3) and 18 hexes from B's own longhouse.
        Assert.True(realm.IsTowerConnected(B, new HexCoord(2, 0)));
        Assert.Contains((new HexCoord(2, 0), 2), realm.DiscsOf(B));
        Assert.DoesNotContain((new HexCoord(2, 0), 2), realm.DiscsOf(A));
    }

    [Fact]
    public void A_different_players_realm_never_connects_your_towers()
    {
        // Two separate resolves: one per player. The foreign longhouse right next to the tower does not count.
        var mine = ConnectedRealm.Resolve([Settlement(A, new HexCoord(0, 0), Tower(8))]);
        var theirs = ConnectedRealm.Resolve([Settlement(B, new HexCoord(8, 0))]);

        Assert.False(mine.IsTowerConnected(A, new HexCoord(8, 0)));
        Assert.True(theirs.Covers(new HexCoord(8, 0)));
        Assert.False(mine.Covers(new HexCoord(8, 0)));
    }

    [Fact]
    public void Groups_resolve_independently_per_player_and_island()
    {
        var realms = ConnectedRealm.ResolveGroups(
        [
            (("me", 1), Settlement(A, new HexCoord(0, 0), Tower(8))),
            (("you", 1), Settlement(B, new HexCoord(8, 0))),
        ]);

        Assert.False(realms[A].IsTowerConnected(A, new HexCoord(8, 0)));
        Assert.False(realms[A].Covers(new HexCoord(8, 0)));
        Assert.True(realms[B].Covers(new HexCoord(8, 0)));
    }

    [Fact]
    public void Towers_on_another_island_never_connect()
    {
        // The caller groups by island: the second island's longhouse is a different group, so it cannot reach across.
        var realms = ConnectedRealm.ResolveGroups(
        [
            (("me", 1), Settlement(A, new HexCoord(0, 0), Tower(8))),
            (("me", 2), Settlement(B, new HexCoord(8, 0))),
        ]);

        Assert.False(realms[A].IsTowerConnected(A, new HexCoord(8, 0)));
    }

    [Fact]
    public void Only_connected_tower_hexes_count_against_the_limit()
    {
        var realm = ConnectedRealm.Resolve([Settlement(A, new HexCoord(0, 0), Tower(3), Tower(7))]);

        var counted = realm.CountConnected([new HexCoord(3, 0), new HexCoord(7, 0)]);

        Assert.Equal(1, counted);
    }

    [Fact]
    public void A_lone_settlement_claims_like_ClaimDiscsFor()
    {
        var centre = new HexCoord(0, 0);
        PlacedBuilding[] buildings = [Longhouse(centre), Tower(3), Tower(7)];

        var discs = Bjarnoy.Domain.Buildings.Settlement.ClaimDiscsFor(centre, buildings).ToList();

        Assert.Equal(2, discs.Count);
        Assert.DoesNotContain(discs, d => d.Centre == new HexCoord(7, 0));
    }

    [Fact]
    public void PlanBuild_refuses_a_build_on_ground_only_a_cut_off_tower_claims()
    {
        var centre = new HexCoord(0, 0);
        var settlement = new Bjarnoy.Domain.Buildings.Settlement
        {
            Id = A,
            Name = "A",
            Centre = centre,
            Resources = StockFor(2),
            Buildings = [Longhouse(centre), Tower(3), Tower(7)],
        };

        var onFarGround = settlement.PlanBuild(
            BuildingType.Lumberjack, new HexCoord(8, 0), Terrain.Forest, DateTimeOffset.UnixEpoch, Guid.CreateVersion7());
        var onNearGround = settlement.PlanBuild(
            BuildingType.Lumberjack, new HexCoord(4, 0), Terrain.Forest, DateTimeOffset.UnixEpoch, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.HexNotInSettlement, onFarGround.Rejection);
        Assert.NotEqual(BuildRejection.HexNotInSettlement, onNearGround.Rejection);
    }

    [Fact]
    public void PlanBuild_accepts_ground_claimed_by_the_players_other_settlement()
    {
        var centre = new HexCoord(0, 0);
        var settlement = new Bjarnoy.Domain.Buildings.Settlement
        {
            Id = A,
            Name = "A",
            Centre = centre,
            Resources = StockFor(2),
            Buildings = [Longhouse(centre)],
        };
        var realm = ConnectedRealm.Resolve([settlement.AsRealmSettlement(), Settlement(B, new HexCoord(10, 0))]);

        var alone = settlement.PlanBuild(
            BuildingType.Lumberjack, new HexCoord(9, 0), Terrain.Forest, DateTimeOffset.UnixEpoch, Guid.CreateVersion7());
        var shared = settlement.PlanBuild(
            BuildingType.Lumberjack, new HexCoord(9, 0), Terrain.Forest, DateTimeOffset.UnixEpoch, Guid.CreateVersion7(),
            realm: realm);

        Assert.Equal(BuildRejection.HexNotInSettlement, alone.Rejection);
        Assert.NotEqual(BuildRejection.HexNotInSettlement, shared.Rejection);
    }

    [Fact]
    public void A_cut_off_tower_does_not_count_against_the_tower_limit_and_a_connected_one_does()
    {
        // Longhouse level 3 allows exactly one tower. The tower at 7 is cut off, so a new tower is allowed.
        var centre = new HexCoord(0, 0);
        Bjarnoy.Domain.Buildings.Settlement With(params PlacedBuilding[] towers) => new()
        {
            Id = A,
            Name = "A",
            Centre = centre,
            Resources = StockFor(3),
            Buildings = [new PlacedBuilding(centre, BuildingType.Longhouse, 3), .. towers],
        };

        var cutOff = With(Tower(7));
        var connected = With(Tower(2));

        var allowed = cutOff.PlanBuild(BuildingType.Tower, new HexCoord(1, 0), Terrain.Grass, DateTimeOffset.UnixEpoch, Guid.CreateVersion7());
        var refused = connected.PlanBuild(BuildingType.Tower, new HexCoord(1, 0), Terrain.Grass, DateTimeOffset.UnixEpoch, Guid.CreateVersion7());

        Assert.NotEqual(BuildRejection.TowerLimitReached, allowed.Rejection);
        Assert.Equal(BuildRejection.TowerLimitReached, refused.Rejection);
    }
}
