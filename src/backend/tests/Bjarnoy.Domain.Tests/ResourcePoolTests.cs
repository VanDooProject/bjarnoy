using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.Tests;

public class ResourceAmountsTests
{
    [Fact]
    public void Covers_requires_every_resource_to_be_sufficient()
    {
        var stock = new ResourceAmounts(Wood: 1000, Stone: 0, Grain: 500, Silver: 0);
        var cost = new ResourceAmounts(Wood: 100, Stone: 100, Grain: 0, Silver: 0);

        // The legacy Resources.operator< was "every component compares true",
        // so BuildHelper only rejected a build when the player was short on
        // *every* resource. Plenty of wood and no stone sailed through.
        Assert.False(stock.Covers(cost));
    }

    [Fact]
    public void Covers_is_true_when_everything_is_sufficient_including_exact_change()
    {
        var stock = new ResourceAmounts(100, 100, 100, 100);

        Assert.True(stock.Covers(new ResourceAmounts(100, 100, 100, 100)));
        Assert.True(stock.Covers(new ResourceAmounts(99, 0, 1, 100)));
        Assert.True(stock.Covers(ResourceAmounts.Zero));
    }

    [Fact]
    public void ClampTo_takes_the_component_wise_minimum()
    {
        var stock = new ResourceAmounts(500, 50, 900, 0);
        var capacity = ResourceAmounts.Uniform(100);

        Assert.Equal(new ResourceAmounts(100, 50, 100, 0), stock.ClampTo(capacity));
    }

    [Fact]
    public void ClampToZero_floors_negatives()
    {
        var amounts = new ResourceAmounts(-5, 0, 10, -0.5);

        Assert.Equal(new ResourceAmounts(0, 0, 10, 0), amounts.ClampToZero());
    }

    [Fact]
    public void Arithmetic_is_component_wise()
    {
        var a = new ResourceAmounts(1, 2, 3, 4);
        var b = new ResourceAmounts(10, 20, 30, 40);

        Assert.Equal(new ResourceAmounts(11, 22, 33, 44), a + b);
        Assert.Equal(new ResourceAmounts(9, 18, 27, 36), b - a);
        Assert.Equal(new ResourceAmounts(2, 4, 6, 8), a * 2);
        Assert.Equal(new ResourceAmounts(2, 4, 6, 8), 2 * a);
    }

    [Fact]
    public void Floor_rounds_down_so_a_player_is_never_shown_more_than_they_have()
    {
        var amounts = new ResourceAmounts(10.9, 0.999, 5.0, 0.1);

        Assert.Equal(new ResourceAmounts(10, 0, 5, 0), amounts.Floor());
    }
}

