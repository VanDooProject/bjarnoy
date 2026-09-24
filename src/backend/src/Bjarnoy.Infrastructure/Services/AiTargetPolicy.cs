using Bjarnoy.Domain.Ai;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Decides which settlements an AI player may target with a raid — the one
/// filter <c>AiPlayerService</c> threads every candidate through before it
/// ever reaches <see cref="AiSnapshot.Neighbours"/>, so the planner itself
/// never has to know the targeting rule.
/// </summary>
/// <remarks>
/// <para>
/// <b>v1 (this class today):</b> only settlements owned by <em>another</em>
/// AI player, within <see cref="SearchRadiusHexes"/> hexes of centre — see
/// <c>docs/design/ai-players.md</c>'s "Targeting in v1" note. Never a human
/// player's settlement, registered or anonymous: an anonymous one is still
/// owned by <see cref="SystemUserIds.Abandoned"/>, which never has an
/// <see cref="Entities.AiPlayerEntity"/> row, and a registered one's owner
/// likewise has none unless that same account was itself taken over (which
/// cannot happen — a claimed settlement is never anonymous, see
/// <c>AiTakeoverService</c>).
/// </para>
/// <para>
/// <b>Planned later</b> (see the design doc's "Out of scope" list): weighting
/// targets towards <em>stronger</em> players rather than just the nearest
/// weak one, and a "guardian" objective that protects particular islands
/// regardless of this general rule. Both are meant to layer onto this same
/// single filter rather than requiring <c>AiPlayerService</c> to grow a
/// second targeting path.
/// </para>
/// </remarks>
public sealed class AiTargetPolicy(GameDbContext dbContext)
{
    /// <summary>How far from its own centre an AI will look for a target — see the design doc's "Build" step sizing note for the same order of magnitude.</summary>
    public const int SearchRadiusHexes = 15;

    private readonly GameDbContext _dbContext = dbContext;

    /// <summary>
    /// Other AI players' settlements in <paramref name="worldId"/>, within
    /// <see cref="SearchRadiusHexes"/> of <paramref name="centre"/>, each with
    /// its estimated defence (<see cref="AiPlanner.EstimateDefense"/>, garrison
    /// included).
    /// </summary>
    public async Task<IReadOnlyList<AiNeighbour>> GetNeighboursAsync(
        Guid worldId, Guid selfUserId, HexCoord centre, CancellationToken cancellationToken = default)
    {
        var candidates = await _dbContext.Settlements
            .AsNoTracking()
            .Where(s => s.WorldId == worldId && s.UserId != selfUserId)
            // Only settlements whose owner is itself an AI player — see this
            // type's own remarks. A plain Where(s => ai players contains
            // s.UserId) would need the same join; doing it as a join up front
            // lets a settlement whose centre is obviously out of range still
            // get filtered before pulling its garrison across, though the
            // distance check itself has to happen in memory (HexCoord's axial
            // distance is not translatable to SQL).
            .Join(
                _dbContext.AiPlayers.AsNoTracking(),
                settlement => settlement.UserId,
                ai => ai.UserId,
                (settlement, _) => settlement)
            .Select(s => new
            {
                s.Id,
                s.CentreQ,
                s.CentreR,
                Garrison = s.Garrison.Select(g => new { g.UnitType, g.Count }).ToList(),
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var neighbours = new List<AiNeighbour>();
        foreach (var candidate in candidates)
        {
            var coord = new HexCoord(candidate.CentreQ, candidate.CentreR);
            if (centre.DistanceTo(coord) > SearchRadiusHexes)
            {
                continue;
            }

            // A throwaway domain Settlement carrying nothing but the garrison
            // — the rest of Settlement's required properties are irrelevant
            // to AiPlanner.EstimateDefense, which reads only Garrison, but
            // reusing that one method (rather than re-summing
            // Defense * Count here) keeps "how defence is estimated" defined
            // in exactly one place.
            var proxy = new Settlement
            {
                Id = candidate.Id,
                Name = string.Empty,
                Centre = coord,
                Resources = ResourcePool.Create(default, default, default, DateTimeOffset.UnixEpoch),
                Garrison = [.. candidate.Garrison.Select(g => new UnitStack(g.UnitType, g.Count))],
            };

            neighbours.Add(new AiNeighbour(candidate.Id, coord, AiPlanner.EstimateDefense(proxy)));
        }

        return neighbours;
    }
}
