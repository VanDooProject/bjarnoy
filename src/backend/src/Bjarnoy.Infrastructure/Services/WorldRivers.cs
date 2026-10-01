using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>The river tiles a land army's pathfinding needs (wide rivers are impassable, streams cost a flat crossing).</summary>
public static class WorldRivers
{
    /// <summary>
    /// Every river tile across every island of <paramref name="worldId"/> as a <see cref="RiverIndex"/>
    /// (issue #159 part A) — one query per request at each call site that builds a land route,
    /// mirroring how terrain itself is sampled once per request rather than per hex. <c>RiverTiles</c>
    /// is an EF-converted column (<see cref="RiverTileListConverter"/>), so it can only be flattened
    /// client-side once each island's row is materialized, not projected further in SQL.
    /// </summary>
    public static async Task<RiverIndex> IndexAsync(GameDbContext db, Guid worldId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(db);
        var islands = await db.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .Select(i => i.RiverTiles)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

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