public class ResourcePoolTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    private static ResourcePool Pool(
        double stock = 0,
        double rate = 0,
        double capacity = 10_000) =>
        ResourcePool.Create(
            ResourceAmounts.Uniform(stock),
            ResourceAmounts.Uniform(rate),
            ResourceAmounts.Uniform(capacity),
            T0);

    [Fact]
    public void Stock_accrues_at_the_hourly_rate()
    {
        var pool = Pool(stock: 100, rate: 60);

        Assert.Equal(100, pool.At(T0).Wood, 6);
        Assert.Equal(160, pool.At(T0.AddHours(1)).Wood, 6);
        Assert.Equal(130, pool.At(T0.AddMinutes(30)).Wood, 6);
        Assert.Equal(1540, pool.At(T0.AddHours(24)).Wood, 6);
    }

    [Fact]
    public void Accrual_is_continuous_not_stepped()
    {
        var pool = Pool(rate: 615);

        // Eighteen minutes of 615/h is 184.5 — the fraction has to survive, or
        // every partial hour would be rounded away.
        Assert.Equal(184.5, pool.At(T0.AddMinutes(18)).Wood, 6);
    }

    [Fact]
    public void Reading_the_pool_never_changes_it()
    {
        var pool = Pool(stock: 100, rate: 60);

        _ = pool.At(T0.AddHours(5));
        _ = pool.At(T0.AddHours(50));

        // This is the whole point: a request that only displays a settlement
        // must leave nothing for the database to write.
        Assert.Equal(100, pool.Stock.Wood, 6);
        Assert.Equal(T0, pool.SettledAt);
    }

    [Fact]
    public void Accrual_stops_at_capacity()
    {
        var pool = Pool(stock: 0, rate: 100, capacity: 250);

        Assert.Equal(200, pool.At(T0.AddHours(2)).Wood, 6);
        Assert.Equal(250, pool.At(T0.AddHours(3)).Wood, 6);
        Assert.Equal(250, pool.At(T0.AddDays(30)).Wood, 6);
    }

    [Fact]
    public void A_clock_that_goes_backwards_does_not_remove_resources()
    {
        var pool = Pool(stock: 500, rate: 100);

        Assert.Equal(500, pool.At(T0.AddHours(-3)).Wood, 6);
        Assert.Equal(pool, pool.SettledTo(T0.AddHours(-3)));
    }

    [Fact]
    public void Settling_moves_the_stock_forward_and_restamps()
    {
        var settled = Pool(stock: 100, rate: 60).SettledTo(T0.AddHours(2));

        Assert.Equal(220, settled.Stock.Wood, 6);
        Assert.Equal(T0.AddHours(2), settled.SettledAt);
    }

    [Fact]
    public void Settling_then_reading_gives_the_same_answer_as_reading_directly()
    {
        var pool = Pool(stock: 100, rate: 60, capacity: 100_000);
        var later = T0.AddHours(7.25);

        // Whether a caller settled along the way must not change the outcome —
        // otherwise the act of spending would alter later production.
        Assert.Equal(pool.At(later).Wood, pool.SettledTo(T0.AddHours(3)).At(later).Wood, 6);
    }

    [Fact]
    public void Spending_settles_first_so_no_production_is_lost()
    {
        var pool = Pool(stock: 100, rate: 60);

        Assert.True(pool.TrySpend(ResourceAmounts.Uniform(50), T0.AddHours(1), out var after));

        // 100 + 60 accrued, minus 50 spent. The legacy version read the clock
        // twice while doing this and dropped whatever accrued in between.
        Assert.Equal(110, after.Stock.Wood, 6);
        Assert.Equal(T0.AddHours(1), after.SettledAt);
    }

    [Fact]
    public void Spending_more_than_is_held_fails_and_changes_nothing()
    {
        var pool = Pool(stock: 100, rate: 0);

        Assert.False(pool.TrySpend(ResourceAmounts.Uniform(101), T0, out var after));
        Assert.Equal(pool, after);
    }

    [Fact]
    public void Spending_is_rejected_when_short_on_only_one_resource()
    {
        var pool = ResourcePool.Create(
            new ResourceAmounts(Wood: 1000, Stone: 10, Grain: 1000, Silver: 1000),
            ResourceAmounts.Zero,
            ResourceAmounts.Uniform(10_000),
            T0);

        Assert.False(pool.TrySpend(new ResourceAmounts(100, 100, 0, 0), T0, out var after));
        Assert.Equal(pool, after);
    }

    [Fact]
    public void A_negative_cost_is_rejected_rather_than_paying_the_player()
    {
        var pool = Pool(stock: 100);

        Assert.Throws<ArgumentException>(
            () => pool.TrySpend(ResourceAmounts.Uniform(-50), T0, out _));
    }

    [Fact]
    public void Depositing_settles_first_and_respects_capacity()
    {
        var pool = Pool(stock: 100, rate: 60, capacity: 200);

        var after = pool.Deposit(ResourceAmounts.Uniform(1000), T0.AddHours(1));

        Assert.Equal(200, after.Stock.Wood, 6);
        Assert.Equal(T0.AddHours(1), after.SettledAt);
    }

    [Fact]
    public void Raising_the_rate_does_not_apply_retroactively()
    {
        var pool = Pool(stock: 0, rate: 10, capacity: 100_000);

        // One hour at 10/h, then the lumber camp finishes and it becomes 100/h.
        var upgraded = pool.WithRate(
            ResourceAmounts.Uniform(100), ResourceAmounts.Uniform(100_000), T0.AddHours(1));

        Assert.Equal(10, upgraded.Stock.Wood, 6);
        Assert.Equal(110, upgraded.At(T0.AddHours(2)).Wood, 6);
    }

    [Fact]
    public void Lowering_capacity_clamps_the_existing_stock()
    {
        var pool = Pool(stock: 900, rate: 0, capacity: 1000);

        var razed = pool.WithRate(ResourceAmounts.Zero, ResourceAmounts.Uniform(500), T0);

        Assert.Equal(500, razed.Stock.Wood, 6);
    }

    [Fact]
    public void Create_clamps_the_opening_stock_into_range()
    {
        var pool = ResourcePool.Create(
            new ResourceAmounts(-100, 5000, 0, 0),
            ResourceAmounts.Zero,
            ResourceAmounts.Uniform(1000),
            T0);

        Assert.Equal(0, pool.Stock.Wood, 6);
        Assert.Equal(1000, pool.Stock.Stone, 6);
    }

    [Fact]
    public void Create_rejects_a_negative_rate_or_capacity()
    {
        Assert.Throws<ArgumentException>(() => ResourcePool.Create(
            ResourceAmounts.Zero, ResourceAmounts.Uniform(-1), ResourceAmounts.Uniform(10), T0));
        Assert.Throws<ArgumentException>(() => ResourcePool.Create(
            ResourceAmounts.Zero, ResourceAmounts.Zero, ResourceAmounts.Uniform(-10), T0));
    }

    [Fact]
    public void AffordableAt_is_now_when_the_cost_is_already_covered()
    {
        var pool = Pool(stock: 500, rate: 10);

        Assert.Equal(T0, pool.AffordableAt(ResourceAmounts.Uniform(100), T0));
    }

    [Fact]
    public void AffordableAt_returns_when_the_slowest_resource_catches_up()
    {
        var pool = ResourcePool.Create(
            ResourceAmounts.Zero,
            new ResourceAmounts(Wood: 100, Stone: 10, Grain: 100, Silver: 100),
            ResourceAmounts.Uniform(10_000),
            T0);

        // Wood needs 1h, stone needs 10h. Stone sets the date.
        var when = pool.AffordableAt(new ResourceAmounts(100, 100, 0, 0), T0);

        Assert.Equal(T0.AddHours(10), when!.Value);
    }

    [Fact]
    public void AffordableAt_is_null_when_a_missing_resource_is_not_produced()
    {
        var pool = ResourcePool.Create(
            ResourceAmounts.Zero,
            new ResourceAmounts(Wood: 100, Stone: 0, Grain: 0, Silver: 0),
            ResourceAmounts.Uniform(10_000),
            T0);

        Assert.Null(pool.AffordableAt(new ResourceAmounts(10, 10, 0, 0), T0));
    }

    [Fact]
    public void AffordableAt_is_null_when_the_cost_exceeds_storage_capacity()
    {
        var pool = Pool(stock: 0, rate: 100, capacity: 500);

        Assert.Null(pool.AffordableAt(ResourceAmounts.Uniform(501), T0));
    }

    [Fact]
    public void An_offline_player_returns_to_exactly_what_accrued()
    {
        var pool = Pool(stock: 0, rate: 615, capacity: 1_000_000);

        // No ticking, no background job — two days away is one subtraction.
        Assert.Equal(615 * 48, pool.At(T0.AddDays(2)).Wood, 6);
    }
}
