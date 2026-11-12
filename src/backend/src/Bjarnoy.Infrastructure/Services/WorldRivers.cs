using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>The river tiles a land army's pathfinding needs (wide rivers are impassable, streams cost a flat crossing).</summary>
public static class WorldRivers
{
    private static readonly PerWorldCache<RiverIndex> Cache = WorldIslandCaches.Register(new PerWorldCache<RiverIndex>());

    /// <summary>
    /// Every river tile across every island of <paramref name="worldId"/> as a <see cref="RiverIndex"/>
    /// (issue #159 part A). Built once per world and kept (<see cref="PerWorldCache{T}"/>): a world's rivers only change when it is
    /// reseeded (<see cref="WorldIslandCaches.Invalidate"/>), whereas reading every island's river column costs more than the
    /// army order or field battle that asks. <c>RiverTiles</c> is an EF-converted column
    /// (<see cref="RiverTileListConverter"/>), so it can only be flattened client-side once each island's row is materialized.
    /// </summary>
    public static Task<RiverIndex> IndexAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(db);
        return Cache.GetAsync(worldId, () => LoadAsync(db, worldId), cancellationToken);
    }

    private static async Task<RiverIndex> LoadAsync(GameDbContext db, Guid worldId)
    {
        var islands = await db.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .Select(i => i.RiverTiles)
            .ToListAsync(CancellationToken.None).ConfigureAwait(false);

        return new RiverIndex(islands
            .SelectMany(tiles => tiles)
            .Select(t => new RiverTile(
                new HexCoord(t.Q, t.R),
                (RiverTileShape)t.Shape,
                [.. t.InDirections.Select(d => (TileOrientation)d)],
                t.OutDirection is { } o ? (TileOrientation)o : null,
                (RiverWidth)t.Width)));
    }
}
