using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class TrainingAndGarrisonTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);

    /// <summary>
    /// A settlement at a given longhouse level, rich enough that affordability
    /// is never the thing under test unless the caller overrides
    /// <paramref name="stock"/>.
    /// </summary>
    private static Settlement Found(int longhouseLevel = 1, double stock = 1_000_000)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, longhouseLevel)],
            Resources = ResourcePool.Create(
                ResourceAmounts.Uniform(stock), production, capacity, T0),
        };
    }

    private static TrainingOrder Plan(Settlement settlement, UnitType type, int count, DateTimeOffset now)
    {
        var decision = settlement.PlanTrain(type, count, now, Guid.CreateVersion7());
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        return decision.Order!;
    }

    [Fact]
    public void A_unit_below_its_longhouse_requirement_is_refused()
    {
        var settlement = Found(longhouseLevel: 1);

        var decision = settlement.PlanTrain(UnitType.Axeman, 1, T0, Guid.CreateVersion7());

        Assert.Equal(TrainRejection.UnitNotAvailable, decision.Rejection);
    }

    [Fact]
    public void A_unit_whose_prerequisite_is_not_yet_available_is_refused()
    {
        // Longhouse 6 unlocks Berserker's own requirement, but Berserker also
        // needs Axeman to be available, which it is at 6 — so pick a level
        // where only the direct requirement is met to prove the recursive
        // check actually runs: there is none below 6 where Berserker's own
        // level passes but Axeman's does not, since Axeman only needs 3. This
        // test instead pins the negative case at the catalogue level — see
        // UnitCatalogueTests — and here just confirms PlanTrain surfaces it.
        var settlement = Found(longhouseLevel: 5);

        var decision = settlement.PlanTrain(UnitType.Berserker, 1, T0, Guid.CreateVersion7());

        Assert.Equal(TrainRejection.UnitNotAvailable, decision.Rejection);
    }

    [Fact]
    public void Training_that_cannot_be_afforded_is_refused()
    {
        var poor = Found(longhouseLevel: 1, stock: 0);

        var decision = poor.PlanTrain(UnitType.Thrall, 1, T0, Guid.CreateVersion7());

        Assert.Equal(TrainRejection.NotEnoughResources, decision.Rejection);
    }

    [Fact]
    public void A_zero_or_negative_count_is_refused()
    {
        var settlement = Found();

        Assert.Equal(TrainRejection.InvalidCount, settlement.PlanTrain(UnitType.Thrall, 0, T0, Guid.CreateVersion7()).Rejection);
        Assert.Equal(TrainRejection.InvalidCount, settlement.PlanTrain(UnitType.Thrall, -1, T0, Guid.CreateVersion7()).Rejection);
    }

    [Fact]
    public void Cost_and_duration_scale_with_batch_size()
    {
        var settlement = Found();
        var unitCost = UnitCatalogue.Get(UnitType.Thrall).TrainingCost;

        var order = Plan(settlement, UnitType.Thrall, 5, T0);
        var queued = settlement.EnqueueTraining(order, T0);

        Assert.Equal(
            settlement.Resources.At(T0).Wood - (unitCost.Wood * 5),
            queued.Resources.At(T0).Wood,
            6);

        // Duration scales as five units trained one after another, not five
        // units trained in parallel.
        Assert.Equal(
            (UnitCatalogue.Get(UnitType.Thrall).TrainingDuration.Ticks * 5),
            order.CompletesAt.Ticks - order.StartedAt.Ticks);
    }

    [Fact]
    public void The_training_queue_is_capped_separately_from_the_build_queue()
    {
        var settlement = Found();

        for (var i = 0; i < Settlement.MaxTrainingQueueLength; i++)
        {
            var order = Plan(settlement, UnitType.Thrall, 1, T0);
            settlement = settlement.EnqueueTraining(order, T0);
        }

        Assert.Equal(Settlement.MaxTrainingQueueLength, settlement.TrainingQueue.Count);

        var overflow = settlement.PlanTrain(UnitType.Thrall, 1, T0, Guid.CreateVersion7());

        Assert.Equal(TrainRejection.TrainingQueueFull, overflow.Rejection);
    }

    /// <summary>Ship training's coastal requirement (issue #40 phase 6 §4).</summary>
    [Fact]
    public void Training_a_ship_at_a_non_coastal_settlement_is_refused()
    {
        var settlement = Found(longhouseLevel: 5);

        var decision = settlement.PlanTrain(UnitType.Karve, 1, T0, Guid.CreateVersion7(), hasShoreline: false);

        Assert.Equal(TrainRejection.SettlementNotCoastal, decision.Rejection);
    }

    [Fact]
    public void Training_a_ship_at_a_coastal_settlement_is_accepted()
    {
        var settlement = Found(longhouseLevel: 5);

        var decision = settlement.PlanTrain(UnitType.Karve, 1, T0, Guid.CreateVersion7(), hasShoreline: true);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
    }

    [Fact]
    public void A_non_ship_unit_is_unaffected_by_the_shoreline_requirement()
    {
        var settlement = Found(longhouseLevel: 1);

        var decision = settlement.PlanTrain(UnitType.Thrall, 1, T0, Guid.CreateVersion7(), hasShoreline: false);

        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
    }

    [Fact]
    public void Enqueueing_an_unaffordable_order_throws_rather_than_going_into_debt()
    {
        var settlement = Found();
        var order = Plan(settlement, UnitType.Thrall, 1, T0);
        var broke = settlement with
        {
            Resources = ResourcePool.Create(
                ResourceAmounts.Zero, ResourceAmounts.Zero, ResourceAmounts.Uniform(1_000_000), T0),
        };

        Assert.Throws<InvalidOperationException>(() => broke.EnqueueTraining(order, T0));
    }

    [Fact]
    public void A_completed_batch_lands_in_the_garrison_all_at_once()
    {
        var settlement = Found();
        var order = Plan(settlement, UnitType.Thrall, 3, T0);
        var queued = settlement.EnqueueTraining(order, T0);

        var result = queued.SettleTo(order.CompletesAt);

        Assert.True(result.Changed);
        Assert.Empty(result.Settlement.TrainingQueue);
        var stack = Assert.Single(result.Settlement.Garrison);
        Assert.Equal(UnitType.Thrall, stack.Type);
        Assert.Equal(3, stack.Count);
        Assert.Equal(order.Id, Assert.Single(result.TrainingCompleted).Id);
    }

    [Fact]
    public void A_batch_still_in_progress_shows_partial_progress_but_nothing_in_the_garrison()
    {
        var settlement = Found();
        var order = Plan(settlement, UnitType.Thrall, 4, T0);
        var queued = settlement.EnqueueTraining(order, T0);

        var midway = order.StartedAt + TimeSpan.FromTicks(order.PerUnitDuration.Ticks * 2);
        var result = queued.SettleTo(midway);

        // Half the batch's time has passed, so CompletedCount says 2 — purely
        // a display computation, per TrainingOrder's remarks — but nothing is
        // due yet, so nothing is written and the garrison is still empty.
        Assert.False(result.Changed);
        Assert.Empty(queued.Garrison);
        var stillQueued = Assert.Single(queued.TrainingQueue);
        Assert.Equal(2, stillQueued.CompletedCount(midway));
    }

    [Fact]
    public void Garrisoned_units_add_their_upkeep_as_a_food_deduction()
    {
        var settlement = Found(longhouseLevel: 1);
        var order = Plan(settlement, UnitType.Thrall, 10, T0);
        var queued = settlement.EnqueueTraining(order, T0);

        var (grossProduction, _) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        var expectedUpkeep = UnitCatalogue.Get(UnitType.Thrall).UpkeepPerHour * 10;

        var settled = queued.SettleTo(order.CompletesAt).Settlement;

        Assert.Equal(
            grossProduction.Food - expectedUpkeep, settled.Resources.RatePerHour.Food, 6);
    }

    [Fact]
    public void A_settlement_producing_enough_food_is_unaffected_by_a_small_garrison()
    {
        var settlement = Found(longhouseLevel: 1);
        var order = Plan(settlement, UnitType.Thrall, 1, T0);
        var settled = settlement.EnqueueTraining(order, T0).SettleTo(order.CompletesAt).Settlement;

        var later = settled.SettleTo(order.CompletesAt.AddDays(1));

        Assert.False(later.Changed);
        Assert.Empty(later.Deaths);
        Assert.True(settled.Resources.RatePerHour.Food >= 0);
    }

    [Fact]
    public void Stock_never_goes_negative_even_under_heavy_upkeep()
    {
        var longhouseLevel = 1;
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);

        // A garrison whose upkeep dwarfs production: food must floor at zero,
        // not run away negative, regardless of how long nobody looks.
        var settlement = new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, longhouseLevel)],
            Garrison = [new UnitStack(UnitType.Berserker, 50)],
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: 20, Iron: 1_000_000),
                production with { Food = production.Food - (50 * UnitCatalogue.Get(UnitType.Berserker).UpkeepPerHour) },
                capacity,
                T0),
        };

        var result = settlement.SettleTo(T0.AddDays(30));

        Assert.True(result.Changed);
        Assert.True(result.Settlement.Resources.At(T0.AddDays(30)).Food >= 0);
        Assert.True(result.Settlement.Resources.RatePerHour.Food >= 0);
    }

    [Fact]
    public void Starvation_kills_enough_of_the_highest_upkeep_stack_to_zero_out_the_deficit()
    {
        var longhouseLevel = 6;
        var (production, _) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);
        var berserkerUpkeep = UnitCatalogue.Get(UnitType.Berserker).UpkeepPerHour;

        // 40 Berserkers cost 80/h; the longhouse alone makes 60/h of food, so
        // the net rate starts at -20/h.
        var garrison = new List<UnitStack> { new(UnitType.Berserker, 40) };
        var netFoodRate = production.Food - (garrison[0].Count * berserkerUpkeep);

        var settlement = SettlementWith(longhouseLevel, garrison, netFoodRate, foodStock: 10);

        var result = settlement.SettleTo(T0.AddHours(1));

        Assert.True(result.Changed);
        var death = Assert.Single(result.Deaths);
        Assert.Equal(UnitType.Berserker, death.Type);
        Assert.Equal(10, death.Count); // ceil(20 / 2) units needed to zero the deficit
        Assert.Equal(30, Assert.Single(result.Settlement.Garrison).Count);
        Assert.True(result.Settlement.Resources.RatePerHour.Food >= 0);
    }

    [Fact]
    public void Starvation_prefers_the_highest_upkeep_stack_and_moves_on_if_it_is_not_enough()
    {
        var longhouseLevel = 6;
        var (production, _) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);
        var spearmanUpkeep = UnitCatalogue.Get(UnitType.Spearman).UpkeepPerHour;
        var berserkerUpkeep = UnitCatalogue.Get(UnitType.Berserker).UpkeepPerHour;

        var garrison = new List<UnitStack>
        {
            new(UnitType.Spearman, 100),
            new(UnitType.Berserker, 10),
        };
        var totalUpkeep = (100 * spearmanUpkeep) + (10 * berserkerUpkeep);
        var netFoodRate = production.Food - totalUpkeep;

        var settlement = SettlementWith(longhouseLevel, garrison, netFoodRate, foodStock: 5);

        var result = settlement.SettleTo(T0.AddHours(1));

        Assert.Equal(2, result.Deaths.Count);
        // Berserker (upkeep 2/unit) is the highest-upkeep stack, so it is
        // fully wiped out first even though wiping it out alone is not
        // enough; the shortfall then comes out of the Spearman stack.
        Assert.Equal(UnitType.Berserker, result.Deaths[0].Type);
        Assert.Equal(10, result.Deaths[0].Count);
        Assert.Equal(UnitType.Spearman, result.Deaths[1].Type);

        var remainingSpearmen = result.Settlement.Garrison.Single(s => s.Type == UnitType.Spearman).Count;
        Assert.DoesNotContain(result.Settlement.Garrison, s => s.Type == UnitType.Berserker);
        Assert.True(result.Settlement.Resources.RatePerHour.Food >= 0);
        Assert.Equal(100 - result.Deaths[1].Count, remainingSpearmen);
    }

    [Fact]
    public void Starvation_can_wipe_out_the_whole_garrison_if_upkeep_never_catches_up()
    {
        // No buildings at all (an edge case, not a realistic founded
        // settlement) means SettleTo's freshly recomputed gross production is
        // genuinely zero, so any upkeep whatsoever is unsustainable and every
        // unit must eventually die — unlike a real settlement, where the
        // longhouse alone always makes some food.
        var garrison = new List<UnitStack> { new(UnitType.Thrall, 3) };
        var netFoodRate = -(3 * UnitCatalogue.Get(UnitType.Thrall).UpkeepPerHour);

        var settlement = new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [],
            Garrison = garrison,
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 0, Stone: 0, Food: 2, Iron: 0),
                new ResourceAmounts(Wood: 0, Stone: 0, Food: netFoodRate, Iron: 0),
                ResourceAmounts.Uniform(1000),
                T0),
        };

        var result = settlement.SettleTo(T0.AddHours(1));

        Assert.Empty(result.Settlement.Garrison);
        Assert.Equal(3, Assert.Single(result.Deaths).Count);
        Assert.Equal(0, result.Settlement.Resources.RatePerHour.Food, 6);
    }

    [Fact]
    public void Guest_upkeep_reduces_the_net_food_rate_just_like_home_garrison()
    {
        var settlement = Found(longhouseLevel: 6);
        var guestStacks = new List<UnitStack> { new(UnitType.Spearman, 10) };
        var expectedGuestUpkeep = UnitCatalogue.Get(UnitType.Spearman).UpkeepPerHour * 10;

        var withoutGuests = settlement.SettleTo(T0.AddMinutes(1)); // no-op, but establishes a baseline rate
        var (production, _) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 6)]);

        var result = settlement.SettleTo(T0.AddMinutes(1), guestStacks: guestStacks);

        Assert.True(result.Changed); // nothing built, but the guest-aware rate itself is a real change
        Assert.Equal(production.Food - expectedGuestUpkeep, result.Settlement.Resources.RatePerHour.Food, 6);
        Assert.False(withoutGuests.Changed);
    }

    [Fact]
    public void Hosting_guests_alone_can_push_a_previously_self_sustaining_settlement_into_starvation()
    {
        var longhouseLevel = 1;
        var (production, _) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);

        // A tiny home garrison the settlement can easily sustain on its own —
        // production alone comfortably covers it.
        var homeGarrison = new List<UnitStack> { new(UnitType.Thrall, 1) };
        var homeUpkeep = UnitCatalogue.Get(UnitType.Thrall).UpkeepPerHour;
        Assert.True(production.Food - homeUpkeep >= 0, "test setup expects the home garrison alone to be sustainable");

        // A guest army heavy enough to flip the net rate negative purely by
        // being hosted.
        var guestStacks = new List<UnitStack> { new(UnitType.Berserker, 40) };
        var guestUpkeep = UnitCatalogue.Get(UnitType.Berserker).UpkeepPerHour * 40;

        var settlement = new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, longhouseLevel)],
            Garrison = homeGarrison,
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: 10, Iron: 1_000_000),
                production with { Food = production.Food - homeUpkeep - guestUpkeep },
                ResourceAmounts.Uniform(1_000_000),
                T0),
        };

        var result = settlement.SettleTo(T0.AddHours(1), guestStacks: guestStacks);

        Assert.True(result.Changed);
        Assert.NotEmpty(result.GuestDeaths); // the guest side starves...
        Assert.Empty(result.Deaths); // ...well before the tiny, cheap home garrison would need to
        Assert.Single(result.Settlement.Garrison); // home garrison untouched
        Assert.True(result.Settlement.Resources.RatePerHour.Food >= 0);
    }

    [Fact]
    public void A_mixed_home_and_guest_starvation_pass_splits_deaths_proportionally_by_pre_starvation_holding()
    {
        var longhouseLevel = 6;
        var (production, _) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);
        var berserkerUpkeep = UnitCatalogue.Get(UnitType.Berserker).UpkeepPerHour;

        // Same unit type on both sides so the pooled starvation pass has a
        // single type to kill from, split 30 home / 10 guest — 3:1.
        var homeGarrison = new List<UnitStack> { new(UnitType.Berserker, 30) };
        var guestStacks = new List<UnitStack> { new(UnitType.Berserker, 10) };
        var totalUpkeep = berserkerUpkeep * 40;
        var netFoodRate = production.Food - totalUpkeep;

        var settlement = new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, longhouseLevel)],
            Garrison = homeGarrison,
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: 10, Iron: 1_000_000),
                production with { Food = netFoodRate },
                ResourceAmounts.Uniform(1_000_000),
                T0),
        };

        var result = settlement.SettleTo(T0.AddHours(1), guestStacks: guestStacks);

        Assert.True(result.Changed);
        var homeDeaths = Assert.Single(result.Deaths).Count;
        var guestDeaths = Assert.Single(result.GuestDeaths).Count;

        // Pooled deaths killed some Berserkers; the 3:1 pre-starvation ratio
        // must hold (within a unit, from largest-remainder rounding) and both
        // sides must actually have lost something — this also proves guest
        // units die from starvation, not just home garrison ones.
        Assert.True(homeDeaths > 0);
        Assert.True(guestDeaths > 0);
        Assert.Equal(homeDeaths + guestDeaths, result.Deaths[0].Count + result.GuestDeaths[0].Count);
        Assert.InRange((double)homeDeaths / guestDeaths, 2.0, 4.0); // roughly 3:1
    }

    private static Settlement SettlementWith(
        int longhouseLevel, List<UnitStack> garrison, double netFoodRate, double foodStock)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, longhouseLevel)]);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, longhouseLevel)],
            Garrison = garrison,
            Resources = ResourcePool.Create(
                new ResourceAmounts(Wood: 1_000_000, Stone: 1_000_000, Food: foodStock, Iron: 1_000_000),
                production with { Food = netFoodRate },
                capacity,
                T0),
        };
    }
}
