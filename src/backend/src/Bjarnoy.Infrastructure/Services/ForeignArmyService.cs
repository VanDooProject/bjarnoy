using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.World;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// A foreign army a viewer sees marching: where it stands and the short stretch of its route ahead — nothing of its mission, target,
/// units, provisions or the part of the route behind it.
/// </summary>
public sealed record ForeignArmy(Guid Id, Guid SettlementId, bool IsFleet, HexCoord Position, ForeignRouteStretch Stretch);

/// <summary>
/// "Foreign armies in sight" (<c>docs/design/map-fog-v2.md</c> §1g): the marching armies of other players that stand inside the
/// viewer's sight right now (<see cref="ExploredArea.SightDiscs"/>), each reduced to <see cref="ForeignRouteStretch"/>.
/// Armies at home or standing as a guest garrison are never listed.
/// </summary>
public sealed class ForeignArmyService(GameDbContext dbContext, ExploredAreaService exploredArea)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly ExploredAreaService _exploredArea = exploredArea;

    public async Task<IReadOnlyList<ForeignArmy>> GetAsync(
        Guid worldId, string viewerOwnerId, DateTimeOffset gameNow, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(viewerOwnerId);

        var area = await _exploredArea.GetAsync(worldId, viewerOwnerId, persist: false, cancellationToken).ConfigureAwait(false);
        if (area is null)
        {
            return [];
        }

        var sight = area.SightDiscs;
        if (sight.Count == 0)
        {
            return [];
        }

        var candidates = await _dbContext.Armies
            .AsNoTracking()
            .Include(a => a.Settlement)
            .Include(a => a.Stacks)
            .Where(a => !a.AtHome && !a.IsSupporting && a.Settlement != null
                && a.Settlement.WorldId == worldId && a.Settlement.OwnerId != viewerOwnerId)
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        var seen = new List<ForeignArmy>();
        foreach (var entity in candidates)
        {
            var domain = entity.ToDomain();
            if (domain.Location is not ArmyLocation.InTransit transit)
            {
                continue;
            }

            var position = transit.Movement.PositionAt(gameNow);
            if (!Sight.Contains(sight, position))
            {
                continue;
            }

            var stretch = ForeignRouteStretch.Clip(transit.Movement, gameNow, hex => Sight.Contains(sight, hex));
            seen.Add(new ForeignArmy(entity.Id, entity.SettlementId, domain.IsFleet, position, stretch));
        }

        return seen;
    }
}
