using Bjarnoy.Domain.Trade;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class CartMovementTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Arrival_time_is_distance_over_speed()
    {
        var movement = CartMovement.Create(new HexCoord(0, 0), new HexCoord(6, 0), speedHexesPerHour: 6, T0);

        Assert.Equal(T0.AddHours(1), movement.ArrivesAt);
    }

    [Fact]
    public void A_cart_has_not_arrived_before_its_arrival_instant_and_has_arrived_at_or_after_it()
    {
        var movement = CartMovement.Create(new HexCoord(0, 0), new HexCoord(6, 0), speedHexesPerHour: 6, T0);

        Assert.False(movement.HasArrived(movement.ArrivesAt.AddMinutes(-1)));
        Assert.True(movement.HasArrived(movement.ArrivesAt));
        Assert.True(movement.HasArrived(movement.ArrivesAt.AddMinutes(1)));
    }

    [Fact]
    public void Reading_position_never_changes_the_movement()
    {
        var movement = CartMovement.Create(new HexCoord(0, 0), new HexCoord(6, 0), speedHexesPerHour: 6, T0);

        _ = movement.PositionAt(T0.AddMinutes(30));
        _ = movement.PositionAt(movement.ArrivesAt.AddDays(1));

        Assert.Equal(T0, movement.DepartedAt);
        Assert.Equal(new HexCoord(0, 0), movement.Path[0].Coord);
    }

    [Fact]
    public void Position_before_departure_is_the_start_hex()
    {
        var movement = CartMovement.Create(new HexCoord(0, 0), new HexCoord(6, 0), speedHexesPerHour: 6, T0);

        Assert.Equal(new HexCoord(0, 0), movement.PositionAt(T0.AddHours(-1)));
    }

    [Fact]
    public void Position_at_or_after_arrival_is_the_destination_hex()
    {
        var destination = new HexCoord(6, 0);
        var movement = CartMovement.Create(new HexCoord(0, 0), destination, speedHexesPerHour: 6, T0);

        Assert.Equal(destination, movement.PositionAt(movement.ArrivesAt));
        Assert.Equal(destination, movement.PositionAt(movement.ArrivesAt.AddDays(3)));
    }

    [Fact]
    public void Position_halfway_through_the_journey_is_roughly_halfway_along_the_line()
    {
        var movement = CartMovement.Create(new HexCoord(0, 0), new HexCoord(10, 0), speedHexesPerHour: 10, T0);

        var halfway = movement.PositionAt(T0.AddMinutes(30));

        Assert.Equal(5, halfway.Q);
        Assert.Equal(0, halfway.R);
    }

    [Fact]
    public void A_zero_distance_journey_arrives_immediately()
    {
        var here = new HexCoord(3, -2);
        var movement = CartMovement.Create(here, here, speedHexesPerHour: 6, T0);

        Assert.Equal(T0, movement.ArrivesAt);
        Assert.Equal(here, movement.PositionAt(T0));
    }

    [Fact]
    public void Non_positive_speed_is_rejected()
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => CartMovement.Create(new HexCoord(0, 0), new HexCoord(1, 0), speedHexesPerHour: 0, T0));
    }

    [Theory]
    [InlineData(50)]
    [InlineData(150)]
    [InlineData(200)]
    [InlineData(201)]
    public void Carts_required_rounds_up_to_whole_carts_with_a_minimum_of_one(double amount)
    {
        var expected = (int)Math.Ceiling(amount / TradeCartCatalogue.CapacityPerCart);
        Assert.Equal(Math.Max(1, expected), TradeCartCatalogue.CartsRequired(amount));
    }
}
