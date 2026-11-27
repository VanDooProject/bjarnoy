using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>The player (<c>SettlementEntity.OwnerId</c>) and world a settlement belongs to, as a report records them.</summary>
public readonly record struct ReportOwner(Guid WorldId, string OwnerId);

/// <summary>
/// Looks up who a settlement belongs to at the moment a report is written, so the report can hang on the player
/// (<c>OwnerId</c>) instead of on the settlement. The one place every report kind (battle, field battle, camp, trade)
/// reads its owners from.
/// </summary>
internal static class ReportOwners
{
    public static async Task<ReportOwner> OfAsync(GameDbContext dbContext, Guid settlementId, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var owner = await dbContext.Settlements
            .AsNoTracking()
            .Where(s => s.Id == settlementId)
            .Select(s => new ReportOwner(s.WorldId, s.OwnerId))
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return owner.OwnerId is null
            ? throw new InvalidOperationException($"Settlement {settlementId} not found while writing a report.")
            : owner;
    }
}
