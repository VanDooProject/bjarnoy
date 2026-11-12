using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// The terrain the game rules see: the seed's terrain with every island's persisted bogland laid over it (bog moss and bog
/// lakes are placed per island by <see cref="BogGenerator"/>, not derivable from the seed). Everything that decides where an
/// army walks, where a ship sails or what may be built asks a sampler from here.
/// </summary>
/// <remarks>
/// The overlay of a world is loaded once and kept (a world's bog only changes when it is reseeded, which calls
/// <see cref="WorldIslandCaches.Invalidate"/>): reading every island's bog column on each request would cost more than the
/// request. At most <see cref="MaxCachedWorlds"/> worlds are kept, oldest use first out (<see cref="PerWorldCache{T}"/>).
/// </remarks>
public static class WorldTerrain
{
    /// <summary>How many worlds' overlays are kept in memory.</summary>
    public const int MaxCachedWorlds = PerWorldCache<object>.DefaultMaxCachedWorlds;

    /// <summary>What is kept per world: the bog / lake overlay of its terrain, and the kind of every bog hex (moss, shore, creek, ...).</summary>
    private sealed record BogData(IReadOnlyDictionary<HexCoord, Terrain> Overlay, IReadOnlyDictionary<HexCoord, BogTileKind> Kinds);

    private static readonly PerWorldCache<BogData> Cache = WorldIslandCaches.Register(new PerWorldCache<BogData>(MaxCachedWorlds));

    /// <summary>The sampler for <paramref name="world"/>, with its bog laid over the seed's terrain.</summary>
    public static async Task<TerrainSampler> SamplerAsync(GameDbContext db, WorldEntity world, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(world);
        var overlay = await OverlayAsync(db, world.Id, cancellationToken).ConfigureAwait(false);
        return new TerrainSampler(world.ToGenerationOptions()).WithBogOverlay(overlay);
    }

    /// <summary>The bog overlay (bog / lake per hex) of a world's islands.</summary>
    public static async Task<IReadOnlyDictionary<HexCoord, Terrain>> OverlayAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken = default) =>
        (await DataAsync(db, worldId, cancellationToken).ConfigureAwait(false)).Overlay;

    /// <summary>
    /// What kind of bog hex stands on <paramref name="coord"/> (plain moss, a shore, a creek, ...), or <see langword="null"/> when it is not a
    /// bog hex. Buildings that only stand on some bog kinds (bog-ore works, Hammerschmiede, the lake Fishing Hut) ask this.
    /// </summary>
    public static async Task<BogTileKind?> BogKindAtAsync(GameDbContext db, Guid worldId, HexCoord coord, CancellationToken cancellationToken = default)
    {
        var data = await DataAsync(db, worldId, cancellationToken).ConfigureAwait(false);
        return data.Kinds.TryGetValue(coord, out var kind) ? kind : null;
    }

    private static Task<BogData> DataAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(db);
        var options = WorldIslandCaches.OptionsOf(db);
        return Cache.GetAsync(worldId, () => WorldIslandCaches.LoadAsync(options, loadDb => LoadAsync(loadDb, worldId)), cancellationToken);
    }

    private static async Task<BogData> LoadAsync(GameDbContext db, Guid worldId)
    {
        var islands = await db.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .Select(i => i.BogTiles)
            .ToListAsync(CancellationToken.None).ConfigureAwait(false);

        var overlay = new Dictionary<HexCoord, Terrain>();
        var kinds = new Dictionary<HexCoord, BogTileKind>();
        foreach (var tile in islands.SelectMany(tiles => tiles))
        {
            var coord = new HexCoord(tile.Q, tile.R);
            overlay[coord] = tile.Kind == (int)BogTileKind.Lake ? Terrain.Lake : Terrain.Bog;
            kinds[coord] = (BogTileKind)tile.Kind;
        }

        return new BogData(overlay, kinds);
    }
}
