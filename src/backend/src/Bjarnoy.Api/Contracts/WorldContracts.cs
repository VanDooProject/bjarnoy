using System.ComponentModel.DataAnnotations;
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
    DateTimeOffset CreatedAt)
{
    public static WorldResponse From(WorldEntity world, int islandCount)
    {
        ArgumentNullException.ThrowIfNull(world);

        return new WorldResponse(
            world.Id,
            world.Name,
            world.Seed,
            world.Radius,
            world.MaxPlayers,
            world.Status.ToString().ToLowerInvariant(),
            islandCount,
            world.CreatedAt);
    }
}

public sealed record IslandResponse(
    Guid Id,
    int Index,
    string Name,
    int Q,
    int R,
    int TileCount,
    IReadOnlyList<TileCoordinate> StartPositions)
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
            [.. island.StartPositions.Select(p => new TileCoordinate(p.Q, p.R))]);
    }
}

public sealed record TileCoordinate(int Q, int R);

/// <param name="Terrain">
/// One of <c>sea</c>, <c>sand</c>, <c>grass</c>, <c>forest</c>, <c>mountain</c> —
/// the frontend's terrain names.
/// </param>
public sealed record TileResponse(int Q, int R, string Terrain)
{
    public static TileResponse From(GeneratedTile tile) =>
        new(tile.Coord.Q, tile.Coord.R, tile.Terrain.ToWireName());
}

public sealed record TileChunkResponse(
    Guid WorldId,
    int QMin,
    int QMax,
    int RMin,
    int RMax,
    IReadOnlyList<TileResponse> Tiles);
