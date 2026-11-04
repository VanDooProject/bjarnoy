using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>The world's giants as one lookup for the territory rule.</summary>
public static class WorldGiants
{
    /// <summary>Every giant across every island of <paramref name="worldId"/>, built into one lookup.</summary>
    public static async Task<IGiantIndex> IndexAsync(GameDbContext dbContext, Guid worldId, CancellationToken cancellationToken)
    {
        var islands = await dbContext.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .Select(i => i.Giants)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var giants = islands
            .SelectMany(g => g)
            .Select(g => new Giant(new HexCoord(g.Q, g.R), g.Family, (TileOrientation)g.Orientation))
            .ToList();

        return new GiantIndex(giants);
    }
}
