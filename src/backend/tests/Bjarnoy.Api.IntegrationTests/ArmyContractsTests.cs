using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Issue #94: <see cref="MovementResponse"/> carries the per-hex schedule, not
/// just the endpoints. Without it the frontend can only assume a uniform speed
/// over the whole route, which is wrong on mixed terrain — the map would drift
/// visibly away from the authoritative <c>Position</c> the same response
/// reports.
/// </summary>
public sealed class ArmyContractsTests
{
    private static readonly DateTimeOffset Departure = new(2026, 8, 30, 12, 0, 0, TimeSpan.Zero);

    private static Domain.Movement.Movement SampleMovement()
    {
        List<HexCoord> path = [new(0, 0), new(1, 0), new(2, 0)];
        List<HexCoord> returnPath = [new(2, 0), new(1, 0), new(0, 0)];
        // Deliberately uneven: the second leg costs three times the first, the
        // exact case a uniform-speed guess gets wrong.
        return Domain.Movement.Movement.Create(
            Departure, path, [0, 1, 4], returnPath, [0, 3, 4],
            provisionsAtDeparture: 100, upkeepPerHour: 1);
    }

    [Fact]
    public void From_exposes_the_per_leg_schedule_for_both_legs()
    {
        var response = MovementResponse.From(SampleMovement());

        Assert.Equal([0, 1, 4], response.CumulativeHours);
        Assert.Equal([0, 3, 4], response.ReturnCumulativeHours);
    }

    [Fact]
    public void From_keeps_the_schedule_aligned_with_the_path_it_describes()
    {
        var movement = SampleMovement();
        var response = MovementResponse.From(movement);

        // Same length as the path, starting at zero and ending exactly at the
        // arrival time — the invariants the frontend's interpolation relies on
        // (see lib/units/armyProgress.ts) before it trusts the schedule.
        Assert.Equal(response.Path.Count, response.CumulativeHours.Count);
        Assert.Equal(response.ReturnPath.Count, response.ReturnCumulativeHours.Count);
        Assert.Equal(0, response.CumulativeHours[0]);
        Assert.Equal(
            movement.DepartedAt + TimeSpan.FromHours(response.CumulativeHours[^1]),
            response.ArrivesAt);
    }
}
