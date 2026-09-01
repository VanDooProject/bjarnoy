using System.ComponentModel.DataAnnotations;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Contracts;

/// <param name="Seed">
/// Omit to have one drawn at random. The seed is the world: it is enough to
/// reproduce every hex of terrain.
/// </param>
public sealed record CreateWorldRequest(
    [property: Required, MinLength(3), MaxLength(100)] string Name,
    int? Seed = null,
    [property: Range(1, 1000)] int Radius = 60,
    [property: Range(1, 100000)] int MaxPlayers = 500);

public sealed record WorldResponse(
    Guid Id,
    string Name,
    int Seed,
    int Radius,
    int MaxPlayers,
    string Status,
    int IslandCount,
    DateTimeOffset CreatedAt,
    bool Joinable,
    string JoinableReason,
    DateTimeOffset? StartsAt,
    bool EndbossTriggered,
    double SpeedFactor,
    WorldGenerationResponse Generation,
    WorldMovementResponse Movement)
{
    public static WorldResponse From(WorldEntity world, int islandCount, int playerCount, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(world);

        var joinability = world.DetermineJoinability(playerCount, now);

        return new WorldResponse(
            world.Id,
            world.Name,
            world.Seed,
            world.Radius,
            world.MaxPlayers,
            world.Status.ToString().ToLowerInvariant(),
            islandCount,
            world.CreatedAt,
            joinability.Joinable,
            joinability.Reason.ToString().ToLowerInvariant(),
            world.StartsAt,
            world.EndbossTriggeredAt is not null,
            world.SpeedFactor,
            WorldGenerationResponse.From(world.ToGenerationOptions()),
            WorldMovementResponse.Current);
    }
}

/// <summary>
/// The generation constants a world was created with (issue #159 part B) — a
/// world's <see cref="Bjarnoy.Domain.World.WorldGenerationOptions"/>, projected
/// so the client can mirror the exact terrain the server paths over instead of
/// the hardcoded module constants <c>lib/map/worldGenerator.ts</c> used before
/// this, which silently went stale for any world reseeded with non-default
/// options (<c>POST /api/v1/admin/worlds/{id}/preview-seed</c>).
/// </summary>
public sealed record WorldGenerationResponse(
    int IslandCellSize,
    double IslandChance,
    double IslandMinRadius,
    double IslandMaxRadius,
    double BeachThreshold,
    double MountainThreshold,
    double MountainRockiness,
    double ForestRockiness)
{
    public static WorldGenerationResponse From(WorldGenerationOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        return new WorldGenerationResponse(
            options.IslandCellSize,
            options.IslandChance,
            options.IslandMinRadius,
            options.IslandMaxRadius,
            options.BeachThreshold,
            options.MountainThreshold,
            options.MountainRockiness,
            options.ForestRockiness);
    }
}

/// <param name="Land">Per-terrain step cost for land armies, keyed by wire terrain name (see <see cref="TileResponse.Terrain"/>). <c>sea</c> is deliberately absent — impassable to land units.</param>
/// <param name="Sea">Per-terrain step cost for fleets. Only <c>sea</c> is present — every land terrain is impassable to ships.</param>
/// <param name="RiverCrossingCost">
/// Flat penalty, on top of terrain cost, for a land unit entering a river hex —
/// <see cref="HexPathfinder.RiverCrossingCost"/>. Not world-specific, but sent
/// here rather than hardcoded client-side so the two cost models cannot drift
/// apart silently (issue #159 part B).
/// </param>
public sealed record WorldMovementResponse(
    IReadOnlyDictionary<string, double> Land,
    IReadOnlyDictionary<string, double> Sea,
    double RiverCrossingCost)
{
    public static readonly WorldMovementResponse Current = new(
        HexPathfinder.LandTerrainCostByName,
        HexPathfinder.SeaTerrainCostByName,
        HexPathfinder.RiverCrossingCost);
}

public sealed record IslandResponse(
    Guid Id,
    int Index,
    string Name,
    int Q,
    int R,
    int TileCount,
    IReadOnlyList<TileCoordinate> StartPositions,
    IReadOnlyList<RiverTileResponse> RiverTiles)
{
    public static IslandResponse From(IslandEntity island)
    {
        ArgumentNullException.ThrowIfNull(island);

        return new IslandResponse(
            island.Id,
            island.Index,
            island.Name,
            island.CentreQ,
            island.CentreR,
            island.TileCount,
            [.. island.StartPositions.Select(p => new TileCoordinate(p.Q, p.R))],
            [.. island.RiverTiles.Select(RiverTileResponse.From)]);
    }
}

public sealed record TileCoordinate(int Q, int R);

/// <param name="Shape">One of <c>spring</c>, <c>straight</c>, <c>bend</c>, <c>confluence</c>, <c>mouth</c>.</param>
/// <param name="InDirections">
/// The orientations (<c>E</c>/<c>NE</c>/<c>NW</c>/<c>W</c>/<c>SW</c>/<c>SE</c>) this tile's river
/// flows in from — empty for a spring, two entries for a confluence, one otherwise.
/// </param>
/// <param name="OutDirection">
/// The orientation this tile's river flows out toward, or <see langword="null"/> for a mouth (or
/// a confluence that's also a river's mouth).
/// </param>
public sealed record RiverTileResponse(
    int Q,
    int R,
    string Shape,
    IReadOnlyList<string> InDirections,
    string? OutDirection)
{
    private static readonly string[] ShapeNames = ["spring", "straight", "bend", "confluence", "mouth"];

    /// <summary>
    /// The domain's own <see cref="RiverTile"/>, for a map that was generated
    /// but never stored (the admin seed preview, issue #133) and so has no
    /// <see cref="RiverTileRecord"/> row to read from.
    /// </summary>
    public static RiverTileResponse FromDomain(RiverTile tile) => new(
        tile.Coord.Q,
        tile.Coord.R,
        ShapeNames[(int)tile.Shape],
        [.. tile.InDirections.Select(d => d.ToWireName())],
        tile.OutDirection?.ToWireName());

    public static RiverTileResponse From(RiverTileRecord tile) => new(
        tile.Q,
        tile.R,
        ShapeNames[tile.Shape],
        [.. tile.InDirections.Select(d => ((TileOrientation)d).ToWireName())],
        tile.OutDirection is { } outDirection ? ((TileOrientation)outDirection).ToWireName() : null);
}

/// <param name="Terrain">
/// One of <c>sea</c>, <c>sand</c>, <c>grass</c>, <c>forest</c>, <c>mountain</c> —
/// the frontend's terrain names.
/// </param>
/// <param name="IsCoastalWater">Sea that borders land — the ring a coastal-water sprite belongs on.</param>
/// <param name="Orientation">One of <c>E</c>, <c>NE</c>, <c>NW</c>, <c>W</c>, <c>SW</c>, <c>SE</c> — which art-pack rotation to render.</param>
/// <param name="Variant">Which numbered variant of this terrain's tile art to use.</param>
public sealed record TileResponse(int Q, int R, string Terrain, bool IsCoastalWater, string Orientation, int Variant)
{
    public static TileResponse From(GeneratedTile tile) =>
        new(
            tile.Coord.Q,
            tile.Coord.R,
            tile.Terrain.ToWireName(),
            tile.IsCoastalWater,
            tile.Orientation.ToWireName(),
            tile.Variant);
}

public sealed record TileChunkResponse(
    Guid WorldId,
    int QMin,
    int QMax,
    int RMin,
    int RMax,
    IReadOnlyList<TileResponse> Tiles);
