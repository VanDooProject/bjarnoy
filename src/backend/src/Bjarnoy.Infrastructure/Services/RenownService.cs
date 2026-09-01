using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Renown (issue #55 §3): rolls a player's total forward, lazily, the same
/// "SettleTo on read" shape <see cref="SettlementService"/> itself uses for a
/// settlement's resource pool.
/// </summary>
/// <remarks>
/// <para>
/// See <see cref="RenownAccount"/>'s remarks for the v1 accrual
/// simplification this rests on: the level total used for a whole elapsed
/// stretch is whatever it is <em>now</em>, not a true per-change history.
/// Called on every path that needs an accurate-enough renown figure —
/// reading it directly, and before a founding-mission dispatch's threshold
/// check (<c>ArmyService.DispatchAsync</c>) — which keeps the error small in
/// practice without needing a continuous accrual model.
/// </para>
/// <para>
/// Deliberate v1 scope decision, worth calling out: issue #55 §3 describes
/// renown as "account-level", read here (matching Travian's own per-server
/// culture points) as "one account-wide figure per world a player plays in",
/// not literally summed across every world on the server —
/// <see cref="Entities.UserEntity.RenownTotal"/> is a single column with no
/// per-world split, so <see cref="AccrueAsync"/> always scopes both the
/// building-level sum and the elapsed-time checkpoint to
/// <paramref name="worldId"/>'s own settlements and game clock. A player
/// who founds settlements in <em>more than one</em> world at once (rare, and
/// nothing else in this codebase's "one settlement per player per world"
/// model particularly anticipates it either) shares one checkpoint across
/// both worlds' independently-speed-factored clocks: whichever world's clock
/// last advanced the checkpoint effectively "wins" until the other catches
/// up to it, which under- rather than over-counts renown — never incorrectly
/// grants an extra settlement slot. A real per-(user, world) row is the
/// straightforward fix if simultaneous multi-world play turns out to matter;
/// not built here to avoid a second migration/entity for a narrow edge case.
/// </para>
/// </remarks>
public sealed class RenownService(GameDbContext dbContext, TimeProvider timeProvider)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;

    /// <summary>
    /// Rolls <paramref name="userId"/>'s renown forward to <paramref name="now"/>
    /// (game time) against the current total building-level count across
    /// every settlement they own in <paramref name="worldId"/>, persisting the
    /// result, and returns the up-to-date total. Settlements are not
    /// themselves settled here — a stretch of building completions the caller
    /// never separately read stays uncounted for renown until something else
    /// reads/settles those settlements (see the type-level remarks); this
    /// only ever reads <see cref="SettlementEntity.Buildings"/> as currently
    /// stored.
    /// </summary>
    public async Task<double> AccrueAsync(Guid userId, Guid worldId, DateTimeOffset now, CancellationToken cancellationToken = default)
    {
        var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken).ConfigureAwait(false);
        if (user is null)
        {
            return 0;
        }

        var totalLevels = await _dbContext.Settlements
            .Where(s => s.UserId == userId && s.WorldId == worldId)
            .SelectMany(s => s.Buildings)
            .SumAsync(b => (int?)b.Level, cancellationToken).ConfigureAwait(false) ?? 0;

        var account = new RenownAccount { Total = user.RenownTotal, SettledAt = user.RenownSettledAt == default ? now : user.RenownSettledAt };
        var settled = account.SettleTo(now, totalLevels);

        if (settled.Total != user.RenownTotal || settled.SettledAt != user.RenownSettledAt)
        {
            user.RenownTotal = settled.Total;
            user.RenownSettledAt = settled.SettledAt;
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }

        return settled.Total;
    }

    /// <summary>Renown total, without accruing further — for display alongside other already-fresh data.</summary>
    public async Task<double> GetAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var total = await _dbContext.Users
            .Where(u => u.Id == userId)
            .Select(u => (double?)u.RenownTotal)
            .FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);

        return total ?? 0;
    }

    /// <summary>Convenience: accrues against "now" (wall clock) — used where no particular world's game clock is already in scope.</summary>
    public Task<double> AccrueAsync(Guid userId, Guid worldId, CancellationToken cancellationToken = default) =>
        AccrueAsync(userId, worldId, _timeProvider.GetUtcNow(), cancellationToken);
}
