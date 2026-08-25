using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// A settlement's stored form.
/// </summary>
/// <remarks>
/// <para>
/// The resource columns are the lazy model on disk: a stock, a rate, a capacity
/// and the game instant the stock was last true. Nothing writes them on a read —
/// see <c>docs/tech/backend.md</c>, "the stock is only written when it changes".
/// </para>
/// <para>
/// All timestamps here are <em>game</em> time, not wall time: they are already
/// through <see cref="GameClock"/>, so a paused world simply stops producing
/// new ones. The only wall-clock timestamps in the schema are on the world's
/// own clock.
/// </para>
/// </remarks>
public class SettlementEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid WorldId { get; set; }

    public WorldEntity? World { get; set; }

    public Guid IslandId { get; set; }

    public IslandEntity? Island { get; set; }

    public required string Name { get; set; }

    /// <summary>
    /// Who holds it. A display name for now: MECHANICS.md §9 has a player
    /// naming a settlement before there is an account to attach it to, and auth
    /// is not built yet.
    /// </summary>
    public required string OwnerName { get; set; }

    /// <summary>
    /// Stable identity of the founding player (a client-generated local id
    /// today, a real account id once auth exists). Distinct from
    /// <see cref="OwnerName"/>, which is decoration and may collide between
    /// players; this is what <c>SettlementService.FoundAsync</c> checks to
    /// refuse a second settlement for the same player in a world.
    /// </summary>
    public required string OwnerId { get; set; }

    /// <summary>Hex the longhouse stands on.</summary>
    public int CentreQ { get; set; }

    public int CentreR { get; set; }

    public double StockWood { get; set; }

    public double StockStone { get; set; }

    public double StockFood { get; set; }

    public double StockIron { get; set; }

    public double RateWood { get; set; }

    public double RateStone { get; set; }

    public double RateFood { get; set; }

    public double RateIron { get; set; }

    public double CapacityWood { get; set; }

    public double CapacityStone { get; set; }

    public double CapacityFood { get; set; }

    public double CapacityIron { get; set; }

    /// <summary>Game instant the stock above was last true.</summary>
    public DateTimeOffset SettledAt { get; set; }

    public DateTimeOffset FoundedAt { get; set; }

    public List<PlacedBuildingEntity> Buildings { get; set; } = [];

    public List<BuildOrderEntity> Queue { get; set; } = [];

    public ResourceAmounts Stock => new(StockWood, StockStone, StockFood, StockIron);

    public ResourceAmounts Rate => new(RateWood, RateStone, RateFood, RateIron);

    public ResourceAmounts Capacity =>
        new(CapacityWood, CapacityStone, CapacityFood, CapacityIron);

    /// <summary>Rebuilds the domain aggregate from the stored columns.</summary>
    public Settlement ToDomain() => new()
    {
        Id = Id,
        Name = Name,
        Centre = new HexCoord(CentreQ, CentreR),
        Resources = ResourcePool.Create(Stock, Rate, Capacity, SettledAt),
        Buildings =
        [
            .. Buildings
                .OrderBy(b => b.Q).ThenBy(b => b.R)
                .Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, b.Level)),
        ],
        Queue =
        [
            .. Queue.OrderBy(o => o.CompletesAt).Select(o => new BuildOrder
            {
                Id = o.Id,
                Type = o.Type,
                TargetLevel = o.TargetLevel,
                Coord = new HexCoord(o.Q, o.R),
                StartedAt = o.StartedAt,
                CompletesAt = o.CompletesAt,
            }),
        ],
    };

    /// <summary>
    /// Writes a settled aggregate back onto the entity, reconciling the
    /// building and queue collections.
    /// </summary>
    public void ApplyDomain(Settlement settlement)
    {
        ArgumentNullException.ThrowIfNull(settlement);

        Name = settlement.Name;
        CentreQ = settlement.Centre.Q;
        CentreR = settlement.Centre.R;

        var pool = settlement.Resources;
        StockWood = pool.Stock.Wood;
        StockStone = pool.Stock.Stone;
        StockFood = pool.Stock.Food;
        StockIron = pool.Stock.Iron;
        RateWood = pool.RatePerHour.Wood;
        RateStone = pool.RatePerHour.Stone;
        RateFood = pool.RatePerHour.Food;
        RateIron = pool.RatePerHour.Iron;
        CapacityWood = pool.Capacity.Wood;
        CapacityStone = pool.Capacity.Stone;
        CapacityFood = pool.Capacity.Food;
        CapacityIron = pool.Capacity.Iron;
        SettledAt = pool.SettledAt;

        SyncBuildings(settlement);
        SyncQueue(settlement);
    }

    private void SyncBuildings(Settlement settlement)
    {
        foreach (var placed in settlement.Buildings)
        {
            var existing = Buildings.FirstOrDefault(
                b => b.Q == placed.Coord.Q && b.R == placed.Coord.R);

            if (existing is null)
            {
                Buildings.Add(new PlacedBuildingEntity
                {
                    SettlementId = Id,
                    Q = placed.Coord.Q,
                    R = placed.Coord.R,
                    Type = placed.Type,
                    Level = placed.Level,
                });
            }
            else
            {
                existing.Type = placed.Type;
                existing.Level = placed.Level;
            }
        }
    }

    private void SyncQueue(Settlement settlement)
    {
        var keep = settlement.Queue.Select(o => o.Id).ToHashSet();

        // Completed orders leave the queue; EF deletes the rows via the
        // cascade configured on the relationship.
        Queue.RemoveAll(o => !keep.Contains(o.Id));

        foreach (var order in settlement.Queue)
        {
            if (Queue.Any(o => o.Id == order.Id))
            {
                continue;
            }

            Queue.Add(new BuildOrderEntity
            {
                Id = order.Id,
                SettlementId = Id,
                Type = order.Type,
                TargetLevel = order.TargetLevel,
                Q = order.Coord.Q,
                R = order.Coord.R,
                StartedAt = order.StartedAt,
                CompletesAt = order.CompletesAt,
            });
        }
    }
}

/// <summary>A building standing on a hex.</summary>
public class PlacedBuildingEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid SettlementId { get; set; }

    public SettlementEntity? Settlement { get; set; }

    public int Q { get; set; }

    public int R { get; set; }

    public BuildingType Type { get; set; }

    public int Level { get; set; }
}

/// <summary>A build in progress. Completes by clock; nothing advances it.</summary>
public class BuildOrderEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid SettlementId { get; set; }

    public SettlementEntity? Settlement { get; set; }

    public int Q { get; set; }

    public int R { get; set; }

    public BuildingType Type { get; set; }

    public int TargetLevel { get; set; }

    /// <summary>Game instant, not wall time.</summary>
    public DateTimeOffset StartedAt { get; set; }

    /// <summary>Game instant the order becomes a building.</summary>
    public DateTimeOffset CompletesAt { get; set; }
}
