using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Camps;

public class CampTowerThreatTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly Guid Settlement = Guid.Parse("00000000-0000-0000-0000-000000000001");

    // A strong L1 camp guards 3 hexes.
    private static Camp Strong(int q, int r = 0) => new(new HexCoord(q, r), CampFamilies.Wolfden, 1, TileOrientation.E);

    private static Camp Weak(int q, int r = 0) => new(new HexCoord(q, r), CampFamilies.Harewarren, 1, TileOrientation.E);

    private static (Camp, CampState) Pristine(Camp camp) => (camp, CampState.Pristine(camp, Now.AddDays(-10)));

    private static (Camp, CampState) Calm(Camp camp) =>
        (camp, CampState.Pristine(camp, Now.AddDays(-10)) with { CalmUntil = Now.AddHours(5) });

    private static CampTowerTarget Standing(int q, int r = 0, Guid? settlement = null) =>
        new(settlement ?? Settlement, new HexCoord(q, r), CampTowerKind.Standing, null);

    private static CampTowerTarget Building(int q, TimeSpan startedAgo) =>
        new(Settlement, new HexCoord(q, 0), CampTowerKind.UnderConstruction, Now - startedAgo);

    private static IReadOnlyList<CampTowerAttack> Due(
        IEnumerable<(Camp, CampState)> camps, params CampTowerTarget[] towers) =>
        CampTowerThreat.Due(camps, _ => false, towers, Now);

    [Fact]
    public void A_standing_tower_in_range_is_attacked_at_once()
    {
        var attack = Assert.Single(Due([Pristine(Strong(0))], Standing(2)));

        Assert.Equal(new HexCoord(0, 0), attack.Camp.Coord);
        Assert.Equal(new HexCoord(2, 0), attack.Tower.Hex);
    }

    [Fact]
    public void A_tower_under_construction_waits_for_the_attack_delay()
    {
        Assert.Empty(Due([Pristine(Strong(0))], Building(2, CampRules.TowerAttackDelay - TimeSpan.FromSeconds(1))));

        var attack = Assert.Single(Due([Pristine(Strong(0))], Building(2, CampRules.TowerAttackDelay)));
        Assert.Equal(CampTowerKind.UnderConstruction, attack.Tower.Kind);
    }

    [Fact]
    public void A_calm_camp_attacks_nothing()
    {
        Assert.Empty(Due([Calm(Strong(0))], Standing(2)));
    }

    [Fact]
    public void A_camp_without_adults_or_alphas_attacks_nothing()
    {
        var camp = Strong(0);
        var youngOnly = (camp, CampState.Pristine(camp, Now.AddDays(-10)) with { Snapshot = new CampGarrison(3, 0, 0), SnapshotAt = Now });

        Assert.Empty(Due([youngOnly], Standing(2)));
    }

    [Fact]
    public void A_weak_camp_attacks_nothing()
    {
        Assert.Empty(Due([Pristine(Weak(0))], Standing(1)));
    }

    [Fact]
    public void A_tower_outside_the_guard_range_is_left_alone()
    {
        Assert.Empty(Due([Pristine(Strong(0))], Standing(4)));
        Assert.Single(Due([Pristine(Strong(0))], Standing(3)));
    }

    [Fact]
    public void A_camp_makes_at_most_one_attack_and_picks_the_closest_tower()
    {
        var attack = Assert.Single(Due([Pristine(Strong(0))], Standing(3), Standing(1), Standing(2)));

        Assert.Equal(new HexCoord(1, 0), attack.Tower.Hex);
    }

    [Fact]
    public void A_tower_still_under_construction_does_not_shield_a_farther_standing_one()
    {
        var attack = Assert.Single(Due([Pristine(Strong(0))], Building(1, TimeSpan.FromMinutes(5)), Standing(3)));

        Assert.Equal(new HexCoord(3, 0), attack.Tower.Hex);
    }

    [Fact]
    public void Equally_close_towers_are_picked_by_lowest_q_then_r()
    {
        var attack = Assert.Single(Due([Pristine(Strong(0))], Standing(1, 0), Standing(0, 1), Standing(-1, 1), Standing(-1, 0)));

        // All at distance 1: lowest q wins, then lowest r.
        Assert.Equal(new HexCoord(-1, 0), attack.Tower.Hex);
    }

    [Fact]
    public void The_choice_does_not_depend_on_input_order()
    {
        var towers = new[] { Standing(2, 0), Standing(0, 2), Standing(-2, 2) };
        var camps = new[] { Pristine(Strong(0)), Pristine(Strong(1, 1)) };

        var forward = Due(camps, towers);
        var backward = Due(camps.Reverse(), towers.Reverse().ToArray());

        Assert.Equal(forward, backward);
    }

    [Fact]
    public void Two_camps_do_not_attack_the_same_tower_in_one_scan()
    {
        var attacks = Due([Pristine(Strong(0)), Pristine(Strong(2))], Standing(1));

        var attack = Assert.Single(attacks);
        Assert.Equal(new HexCoord(0, 0), attack.Camp.Coord);
    }

    [Fact]
    public void Two_camps_with_their_own_towers_each_attack()
    {
        var attacks = Due([Pristine(Strong(0)), Pristine(Strong(20))], Standing(1), Standing(21));

        Assert.Equal(2, attacks.Count);
        Assert.Equal(new HexCoord(1, 0), attacks.Single(a => a.Camp.Coord.Q == 0).Tower.Hex);
        Assert.Equal(new HexCoord(21, 0), attacks.Single(a => a.Camp.Coord.Q == 20).Tower.Hex);
    }
}
