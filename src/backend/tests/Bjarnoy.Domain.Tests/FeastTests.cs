using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class FeastTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);

    private static Settlement Found(int townSquareLevel = 1, double stock = 1_000_000)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        IReadOnlyList<PlacedBuilding> square = townSquareLevel > 0
            ? [new PlacedBuilding(new HexCoord(3, 0), BuildingType.TownSquare, townSquareLevel)]
            : [];

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 1), .. square],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(stock), production, ResourceAmounts.Uniform(1e9), T0),
        };
    }

    [Theory]
    [InlineData(1, 800, 3500)]
    [InlineData(2, 1000, 4025)]
    [InlineData(3, 1250, 4628.75)]
    [InlineData(10, 5960.464, 12312.6)]
    public void Cost_and_gain_follow_the_town_square_level(int level, double cost, double gain)
    {
        var each = Feasts.CostFor(level);

        Assert.Equal(cost, each.Wood, 3);
        Assert.Equal(cost, each.Stone, 3);
        Assert.Equal(cost, each.Food, 3);
        Assert.Equal(0, each.Iron);
        Assert.Equal(gain, Feasts.RenownFor(level), 0);
    }

    [Fact]
    public void A_feast_lasts_twelve_hours_and_carries_the_town_squares_gain()
    {
        var decision = Found(townSquareLevel: 2).PlanFeast(T0);

        Assert.True(decision.Accepted);
        Assert.Equal(T0, decision.Feast!.StartedAt);
        Assert.Equal(T0.AddHours(12), decision.Feast.EndsAt);
        Assert.Equal(Feasts.RenownFor(2), decision.Feast.RenownGain);
    }

    [Fact]
    public void The_world_speed_factor_shortens_the_feast()
    {
        var decision = Found().PlanFeast(T0, speedFactor: 4);

        Assert.Equal(T0.AddHours(3), decision.Feast!.EndsAt);
    }

    [Fact]
    public void Without_a_town_square_a_feast_is_refused()
    {
        Assert.Equal(FeastRejection.NoTownSquare, Found(townSquareLevel: 0).PlanFeast(T0).Rejection);
    }

    [Fact]
    public void A_feast_that_cannot_be_afforded_is_refused()
    {
        var settlement = Found(townSquareLevel: 1, stock: 799);

        Assert.Equal(FeastRejection.NotEnoughResources, settlement.PlanFeast(T0).Rejection);
    }

    [Fact]
    public void Starting_a_feast_pays_wood_stone_and_food_but_not_iron()
    {
        var settlement = Found(townSquareLevel: 3, stock: 5000);
        var decision = settlement.PlanFeast(T0);

        var started = settlement.StartFeast(decision.Feast!, T0);

        var stock = started.Resources.At(T0);
        Assert.Equal(5000 - 1250, stock.Wood, 3);
        Assert.Equal(5000 - 1250, stock.Stone, 3);
        Assert.Equal(5000 - 1250, stock.Food, 3);
        Assert.Equal(5000, stock.Iron, 3);
        Assert.Equal(decision.Feast, started.Feast);
    }

    [Fact]
    public void Only_one_feast_runs_at_a_time()
    {
        var settlement = Found();
        var running = settlement.StartFeast(settlement.PlanFeast(T0).Feast!, T0);

        Assert.Equal(FeastRejection.AlreadyRunning, running.PlanFeast(T0.AddHours(11)).Rejection);
        Assert.True(running.PlanFeast(T0.AddHours(12)).Accepted);
    }

    [Fact]
    public void A_feast_does_not_use_a_construction_slot()
    {
        var settlement = Found();
        var running = settlement.StartFeast(settlement.PlanFeast(T0).Feast!, T0);

        Assert.Equal(settlement.FreeSlots, running.FreeSlots);
    }

    [Fact]
    public void Settling_before_the_end_keeps_the_feast_and_grants_nothing()
    {
        var settlement = Found();
        var running = settlement.StartFeast(settlement.PlanFeast(T0).Feast!, T0);

        var result = running.SettleTo(T0.AddHours(11));

        Assert.NotNull(result.Settlement.Feast);
        Assert.Equal(0, result.Settlement.PendingFeastRenown);
    }

    [Fact]
    public void Settling_after_the_end_moves_the_gain_to_pending_exactly_once()
    {
        var settlement = Found(townSquareLevel: 2);
        var running = settlement.StartFeast(settlement.PlanFeast(T0).Feast!, T0);

        var first = running.SettleTo(T0.AddHours(13));
        var second = first.Settlement.SettleTo(T0.AddHours(30));

        Assert.True(first.Changed);
        Assert.Null(first.Settlement.Feast);
        Assert.Equal(Feasts.RenownFor(2), first.Settlement.PendingFeastRenown);
        Assert.Equal(Feasts.RenownFor(2), second.Settlement.PendingFeastRenown);
    }

    [Fact]
    public void A_second_feast_after_the_first_ended_keeps_the_first_ones_renown()
    {
        var settlement = Found();
        var first = settlement.StartFeast(settlement.PlanFeast(T0).Feast!, T0);
        var later = T0.AddHours(13);

        // Not settled in between: the finished feast must not be overwritten unpaid.
        var second = first.StartFeast(first.PlanFeast(later).Feast!, later);

        Assert.Equal(Feasts.RenownFor(1), second.PendingFeastRenown);
        Assert.NotNull(second.Feast);
    }

    [Fact]
    public void The_feast_survives_being_settled_while_still_running()
    {
        var settlement = Found();
        var running = settlement.StartFeast(settlement.PlanFeast(T0).Feast!, T0);

        var settled = running.SettleTo(T0.AddHours(5)).Settlement;

        Assert.Equal(running.Feast, settled.Feast);
    }
}
