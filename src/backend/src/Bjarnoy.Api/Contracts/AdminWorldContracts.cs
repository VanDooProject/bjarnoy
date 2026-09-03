using System.Text.Json.Serialization;
using Bjarnoy.Api.Json;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;

namespace Bjarnoy.Api.Contracts;

public sealed record AdminWorldResponse(
    Guid Id,
    string Name,
    string Status,
    int MaxPlayers,
    int PlayerCount,
    double SpeedFactor,
    double BaseShieldDays,
    DateTimeOffset? StartsAt,
    bool JoinsClosed,
    DateTimeOffset? EndbossAt,
    DateTimeOffset? EndbossTriggeredAt,
    string RunState,
    DateTimeOffset RunStateSince,
    DateTimeOffset CreatedAt,
    // Design doc §7: how many rings currently have beginner spare capacity,
    // out of how many contain any island at all — the same "Players"/
    // "Joinable"/"Endboss"-style at-a-glance health signal, for beginner
    // spawn segregation (§6).
    int BeginnerRingsWithCapacity,
    int BeginnerRingsTotal,
    // True on genuine total exhaustion (§6) — every island either graduated
    // or at zero openPlots.
    bool BeginnerTotalExhaustion)
{
    public static AdminWorldResponse From(WorldEntity world, int playerCount, BeginnerRingSummary? beginnerRings)
    {
        ArgumentNullException.ThrowIfNull(world);

        return new AdminWorldResponse(
            world.Id,
            world.Name,
            world.Status.ToString().ToLowerInvariant(),
            world.MaxPlayers,
            playerCount,
            world.SpeedFactor,
            world.BaseShieldDays,
            world.StartsAt,
            world.JoinsClosed,
            world.EndbossAt,
            world.EndbossTriggeredAt,
            world.RunState.ToString().ToLowerInvariant(),
            world.RunStateSince,
            world.CreatedAt,
            beginnerRings?.RingsWithCapacity ?? 0,
            beginnerRings?.RingsWithAnyIsland ?? 0,
            beginnerRings?.TotalExhaustion ?? true);
    }
}

/// <param name="SpeedFactor">Omit to leave unchanged. Must be greater than 0 when sent.</param>
/// <param name="BaseShieldDays">
/// Omit to leave unchanged. Must be greater than 0 when sent — see
/// <see cref="Bjarnoy.Infrastructure.Entities.WorldEntity.BaseShieldDays"/>.
/// A settlement's actual shield length is computed once at founding and
/// never re-derived from a later change to this value (design doc §1).
/// </param>
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
    double? BaseShieldDays = null,
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

/// <summary>
/// A candidate map to look at (issue #133). Only the two parameters
/// <see cref="CreateWorldRequest"/> exposes are settable here too: the rest of
/// <see cref="Bjarnoy.Domain.World.WorldGenerationOptions"/> stays at its
/// defaults, which is also what the frontend's own terrain generator assumes
/// when it renders the preview from the seed alone.
/// </summary>
/// <param name="Seed">Omit to have one drawn at random — the response says which was used.</param>
/// <param name="Radius">Omit to keep the world's current radius.</param>
public sealed record PreviewWorldSeedRequest(int? Seed = null, int? Radius = null);

/// <summary>
/// A generated-but-not-stored map. Islands carry no id — nothing was
/// persisted, so there is nothing to have an id — which is exactly what makes
/// this different from the <see cref="IslandResponse"/> the live map reads.
/// </summary>
public sealed record WorldSeedPreviewResponse(
    Guid WorldId,
    int Seed,
    int Radius,
    int IslandCount,
    int LandTileCount,
    IReadOnlyList<PreviewIslandResponse> Islands);

/// <inheritdoc cref="WorldSeedPreviewResponse"/>
public sealed record PreviewIslandResponse(
    int Index,
    string Name,
    int Q,
    int R,
    int TileCount,
    IReadOnlyList<TileCoordinate> StartPositions,
    IReadOnlyList<RiverTileResponse> RiverTiles)
{
    public static PreviewIslandResponse From(GeneratedIsland island)
    {
        ArgumentNullException.ThrowIfNull(island);

        return new PreviewIslandResponse(
            island.Index,
            island.Name,
            island.Centre.Q,
            island.Centre.R,
            island.TileCount,
            [.. island.StartPositions.Select(p => new TileCoordinate(p.Q, p.R))],
            [.. island.RiverTiles.Select(RiverTileResponse.FromDomain)]);
    }
}

/// <summary>Regenerates a world's map. Destroys every settlement in it — see issue #133.</summary>
/// <param name="Seed">Omit to have one drawn at random.</param>
/// <param name="Radius">Omit to keep the world's current radius.</param>
/// <param name="ConfirmWorldName">
/// The world's exact name, re-typed by the admin. A deliberate second key on a
/// one-way door: unlike the run-state actions next to it in the admin UI, this
/// one cannot be undone by clicking the opposite button.
/// </param>
public sealed record ReseedWorldRequest(string ConfirmWorldName, int? Seed = null, int? Radius = null);

/// <param name="DeletedSettlements">
/// How many settlements the reseed destroyed — the acting admin's own and
/// abandoned ones only, since any other owner would have blocked it.
/// </param>
public sealed record ReseedWorldResponse(
    AdminWorldResponse World,
    int Seed,
    int IslandCount,
    int DeletedSettlements);
