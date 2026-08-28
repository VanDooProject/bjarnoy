using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <see cref="WorldEntity.DetermineJoinability"/> is a pure function, so it
/// is tested directly here rather than through the HTTP surface — no
/// database or web host needed. Covers the full derivation matrix from
/// issue #27: status, stop-join, start date, and capacity, each checked in
/// isolation and in the priority order the method itself applies them in.
/// </summary>
public sealed class WorldEntityJoinabilityTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private static WorldEntity NewWorld(
        WorldStatus status = WorldStatus.Active,
        bool joinsClosed = false,
        DateTimeOffset? startsAt = null,
        int maxPlayers = 10) =>
        new()
        {
            Name = "Test",
            Status = status,
            JoinsClosed = joinsClosed,
            StartsAt = startsAt,
            MaxPlayers = maxPlayers,
        };

    [Fact]
    public void An_active_open_not_yet_full_world_with_no_start_date_is_joinable()
    {
        var world = NewWorld();

        var joinability = world.DetermineJoinability(playerCount: 0, Now);

        Assert.True(joinability.Joinable);
        Assert.Equal(JoinableReason.None, joinability.Reason);
    }

    [Theory]
    [InlineData(WorldStatus.Inactive)]
    [InlineData(WorldStatus.Full)]
    public void A_world_whose_status_is_not_active_is_not_joinable(WorldStatus status)
    {
        var world = NewWorld(status: status);

        var joinability = world.DetermineJoinability(playerCount: 0, Now);

        Assert.False(joinability.Joinable);
        Assert.Equal(JoinableReason.WorldNotActive, joinability.Reason);
    }

    [Fact]
    public void A_world_with_joins_closed_is_not_joinable_even_when_otherwise_eligible()
    {
        var world = NewWorld(joinsClosed: true);

        var joinability = world.DetermineJoinability(playerCount: 0, Now);

        Assert.False(joinability.Joinable);
        Assert.Equal(JoinableReason.JoinsClosed, joinability.Reason);
    }

    [Fact]
    public void A_world_whose_start_date_has_not_arrived_is_not_joinable()
    {
        var world = NewWorld(startsAt: Now.AddDays(1));

        var joinability = world.DetermineJoinability(playerCount: 0, Now);

        Assert.False(joinability.Joinable);
        Assert.Equal(JoinableReason.NotStartedYet, joinability.Reason);
    }

    [Fact]
    public void A_world_becomes_joinable_the_instant_its_start_date_arrives()
    {
        var world = NewWorld(startsAt: Now);

        var joinability = world.DetermineJoinability(playerCount: 0, Now);

        Assert.True(joinability.Joinable);
    }

    [Fact]
    public void A_world_at_capacity_is_not_joinable()
    {
        var world = NewWorld(maxPlayers: 5);

        var joinability = world.DetermineJoinability(playerCount: 5, Now);

        Assert.False(joinability.Joinable);
        Assert.Equal(JoinableReason.Full, joinability.Reason);
    }

    [Fact]
    public void A_world_under_capacity_is_joinable()
    {
        var world = NewWorld(maxPlayers: 5);

        var joinability = world.DetermineJoinability(playerCount: 4, Now);

        Assert.True(joinability.Joinable);
    }

    [Fact]
    public void Status_is_checked_before_every_other_reason()
    {
        var world = NewWorld(status: WorldStatus.Inactive, joinsClosed: true, startsAt: Now.AddDays(1), maxPlayers: 0);

        var joinability = world.DetermineJoinability(playerCount: 0, Now);

        Assert.Equal(JoinableReason.WorldNotActive, joinability.Reason);
    }

    [Fact]
    public void Joins_closed_is_checked_before_the_start_date_and_capacity()
    {
        var world = NewWorld(joinsClosed: true, startsAt: Now.AddDays(1), maxPlayers: 0);

        var joinability = world.DetermineJoinability(playerCount: 0, Now);

        Assert.Equal(JoinableReason.JoinsClosed, joinability.Reason);
    }

    [Fact]
    public void The_start_date_is_checked_before_capacity()
    {
        var world = NewWorld(startsAt: Now.AddDays(1), maxPlayers: 0);

        var joinability = world.DetermineJoinability(playerCount: 0, Now);

        Assert.Equal(JoinableReason.NotStartedYet, joinability.Reason);
    }
}
