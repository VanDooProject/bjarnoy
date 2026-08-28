using System.Text.Json.Serialization;
using Bjarnoy.Api.Json;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Contracts;

public sealed record AdminWorldResponse(
    Guid Id,
    string Name,
    string Status,
    int MaxPlayers,
    int PlayerCount,
    double SpeedFactor,
    DateTimeOffset? StartsAt,
    bool JoinsClosed,
    DateTimeOffset? EndbossAt,
    DateTimeOffset? EndbossTriggeredAt,
    string RunState,
    DateTimeOffset RunStateSince,
    DateTimeOffset CreatedAt)
{
    public static AdminWorldResponse From(WorldEntity world, int playerCount)
    {
        ArgumentNullException.ThrowIfNull(world);

        return new AdminWorldResponse(
            world.Id,
            world.Name,
            world.Status.ToString().ToLowerInvariant(),
            world.MaxPlayers,
            playerCount,
            world.SpeedFactor,
            world.StartsAt,
            world.JoinsClosed,
            world.EndbossAt,
            world.EndbossTriggeredAt,
            world.RunState.ToString().ToLowerInvariant(),
            world.RunStateSince,
            world.CreatedAt);
    }
}

/// <param name="SpeedFactor">Omit to leave unchanged. Must be greater than 0 when sent.</param>
/// <param name="StartsAt">
/// Omit to leave unchanged; send explicit <c>null</c> to open the world immediately.
/// </param>
/// <param name="JoinsClosed">Omit to leave unchanged.</param>
/// <param name="EndbossAt">
/// Omit to leave unchanged; send explicit <c>null</c> to cancel a scheduled endboss.
/// Must be after <see cref="StartsAt"/> (the world's current one if this request
/// does not also change it) when sent as a value.
/// </param>
public sealed record UpdateWorldSettingsRequest(
    double? SpeedFactor,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    Optional<DateTimeOffset?> StartsAt = default,
    bool? JoinsClosed = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    Optional<DateTimeOffset?> EndbossAt = default);

/// <param name="Action">One of <c>pause</c>, <c>maintenance</c>, <c>lock</c>, <c>resume</c>.</param>
/// <param name="GraceMinutes">
/// Only meaningful for <c>resume</c>: extra time credited back to the world's
/// clock offset on top of the freeze just ending.
/// </param>
public sealed record SetWorldRunStateRequest(string Action, int? GraceMinutes = null);
