using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.World;

/// <summary>Why <see cref="FogMaskService.GeneratePlayerMaskAsync"/> found nothing to render.</summary>
public enum FogMaskRejection
{
    None = 0,
    WorldNotFound,
}

public sealed record FogMaskResult(FogMaskRejection Rejection, byte[]? Png = null)
{
    public bool Accepted => Rejection == FogMaskRejection.None && Png is not null;
}

/// <summary>
/// Builds a player's fog mask PNG from their own settlements, per
/// <c>docs/design/map-fog-v2.md</c> §2.3/§3.
/// </summary>
/// <remarks>
/// This is the single-player slice only: sources are the requesting player's
/// own settlements (<c>OwnerId</c> match), not yet the guild-wide union §1a
/// requires, there is no persisted-explored-history input (§1e) yet, and the
/// whole world is baked in one call rather than per chunk (§3) — no caching,
/// no chunk halo. Each of those is real follow-up work, deliberately left out
/// of this slice rather than half-implemented.
/// </remarks>
public sealed class FogMaskService(GameDbContext dbContext)
{
    private readonly GameDbContext _dbContext = dbContext;

    public async Task<FogMaskResult> GeneratePlayerMaskAsync(
        Guid worldId, string ownerId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(ownerId);

        var radius = await _dbContext.Worlds
            .Where(w => w.Id == worldId)
            .Select(w => (int?)w.Radius)
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

        if (radius is null)
        {
            return new FogMaskResult(FogMaskRejection.WorldNotFound);
        }

        var settlements = await _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Where(s => s.WorldId == worldId && s.OwnerId == ownerId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var sources = settlements
            .Select(s => FogVisionRadii.ToVisionSource(
                new HexCoord(s.CentreQ, s.CentreR), s.ToDomain().LonghouseLevel))
            .ToList();

        var bounds = FogMaskLayout.WorldBounds(radius.Value);
        var mask = FogMaskGenerator.Generate(bounds, sources, new HashSet<HexCoord>());
        var png = FogMaskPngEncoder.Encode(mask);

        return new FogMaskResult(FogMaskRejection.None, png);
    }
}
