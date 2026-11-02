using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Camps;

public class CampStateTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private static Camp Strong(string family = CampFamilies.Wolfden, int level = 1) =>
        new(new HexCoord(10, 0), family, level, TileOrientation.E);

    private static Camp Weak(int level = 1) =>
        new(new HexCoord(10, 0), CampFamilies.Harewarren, level, TileOrientation.E);

    [Fact]
    public void Pristine_camp_is_full_never_calm_and_aggressive_when_strong()
    {
        var camp = Strong(level: 2);
        var state = CampState.Pristine(camp, T0);
        Assert.Equal(CampGarrison.Full(CampStrength.Strong, 2), state.GarrisonAt(camp, T0, insideRealm: false));
        Assert.False(state.IsCalmAt(T0));
        Assert.True(state.IsAggressiveAt(camp, T0, false));
        Assert.Equal(ResourceAmounts.Zero, state.Leftover);
    }

    [Fact]
    public void Weak_camp_is_never_aggressive()
    {
        var camp = Weak();
        Assert.False(CampState.Pristine(camp, T0).IsAggressiveAt(camp, T0, false));
    }

    [Fact]
    public void Strong_camp_regrows_to_full_in_eight_hours()
    {
        var camp = Strong(level: 3);
        var state = CampState.Pristine(camp, T0).AfterFight(camp, T0, new CampGarrison(1, 0, 0));
        Assert.Equal(CampGarrison.Full(CampStrength.Strong, 3), state.GarrisonAt(camp, T0.AddHours(8), false));
    }

    [Fact]
    public void Weak_camp_regrows_to_full_in_four_hours()
    {
        var camp = Weak(level: 3);
        var state = CampState.Pristine(camp, T0).AfterFight(camp, T0, new CampGarrison(1, 0, 0));
        Assert.Equal(CampGarrison.Full(CampStrength.Weak, 3), state.GarrisonAt(camp, T0.AddHours(4), false));
    }

    [Fact]
    public void Regrowth_is_linear_and_floors_per_tier()
    {
        var camp = Strong(level: 5); // full 7 / 18 / 4
        var state = CampState.Pristine(camp, T0).AfterFight(camp, T0, new CampGarrison(0, 2, 0));
        var half = state.GarrisonAt(camp, T0.AddHours(4), false);
        Assert.Equal(new CampGarrison(3, 2 + 9, 2), half);
        Assert.Equal(state.Snapshot, state.GarrisonAt(camp, T0.AddHours(-1), false));
    }

    [Fact]
    public void Cleared_camp_inside_a_realm_stays_empty()
    {
        var camp = Strong();
        var state = CampState.Pristine(camp, T0).AfterFight(camp, T0, CampGarrison.Empty);
        Assert.True(state.IsEmptyAt(camp, T0.AddDays(30), insideRealm: true));
    }

    [Fact]
    public void Cleared_camp_outside_a_realm_respawns()
    {
        var camp = Strong();
        var state = CampState.Pristine(camp, T0).AfterFight(camp, T0, CampGarrison.Empty);
        Assert.Equal(CampGarrison.Full(CampStrength.Strong, 1), state.GarrisonAt(camp, T0.AddHours(8), insideRealm: false));
    }

    [Fact]
    public void Fenrir_brood_regrows_even_inside_a_realm()
    {
        var camp = Strong(CampFamilies.Fenrirbrood);
        var state = CampState.Pristine(camp, T0).AfterFight(camp, T0, CampGarrison.Empty);
        Assert.Equal(CampGarrison.Full(CampStrength.Strong, 1), state.GarrisonAt(camp, T0.AddHours(8), insideRealm: true));
    }

    [Fact]
    public void A_damaged_but_not_cleared_camp_still_regrows_inside_a_realm()
    {
        var camp = Strong();
        var state = CampState.Pristine(camp, T0).AfterFight(camp, T0, new CampGarrison(1, 0, 0));
        Assert.False(state.GarrisonAt(camp, T0.AddHours(8), insideRealm: true).IsEmpty);
    }

    [Fact]
    public void After_a_fight_the_camp_is_calm_for_a_day_then_attacks_again()
    {
        var camp = Strong();
        var state = CampState.Pristine(camp, T0).AfterFight(camp, T0, new CampGarrison(0, 5, 0));
        Assert.True(state.IsCalmAt(T0.AddHours(23.9)));
        Assert.False(state.IsAggressiveAt(camp, T0.AddHours(23.9), false));
        Assert.False(state.IsCalmAt(T0.AddHours(24)));
        Assert.True(state.IsAggressiveAt(camp, T0.AddHours(24), false));
    }

    [Fact]
    public void Camp_with_only_young_is_not_aggressive()
    {
        var camp = Strong();
        var state = new CampState(new CampGarrison(3, 0, 0), T0, null, null, 0);
        Assert.False(state.IsAggressiveAt(camp, T0, false));
    }

    [Fact]
    public void Clearing_fight_counts_a_clear_and_a_surviving_camp_does_not()
    {
        var camp = Strong();
        var pristine = CampState.Pristine(camp, T0);
        var cleared = pristine.AfterFight(camp, T0, CampGarrison.Empty);
        Assert.Equal(1, cleared.Clears);
        Assert.Equal(T0, cleared.ClearedAt);

        var damaged = cleared.AfterFight(camp, T0.AddHours(30), new CampGarrison(1, 1, 0));
        Assert.Equal(1, damaged.Clears);
        Assert.Null(damaged.ClearedAt);
    }

    [Fact]
    public void Tenth_clear_raises_the_regrown_garrison_to_the_next_level()
    {
        var camp = Strong();
        var state = CampState.Pristine(camp, T0) with { Clears = 9 };
        state = state.AfterFight(camp, T0, CampGarrison.Empty);
        Assert.Equal(2, state.EffectiveLevel(camp));
        Assert.Equal(CampGarrison.Full(CampStrength.Strong, 2), state.GarrisonAt(camp, T0.AddHours(8), false));
    }

    [Fact]
    public void Loot_available_scales_with_the_standing_garrison()
    {
        var camp = Strong(); // L1 pool 600 food/wood/iron, full defense 195
        var state = CampState.Pristine(camp, T0).AfterFight(camp, T0, new CampGarrison(0, 3, 0)); // defense 90
        var available = state.LootAvailableAt(camp, T0, false);
        var fraction = 90.0 / 195.0;
        Assert.Equal(Math.Floor(600 * fraction), available.Food);
        Assert.Equal(0, available.Stone);
        Assert.Equal(Math.Floor(600 * fraction), available.Iron);
    }

    [Fact]
    public void Loot_available_is_zero_for_an_empty_camp_without_leftover()
    {
        var camp = Strong();
        var state = CampState.Pristine(camp, T0).AfterFight(camp, T0, CampGarrison.Empty);
        Assert.Equal(ResourceAmounts.Zero, state.LootAvailableAt(camp, T0, insideRealm: true));
    }

    [Fact]
    public void Pickup_takes_leftover_without_touching_clears_regrowth_or_calm()
    {
        var camp = Strong();
        var cleared = CampState.Pristine(camp, T0).AfterFight(camp, T0, CampGarrison.Empty)
            with { Leftover = new ResourceAmounts(100, 0, 100, 100) };

        var after = cleared.AfterPickup(new ResourceAmounts(40, 0, 100, 0));

        Assert.Equal(new ResourceAmounts(60, 0, 0, 100), after.Leftover);
        Assert.Equal(cleared.Clears, after.Clears);
        Assert.Equal(cleared.ClearedAt, after.ClearedAt);
        Assert.Equal(cleared.SnapshotAt, after.SnapshotAt);
        Assert.Equal(cleared.CalmUntil, after.CalmUntil);
        Assert.Equal(cleared.Snapshot, after.Snapshot);
    }
}
