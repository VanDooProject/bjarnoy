using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>The river tiles a land army's pathfinding needs (wide rivers are impassable, streams cost a flat crossing).</summary>
public static class WorldRivers
{
    /// <summary>What is kept per world: the river index, and the hexes of the river tiles that lie on wasted islands.</summary>
    private sealed record RiverData(RiverIndex Index, IReadOnlySet<HexCoord> WastedTiles);

    private static readonly PerWorldCache<RiverData> Cache = WorldIslandCaches.Register(new PerWorldCache<RiverData>());

    /// <summary>
    /// Every river tile across every island of <paramref name="worldId"/> as a <see cref="RiverIndex"/>
    /// (issue #159 part A). Built once per world and kept (<see cref="PerWorldCache{T}"/>): a world's rivers only change when it is
    /// reseeded (<see cref="WorldIslandCaches.Invalidate"/>), whereas reading every island's river column costs more than the
    /// army order or field battle that asks. <c>RiverTiles</c> is an EF-converted column
    /// (<see cref="RiverTileListConverter"/>), so it can only be flattened client-side once each island's row is materialized.
    /// </summary>
    public static async Task<RiverIndex> IndexAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken = default) =>
        (await DataAsync(db, worldId, cancellationToken).ConfigureAwait(false)).Index;

    /// <summary>Whether the river tile on <paramref name="coord"/> (if any) lies on a wasted island.</summary>
    public static async Task<bool> IsOnWastedIslandAsync(GameDbContext db, Guid worldId, HexCoord coord, CancellationToken cancellationToken = default) =>
        (await DataAsync(db, worldId, cancellationToken).ConfigureAwait(false)).WastedTiles.Contains(coord);

    private static Task<RiverData> DataAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(db);
        var options = WorldIslandCaches.OptionsOf(db);
        return Cache.GetAsync(worldId, () => WorldIslandCaches.LoadAsync(options, loadDb => LoadAsync(loadDb, worldId)), cancellationToken);
    }

    private static async Task<RiverData> LoadAsync(GameDbContext db, Guid worldId)
    {
        var islands = await db.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .Select(i => new { i.IsWasted, i.RiverTiles })
            .ToListAsync(CancellationToken.None).ConfigureAwait(false);

        var wasted = islands
            .Where(i => i.IsWasted)
            .SelectMany(i => i.RiverTiles)
            .Select(t => new HexCoord(t.Q, t.R))
            .ToHashSet();

        var index = new RiverIndex(islands
            .SelectMany(i => i.RiverTiles)
            .Select(t => new RiverTile(
                new HexCoord(t.Q, t.R),
                (RiverTileShape)t.Shape,
                [.. t.InDirections.Select(d => (TileOrientation)d)],
                t.OutDirection is { } o ? (TileOrientation)o : null,
                (RiverWidth)t.Width)));
        return new RiverData(index, wasted);
    }
}
