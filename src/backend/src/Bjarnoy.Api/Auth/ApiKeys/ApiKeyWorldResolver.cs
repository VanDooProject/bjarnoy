using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Api.Auth.ApiKeys;

/// <summary>
/// Answers "which world does this resource live in?" for <see cref="ApiKeyScopeMiddleware"/>, one method per kind of
/// id a route can carry. Each is a single-column, no-tracking query; an id that does not exist yields an empty list,
/// which the middleware treats as "let the handler answer 404" rather than as a denial.
/// </summary>
/// <remarks>
/// A list rather than one id because a battle report has two parties and, in principle, two worlds; a report is
/// allowed when any party's world is allowed.
/// </remarks>
public sealed class ApiKeyWorldResolver(GameDbContext dbContext)
{
    public async Task<IReadOnlyList<Guid>> ForSettlementAsync(Guid settlementId, CancellationToken cancellationToken) =>
        await dbContext.Settlements.AsNoTracking()
            .Where(s => s.Id == settlementId)
            .Select(s => s.WorldId)
            .ToListAsync(cancellationToken);

    /// <summary>An army's world is its home settlement's.</summary>
    public async Task<IReadOnlyList<Guid>> ForArmyAsync(Guid armyId, CancellationToken cancellationToken) =>
        await (from a in dbContext.Armies.AsNoTracking()
               where a.Id == armyId
               join s in dbContext.Settlements.AsNoTracking() on a.SettlementId equals s.Id
               select s.WorldId)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Guid>> ForGuildAsync(Guid guildId, CancellationToken cancellationToken) =>
        await dbContext.Guilds.AsNoTracking()
            .Where(g => g.Id == guildId)
            .Select(g => g.WorldId)
            .ToListAsync(cancellationToken);

    /// <summary>A treaty's world is its proposing guild's (both guilds are in one world).</summary>
    public async Task<IReadOnlyList<Guid>> ForTreatyAsync(Guid treatyId, CancellationToken cancellationToken) =>
        await (from t in dbContext.GuildPeaceTreaties.AsNoTracking()
               where t.Id == treatyId
               join g in dbContext.Guilds.AsNoTracking() on t.ProposerGuildId equals g.Id
               select g.WorldId)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Guid>> ForTradeOfferAsync(Guid offerId, CancellationToken cancellationToken) =>
        await dbContext.TradeOffers.AsNoTracking()
            .Where(o => o.Id == offerId)
            .Select(o => o.WorldId)
            .ToListAsync(cancellationToken);

    /// <summary>A battle report's worlds: those of its attacker and defender settlements.</summary>
    public async Task<IReadOnlyList<Guid>> ForBattleReportAsync(Guid reportId, CancellationToken cancellationToken)
    {
        var parties = await dbContext.BattleReports.AsNoTracking()
            .Where(r => r.Id == reportId)
            .Select(r => new[] { r.AttackerSettlementId, r.DefenderSettlementId })
            .FirstOrDefaultAsync(cancellationToken);
        return parties is null ? [] : await WorldsOfAsync(parties, cancellationToken);
    }

    /// <summary>A field battle report's worlds: those of its two sides' settlements.</summary>
    public async Task<IReadOnlyList<Guid>> ForFieldReportAsync(Guid reportId, CancellationToken cancellationToken)
    {
        var parties = await dbContext.FieldBattleReports.AsNoTracking()
            .Where(r => r.Id == reportId)
            .Select(r => new[] { r.SideASettlementId, r.SideBSettlementId })
            .FirstOrDefaultAsync(cancellationToken);
        return parties is null ? [] : await WorldsOfAsync(parties, cancellationToken);
    }

    public async Task<IReadOnlyList<Guid>> ForCampReportAsync(Guid reportId, CancellationToken cancellationToken) =>
        await dbContext.CampReports.AsNoTracking()
            .Where(r => r.Id == reportId)
            .Select(r => r.WorldId)
            .ToListAsync(cancellationToken);

    private async Task<IReadOnlyList<Guid>> WorldsOfAsync(Guid[] settlementIds, CancellationToken cancellationToken) =>
        await dbContext.Settlements.AsNoTracking()
            .Where(s => settlementIds.Contains(s.Id))
            .Select(s => s.WorldId)
            .Distinct()
            .ToListAsync(cancellationToken);
}
