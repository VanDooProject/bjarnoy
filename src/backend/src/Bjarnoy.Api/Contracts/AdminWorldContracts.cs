using System.Text.Json.Serialization;
using Bjarnoy.Api.Json;
using Bjarnoy.Domain.World;
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
    DateTimeOffset CreatedAt,
    WorldGenerationSettingsResponse Generation)
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
            world.CreatedAt,
            WorldGenerationSettingsResponse.From(world.ToGenerationOptions()));
    }
}

/// <summary>
/// The world's current generation parameters (everything in
/// <see cref="WorldGenerationOptions"/> but the seed and radius, which the
/// admin UI already surfaces separately) — read-only here, so the reseed/
/// preview UI can pre-fill a form with what the world already has rather than
/// guessing the library defaults, which may not be what this particular world
/// was created with.
/// </summary>
public sealed record WorldGenerationSettingsResponse(
    int IslandCellSize,
    double IslandChance,
    double IslandMinRadius,
    double IslandMaxRadius,
    double BeachThreshold,
    double MountainThreshold,
    double MountainRockiness,
    double ForestRockiness,
    int MinimumIslandTiles,
    int IslandMinLobes,
    int IslandMaxLobes,
    double IslandMaxElongation,
    double IslandBendiness,
    double IslandLobeBlend,
    double IslandCoastWarp,
    double IslandCoastWarpScale)
{
    public static WorldGenerationSettingsResponse From(WorldGenerationOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        return new WorldGenerationSettingsResponse(
            options.IslandCellSize,
            options.IslandChance,
            options.IslandMinRadius,
            options.IslandMaxRadius,
            options.BeachThreshold,
            options.MountainThreshold,
            options.MountainRockiness,
            options.ForestRockiness,
            options.MinimumIslandTiles,
            options.IslandMinLobes,
            options.IslandMaxLobes,
            options.IslandMaxElongation,
            options.IslandBendiness,
            options.IslandLobeBlend,
            options.IslandCoastWarp,
            options.IslandCoastWarpScale);
    }
}

/// <summary>
/// The same knobs as <see cref="WorldGenerationSettingsResponse"/>, but every
/// field optional — a preview/reseed request only overrides the ones it
/// sends, leaving everything else at the world's current value (see
/// <see cref="AdminWorldEndpoints.TryBuildOptions"/>).
/// </summary>
public sealed record WorldGenerationSettingsOverrides(
    int? IslandCellSize = null,
    double? IslandChance = null,
    double? IslandMinRadius = null,
    double? IslandMaxRadius = null,
    double? BeachThreshold = null,
    double? MountainThreshold = null,
    double? MountainRockiness = null,
    double? ForestRockiness = null,
    int? MinimumIslandTiles = null,
    int? IslandMinLobes = null,
    int? IslandMaxLobes = null,
    double? IslandMaxElongation = null,
    double? IslandBendiness = null,
    double? IslandLobeBlend = null,
    double? IslandCoastWarp = null,
    double? IslandCoastWarpScale = null);

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

/// <summary>
/// A candidate map to look at (issue #133).
/// </summary>
/// <param name="Seed">Omit to have one drawn at random — the response says which was used.</param>
/// <param name="Radius">Omit to keep the world's current radius.</param>
/// <param name="Generation">
/// Overrides for the world's island/mountain generation parameters — any
/// field left <see langword="null"/> keeps the world's current value (see
/// <see cref="AdminWorldEndpoints.TryBuildOptions"/>). Omit entirely to
/// preview with every parameter unchanged, same as before this existed.
/// </param>
public sealed record PreviewWorldSeedRequest(
    int? Seed = null,
    int? Radius = null,
    WorldGenerationSettingsOverrides? Generation = null);

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
/// <param name="ConfirmWorldName">
/// The world's exact name, re-typed by the admin. A deliberate second key on a
/// one-way door: unlike the run-state actions next to it in the admin UI, this
/// one cannot be undone by clicking the opposite button.
/// </param>
/// <param name="Seed">Omit to have one drawn at random.</param>
/// <param name="Radius">Omit to keep the world's current radius.</param>
/// <param name="Generation">
/// Overrides for the world's island/mountain generation parameters — same
/// semantics as <see cref="PreviewWorldSeedRequest.Generation"/>. In practice
/// this should be whatever <see cref="PreviewWorldSeedRequest"/> was last
/// previewed with, since the whole point of the preview step is to look at
/// the map before committing to it.
/// </param>
public sealed record ReseedWorldRequest(
    string ConfirmWorldName,
    int? Seed = null,
    int? Radius = null,
    WorldGenerationSettingsOverrides? Generation = null);

/// <param name="DeletedSettlements">
/// How many settlements the reseed destroyed — the acting admin's own and
/// abandoned ones only, since any other owner would have blocked it.
/// </param>
public sealed record ReseedWorldResponse(
    AdminWorldResponse World,
    int Seed,
    int IslandCount,
    int DeletedSettlements);
