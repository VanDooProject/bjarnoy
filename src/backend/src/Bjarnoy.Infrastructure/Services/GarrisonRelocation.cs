using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// The movements that put units at a new garrison spot (<c>docs/design/garrison.md</c>): the units of a destroyed tower or dock
/// marching to the owner's nearest spot, the land troops of a fleet that folded into a dock walking to a tower or longhouse,
/// and an army out in the field getting a new home. One place for the "nearest spot by route" choice and the food a
/// walk takes from the stock, so the three cases cannot drift apart.
/// </summary>
internal sealed class GarrisonRelocation(GameDbContext dbContext)
{
    private readonly GameDbContext _dbContext = dbContext;

    /// <summary>What a route over the world needs: terrain, rivers, and the walls of the army's owner.</summary>
    internal sealed record Routing(
        Func<HexCoord, Terrain> TerrainAt, double SpeedFactor, Func<HexCoord, bool> IsRiver, Func<HexCoord, bool> IsWide, WallRules? Walls);

    /// <summary>One garrison spot of one of the owner's settlements.</summary>
    internal sealed record Candidate(Guid SettlementId, GarrisonSpot Spot);

    public async Task<Routing> LoadRoutingAsync(
        Guid worldId, double speedFactor, Func<HexCoord, Terrain> terrainAt, Guid userId, Guid settlementId, DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var rivers = await WorldRivers.IndexAsync(_dbContext, worldId, cancellationToken).ConfigureAwait(false);
        var walls = (await WorldBridges.RouteIndexAsync(_dbContext, worldId, terrainAt, rivers.IsWide, now, cancellationToken).ConfigureAwait(false))
            .ForOwner(WorldPalisades.OwnerKeyOf(userId, settlementId));
        return new Routing(terrainAt, speedFactor, rivers.IsRiver, rivers.IsWide, walls);
    }

    /// <summary>
    /// Every garrison spot of every settlement <paramref name="ownerId"/> holds in <paramref name="worldId"/>. A settlement in
    /// <paramref name="known"/> is read from there (a settle in progress, not yet written); the others from the database.
    /// </summary>
    public async Task<List<Candidate>> OwnerSpotsAsync(
        Guid worldId, string ownerId, Func<HexCoord, Terrain> terrainAt, IReadOnlyDictionary<Guid, Settlement> known, CancellationToken cancellationToken)
    {
        var knownIds = known.Keys.ToList();
        var stored = await _dbContext.Settlements
            .AsNoTracking()
            .Include(s => s.Buildings)
            .Where(s => s.WorldId == worldId && s.OwnerId == ownerId && !knownIds.Contains(s.Id))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        return
        [
            .. known.Values.Concat(stored.Select(s => s.ToDomain(terrainAt)))
                .SelectMany(s => s.GarrisonSpots.Select(spot => new Candidate(s.Id, spot))),
        ];
    }

    /// <summary>
    /// The march of <paramref name="stacks"/> from <paramref name="from"/> to the nearest of <paramref name="candidates"/> that
    /// fits them, by travel time over the route (ties by spot Q, then R, then settlement). <see langword="null"/> when none is
    /// reachable. The army carries no food yet: see <see cref="WithWalkFood"/>.
    /// </summary>
    public static (SpotMarch March, Candidate Target)? NearestMarch(
        IReadOnlyList<UnitStack> stacks, HexCoord from, IEnumerable<Candidate> candidates, DateTimeOffset now, Routing routing,
        Guid armyId)
    {
        (SpotMarch March, Candidate Target)? best = null;
        var bestHours = double.MaxValue;
        foreach (var candidate in candidates
            .Where(c => Fits(c.Spot, stacks))
            .OrderBy(c => c.Spot.Coord.DistanceTo(from)).ThenBy(c => c.Spot.Coord.Q).ThenBy(c => c.Spot.Coord.R).ThenBy(c => c.SettlementId))
        {
            var march = Army.PlanSpotMarch(
                armyId, candidate.SettlementId, candidate.Spot.Coord, stacks, from, now,
                routing.TerrainAt, routing.SpeedFactor, routing.IsRiver, routing.IsWide, routing.Walls);
            if (march is null)
            {
                continue;
            }

            var hours = ((ArmyLocation.InTransit)march.Army.Location).Movement.ArrivesAt.Subtract(now).TotalHours;
            if (hours < bestHours - 1e-9)
            {
                best = (march, candidate);
                bestHours = hours;
            }
        }

        return best;
    }

    /// <summary>
    /// Whether <paramref name="spot"/> can be the home of an army of <paramref name="stacks"/>: a fleet's ships need a spot that
    /// holds ships (passengers are shed at a dock), a land army one that holds land units.
    /// </summary>
    public static bool Fits(GarrisonSpot spot, IReadOnlyList<UnitStack> stacks) =>
        stacks.Any(s => UnitCatalogue.Get(s.Type).Class == UnitClass.Ship) ? spot.HoldsShips : spot.HoldsLand;

