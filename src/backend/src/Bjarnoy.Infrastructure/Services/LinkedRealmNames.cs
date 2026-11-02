using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>A settlement's linked realm: the id and name of its oldest member (<c>docs/design/economy.md</c> section 5, "A linked group is one realm").</summary>
public readonly record struct RealmLabel(Guid RealmId, string Name);

/// <summary>
/// Resolves which linked realm each settlement of a list belongs to, for every list that shows a realm once or under the
/// oldest member's name: the world lists, the leaderboard, the rival view. One place, so they all agree.
/// </summary>
public static class LinkedRealmNames
{
    /// <summary>
    /// Each settlement of <paramref name="settlements"/> (with its <see cref="SettlementEntity.Buildings"/> loaded) mapped to its realm.
    /// A realm's members are all in the list (it is the player-and-island group), so the oldest member's name is always at hand.
    /// </summary>
    public static async Task<IReadOnlyDictionary<Guid, RealmLabel>> ForAsync(
        GameDbContext dbContext, Guid worldId, IReadOnlyCollection<SettlementEntity> settlements, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(settlements);

        var rows = settlements.Select(s => (
            Key: (PlayerRealms.PlayerKey(s.UserId, s.OwnerId), s.IslandId),
            Settlement: new RealmSettlement(
                s.Id, new HexCoord(s.CentreQ, s.CentreR), [.. s.Buildings.Select(b => b.ToPlacedBuilding())]),
            s.FoundedAt)).ToList();

        // Giants only matter where a player has several settlements on one island.
        var anyGroup = rows.GroupBy(r => r.Key).Any(g => g.Count() > 1);
        var giants = anyGroup
            ? await WorldGiants.IndexAsync(dbContext, worldId, cancellationToken).ConfigureAwait(false)
            : GiantIndex.Empty;

        var realmIds = LinkedGroups.RealmIds(rows, giants);
        var names = settlements.ToDictionary(s => s.Id, s => s.Name);
        return settlements.ToDictionary(s => s.Id, s =>
        {
            var realmId = realmIds.GetValueOrDefault(s.Id, s.Id);
            return new RealmLabel(realmId, names.GetValueOrDefault(realmId, s.Name));
        });
    }

    /// <summary>The realm of one stored settlement (read-only).</summary>
    public static async Task<RealmLabel> ForSettlementAsync(
        GameDbContext dbContext, SettlementEntity entity, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(entity);

        var group = await PlayerRealms.GroupOf(dbContext, entity).Include(s => s.Buildings).ToListAsync(cancellationToken).ConfigureAwait(false);
        var labels = await ForAsync(dbContext, entity.WorldId, group, cancellationToken).ConfigureAwait(false);
        return labels.TryGetValue(entity.Id, out var label) ? label : new RealmLabel(entity.Id, entity.Name);
    }
}
