using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Linked realms (<c>docs/design/economy.md</c> section 5): settlements whose realms touch share one realm.</summary>
public class LinkedGroupsTests
{
    private static readonly Guid A = Guid.Parse("00000000-0000-0000-0000-00000000000a");
    private static readonly Guid B = Guid.Parse("00000000-0000-0000-0000-00000000000b");
    private static readonly Guid C = Guid.Parse("00000000-0000-0000-0000-00000000000c");

    // Longhouse level 2 claims radius 3; a level-2 tower claims radius 2.
    private static RealmSettlement Settlement(Guid id, int q, params PlacedBuilding[] towers) =>
        new(id, new HexCoord(q, 0), [new PlacedBuilding(new HexCoord(q, 0), BuildingType.Longhouse, 2), .. towers]);

    private static PlacedBuilding Tower(int q) => new(new HexCoord(q, 0), BuildingType.Tower, 2);

    private static IReadOnlyList<IReadOnlyList<Guid>> Components(IGiantIndex? giants, params RealmSettlement[] settlements) =>
        LinkedGroups.Components(
            ConnectedRealm.Resolve(settlements), settlements.Select(s => s.Id).ToList(), giants ?? GiantIndex.Empty);

    [Fact]
    public void Overlapping_realms_link()
    {
        var components = Components(null, Settlement(A, 0), Settlement(B, 5));

        Assert.Equal([[A, B]], components);
    }

    [Fact]
    public void Edge_adjacent_realms_link()
    {
        // Distance 7 = 3 + 3 + 1: the discs do not overlap but their rims share an edge.
        Assert.Single(Components(null, Settlement(A, 0), Settlement(B, 7)));
    }

    [Fact]
    public void A_one_hex_gap_does_not_link()
    {
        var components = Components(null, Settlement(A, 0), Settlement(B, 8));

        Assert.Equal([[A], [B]], components);
    }

    [Fact]
    public void Linking_is_transitive()
    {
        // A-B and B-C touch, A-C are 14 apart.
        var components = Components(null, Settlement(A, 0), Settlement(B, 7), Settlement(C, 14));

        Assert.Equal([[A, B, C]], components);
    }

    [Fact]
    public void A_connected_tower_disc_links()
    {
        // The tower at 3 (reach 5) is connected; B at 9 (covers 6..12) sits edge-adjacent to it, but not to A's longhouse disc (0..3).
        var components = Components(null, Settlement(A, 0, Tower(3)), Settlement(B, 9));

        Assert.Single(components);
    }

    [Fact]
    public void A_cut_off_tower_does_not_link()
    {
        // The tower at 7 stands outside A's disc (reach 3), so it claims nothing and B at 12 stays unlinked.
        var components = Components(null, Settlement(A, 0, Tower(7)), Settlement(B, 12));

        Assert.Equal(2, components.Count);
    }

    [Fact]
    public void A_giant_only_partly_covered_by_each_does_not_link_through_its_hexes()
    {
        // Discs radius 3 at 0 and 7 only touch at q=3 / q=4; a giant anchored at (3,0) (footprint q 2..4) is
        // covered fully by neither disc, so those hexes are not claimed and the realms do not touch.
        var giants = new GiantIndex([new Giant(new HexCoord(3, 0), "giantmountain", TileOrientation.E)]);
        var settlements = new[] { Settlement(A, 0), Settlement(B, 7) };

        Assert.Single(Components(null, settlements));
        Assert.Equal(2, Components(giants, settlements).Count);
    }

    [Fact]
    public void RealmIds_picks_the_oldest_member_of_each_component()
    {
        var t0 = DateTimeOffset.UnixEpoch;
        var rows = new[]
        {
            ("p", Settlement(A, 0), t0.AddDays(2)),
            ("p", Settlement(B, 5), t0.AddDays(1)),
            ("p", Settlement(C, 30), t0.AddDays(3)),
        };

        var ids = LinkedGroups.RealmIds(rows, GiantIndex.Empty);

        Assert.Equal(B, ids[A]);
        Assert.Equal(B, ids[B]);
        Assert.Equal(C, ids[C]);
    }

    [Fact]
    public void RealmIds_never_links_different_player_keys()
    {
        var t0 = DateTimeOffset.UnixEpoch;
        var rows = new[]
        {
            ("p1", Settlement(A, 0), t0),
            ("p2", Settlement(B, 2), t0.AddDays(1)),
        };

        var ids = LinkedGroups.RealmIds(rows, GiantIndex.Empty);

        Assert.Equal(A, ids[A]);
        Assert.Equal(B, ids[B]);
    }
}