    /// <summary>
    /// <paramref name="march"/>'s army loaded with the food its walk needs, taken from <paramref name="resources"/> (the
    /// settlement's stock) up to what the units can carry and what the stock holds; a short stock still sends them.
    /// </summary>
    public static (Army Army, ResourcePool Resources) WithWalkFood(SpotMarch march, ResourcePool resources, DateTimeOffset now)
    {
        var carry = march.Army.TotalFoodCarryCapacity;
        var stock = resources.At(now).Food;
        var provisions = Math.Max(0, Math.Min(march.FoodNeeded, Math.Min(carry, stock)));
        var paid = provisions > 0 && resources.TrySpend(new ResourceAmounts(0, 0, provisions, 0), now, out var spent)
            ? spent
            : resources;
        return (march.Army with { Provisions = provisions }, paid);
    }

    /// <summary>
    /// The land troops of a fleet that folded into the dock at <paramref name="dock"/>: a march from the land hex next to the
    /// dock with the best route to the nearest tower or longhouse of the settlement, to that spot (which becomes its home).
    /// <see langword="null"/> when there is no walkable hex or route.
    /// </summary>
    public static (SpotMarch March, Candidate Target)? LandingMarch(
        Settlement settlement, HexCoord dock, IReadOnlyList<UnitStack> landStacks, DateTimeOffset now, Routing routing, Guid armyId)
    {
        var spots = settlement.GarrisonSpots.Where(s => s.HoldsLand).Select(s => new Candidate(settlement.Id, s)).ToList();
        (SpotMarch March, Candidate Target)? best = null;
        var bestHours = double.MaxValue;
        foreach (var shore in dock.Neighbours()
            .Where(n => routing.TerrainAt(n).IsTraversable(isLandUnit: true))
            .OrderBy(n => n.Q).ThenBy(n => n.R))
        {
            if (NearestMarch(landStacks, shore, spots, now, routing, armyId) is not { } found)
            {
                continue;
            }

            var hours = ((ArmyLocation.InTransit)found.March.Army.Location).Movement.ArrivesAt.Subtract(now).TotalHours;
            if (hours < bestHours - 1e-9)
            {
                best = found;
                bestHours = hours;
            }
        }

        return best;
    }

    /// <summary>A new army row for <paramref name="army"/>, added to the context (not saved).</summary>
    public ArmyEntity AddArmy(Army army)
    {
        var entity = new ArmyEntity { Id = army.Id, SettlementId = army.SettlementId };
        entity.ApplyDomain(army);
        _dbContext.Armies.Add(entity);
        return entity;
    }

    /// <summary>
    /// Gives every army out of home whose home is <paramref name="settlementId"/> (and, when given, <paramref name="spot"/>) the
    /// nearest garrison spot of its owner it can reach on its provisions as its new home, with its way home rebuilt to it.
    /// An army that can reach none is left as it is. Does not save.
    /// </summary>
    public async Task RehomeAsync(
        Guid settlementId, HexCoord? spot, IReadOnlyList<Candidate> candidates, DateTimeOffset now, Routing routing, CancellationToken cancellationToken)
    {
        var armies = await _dbContext.Armies
            .Include(a => a.Stacks)
            .Where(a => a.SettlementId == settlementId && (spot == null || (a.HomeSpotQ == spot.Value.Q && a.HomeSpotR == spot.Value.R)))
            .ToListAsync(cancellationToken).ConfigureAwait(false);

        // The spot (or the whole settlement) being given up is no candidate.
        var targets = candidates
            .Where(c => spot is null ? c.SettlementId != settlementId : !(c.SettlementId == settlementId && c.Spot.Coord == spot.Value))
            .ToList();

        foreach (var entity in armies)
        {
            var army = entity.ToDomain();
            var rehomed = Rehome(army, targets, now, routing);
            if (rehomed is not null)
            {
                entity.ApplyDomain(rehomed);
            }
        }
    }

    private static Army? Rehome(Army army, IReadOnlyList<Candidate> targets, DateTimeOffset now, Routing routing)
    {
        Army? best = null;
        var bestHours = double.MaxValue;
        foreach (var candidate in targets
            .Where(c => Fits(c.Spot, army.Stacks))
            .OrderBy(c => c.Spot.Coord.Q).ThenBy(c => c.Spot.Coord.R).ThenBy(c => c.SettlementId))
        {
            Army? option;
            double hours;
            if (army.Location is ArmyLocation.Supporting supporting)
            {
                // A guest stays where it stands; only the home it will walk back to changes.
                var march = Army.PlanSpotMarch(
                    army.Id, candidate.SettlementId, candidate.Spot.Coord, army.Stacks, supporting.Spot, now,
                    routing.TerrainAt, routing.SpeedFactor, routing.IsRiver, routing.IsWide, routing.Walls);
                if (march is null || army.Provisions + 1e-9 < march.FoodNeeded)
                {
                    continue;
                }

                option = army with { SettlementId = candidate.SettlementId, HomeSpot = candidate.Spot.Coord };
                hours = ((ArmyLocation.InTransit)march.Army.Location).Movement.ArrivesAt.Subtract(now).TotalHours;
            }
            else
            {
                var rehomed = army.RehomedTo(
                    candidate.Spot.Coord, now, routing.TerrainAt, routing.SpeedFactor, routing.IsRiver, routing.IsWide, routing.Walls);
                if (rehomed is null || !rehomed.AffordsWayHome)
                {
                    continue;
                }

                option = rehomed with { SettlementId = candidate.SettlementId };
                hours = rehomed.WayHomeHours;
            }

            if (hours < bestHours - 1e-9)
            {
                best = option;
                bestHours = hours;
            }
        }

        return best;
    }
}
