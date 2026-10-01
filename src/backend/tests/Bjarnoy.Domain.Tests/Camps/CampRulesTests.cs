using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Camps;

public class CampRulesTests
{
    private static Camp Strong(int level = 1, string family = CampFamilies.Wolfden) =>
        new(new HexCoord(10, 0), family, level, TileOrientation.E);

    private static Camp Weak(int level = 1, string family = CampFamilies.Harewarren) =>
        new(new HexCoord(10, 0), family, level, TileOrientation.E);

    [Fact]
    public void Full_garrison_follows_the_spec_table()
    {
        Assert.Equal(new CampGarrison(3, 6, 0), CampGarrison.Full(CampStrength.Strong, 1));
        Assert.Equal(new CampGarrison(7, 18, 4), CampGarrison.Full(CampStrength.Strong, 5));
        Assert.Equal(new CampGarrison(3, 5, 0), CampGarrison.Full(CampStrength.Weak, 1));
        Assert.Equal(new CampGarrison(7, 13, 3), CampGarrison.Full(CampStrength.Weak, 5));
    }

    [Fact]
    public void Defense_power_matches_the_spec_numbers()
    {
        Assert.Equal(195, CampGarrison.Full(CampStrength.Strong, 1).DefensePower(CampStrength.Strong));
        Assert.Equal(815, CampGarrison.Full(CampStrength.Strong, 5).DefensePower(CampStrength.Strong));
        Assert.Equal(66, CampGarrison.Full(CampStrength.Weak, 1).DefensePower(CampStrength.Weak));
    }

    [Fact]
    public void Attack_power_sums_count_times_beast_attack()
    {
        var garrison = new CampGarrison(3, 6, 2);
        Assert.Equal((3 * 2) + (6 * 25) + (2 * 50), garrison.AttackPower(CampStrength.Strong));
        Assert.Equal(0 + (6 * 8) + (2 * 15), garrison.AttackPower(CampStrength.Weak));
    }

    [Fact]
    public void Garrison_flags_and_indexer()
    {
        Assert.True(CampGarrison.Empty.IsEmpty);
        Assert.False(new CampGarrison(4, 0, 0).HasFighters);
        Assert.True(new CampGarrison(0, 0, 1).HasFighters);
        var g = new CampGarrison(1, 2, 3);
        Assert.Equal(6, g.Total);
        Assert.Equal(2, g[BeastTier.Adult]);
        Assert.Equal("alpha", BeastTier.Alpha.ToWireName());
    }

    [Fact]
    public void Effective_level_rises_every_ten_clears_and_caps_at_100()
    {
        var camp = Strong(level: 3);
        Assert.Equal(3, CampRules.EffectiveLevel(camp, 9));
        Assert.Equal(4, CampRules.EffectiveLevel(camp, 10));
        Assert.Equal(13, CampRules.EffectiveLevel(camp, 100));
        Assert.Equal(100, CampRules.EffectiveLevel(camp, 5000));
    }

    [Fact]
    public void Guard_range_stays_on_the_rolled_level_however_often_cleared()
    {
        var camp = Strong(level: 2);
        var state = CampState.Pristine(camp, DateTimeOffset.UnixEpoch) with { Clears = 2000 };
        Assert.Equal(100, state.EffectiveLevel(camp));
        Assert.Equal(4, camp.GuardRange);
    }

    [Fact]
    public void Loot_pool_splits_evenly_over_wolfden_kinds()
    {
        var pool = CampRules.LootPool(Strong(1, CampFamilies.Wolfden), 1);
        Assert.Equal(new ResourceAmounts(Wood: 600, Stone: 0, Food: 600, Iron: 600), pool);
    }

    [Fact]
    public void Plus_plus_kind_gets_a_double_share()
    {
        var boar = CampRules.LootPool(Strong(1, CampFamilies.Boarwallow), 1); // food 2 : iron 1
        Assert.Equal(1200, boar.Food);
        Assert.Equal(600, boar.Iron);
        var fenrir = CampRules.LootPool(Strong(1, CampFamilies.Fenrirbrood), 1);
        Assert.Equal(600, fenrir.Food);
        Assert.Equal(1200, fenrir.Iron);
    }

    [Fact]
    public void Loot_pool_grows_with_level_to_the_seventh_tenth_and_rounds_down()
    {
        var pool = CampRules.LootPool(Strong(1, CampFamilies.Walrushaulout), 10); // food/iron share
        var expected = Math.Floor(1800 * Math.Pow(10, 0.7) / 2);
        Assert.Equal(expected, pool.Food);
        Assert.Equal(expected, pool.Iron);
        Assert.Equal(pool.Food, Math.Floor(pool.Food));
    }

    [Fact]
    public void Weak_camp_pays_only_its_own_kinds_from_the_weak_base()
    {
        Assert.Equal(new ResourceAmounts(0, 0, 450, 0), CampRules.LootPool(Weak(1, CampFamilies.Deerglade), 1));
        var beaver = CampRules.LootPool(Weak(1, CampFamilies.Beaverlodge), 1);
        Assert.Equal(new ResourceAmounts(225, 0, 225, 0), beaver);
    }

    [Fact]
    public void Eagle_eyrie_pays_food_stone_and_iron()
    {
        var kinds = CampRules.LootKinds(CampFamilies.Eagleeyrie).Select(k => k.Kind);
        Assert.Equal(["food", "stone", "iron"], kinds);
    }
}
