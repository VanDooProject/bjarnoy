using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Camps;

public class RealmIndexTests
{
    private static readonly HexCoord Centre = new(0, 0);

    private static RealmIndex OneSettlement(params PlacedBuilding[] extra) =>
        new RealmIndex().Add(Centre, [new PlacedBuilding(Centre, BuildingType.Longhouse, 1), .. extra]);

    [Fact]
    public void An_empty_index_has_no_realm_and_no_buildings()
    {
        Assert.False(RealmIndex.Empty.InsideRealm(Centre));
        Assert.False(RealmIndex.Empty.HasBuilding(Centre));
    }

    [Fact]
    public void The_claim_disc_of_a_settlement_is_a_realm_and_beyond_it_is_not()
    {
        var radius = Settlement.ClaimRadiusForLonghouseLevel(1);
        var realm = OneSettlement();

        Assert.True(realm.InsideRealm(new HexCoord(radius, 0)));
        Assert.False(realm.InsideRealm(new HexCoord(radius + 1, 0)));
    }

    [Fact]
    public void A_tower_extends_the_realm_around_its_own_hex()
    {
        var towerHex = new HexCoord(Settlement.ClaimRadiusForLonghouseLevel(1), 0);
        var far = new HexCoord(towerHex.Q + Settlement.TowerClaimRadius(1), 0);

        Assert.False(OneSettlement().InsideRealm(far));
        Assert.True(OneSettlement(new PlacedBuilding(towerHex, BuildingType.Tower, 1)).InsideRealm(far));
    }

    [Fact]
    public void Several_settlements_each_contribute_their_realm_and_buildings()
    {
        var other = new HexCoord(40, 0);
        var realm = OneSettlement().Add(other, [new PlacedBuilding(other, BuildingType.Longhouse, 1)]);

        Assert.True(realm.InsideRealm(other));
        Assert.True(realm.HasBuilding(other));
        Assert.True(realm.HasBuilding(Centre));
        Assert.False(realm.HasBuilding(new HexCoord(1, 0)));
    }
}
