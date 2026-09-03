using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Shrines;
using Bjarnoy.Domain.Units;
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

    /// <summary>
    /// Real, relational ownership: the account this settlement belongs to.
    /// Required — every settlement has one, even anonymous/unclaimed play,
    /// which is owned by the reserved <see cref="SystemUserIds.Abandoned"/>
    /// system user rather than left ownerless (see
    /// <c>SettlementService.FoundAsync</c>). Reassigned from that system user
    /// to a real account at registration when a client's existing local id
    /// (<see cref="OwnerId"/>) matches one or more settlements — see
    /// <c>AuthService.RegisterAsync</c> — not by founding itself, which stays
    /// anonymous-capable. <see cref="OwnerId"/>/<see cref="OwnerName"/> above
    /// are unrelated legacy client-local-id fields that stay as-is either way.
    /// </summary>
    public Guid UserId { get; set; }

    public UserEntity? Owner { get; set; }

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

    /// <summary>
    /// Mirrors <see cref="Settlement.ShieldExpiresAtUtc"/> — see that
    /// property's remarks on why this is game time despite the column name.
    /// </summary>
    public DateTimeOffset? ShieldExpiresAtUtc { get; set; }

    public List<PlacedBuildingEntity> Buildings { get; set; } = [];

    public List<BuildOrderEntity> Queue { get; set; } = [];

    public List<UnitStackEntity> Garrison { get; set; } = [];

    public List<TrainingOrderEntity> TrainingQueue { get; set; } = [];

    public List<RuneInstanceEntity> Runes { get; set; } = [];

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
        ShieldExpiresAtUtc = ShieldExpiresAtUtc,
        // Every write path (PlaceBuildingAsync, SetBuildingLevelAsync, PlanBuild's
        // own leveling) already clamps a level to BuildingCatalogue's 1..MaxLevel
        // via TryGet before it ever reaches storage — this Math.Min is a second,
        // defensive clamp purely against a raw DB row (a manual edit, a future
        // write path that bypasses those methods), so ClaimRadius/LonghouseLevel
        // can never read an out-of-range value here even if one somehow lands in
        // the column.
        Buildings =
        [
            .. Buildings
                .OrderBy(b => b.Q).ThenBy(b => b.R)
                .Select(b => new PlacedBuilding(new HexCoord(b.Q, b.R), b.Type, Math.Min(b.Level, BuildingCatalogue.MaxLevel))),
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
        Garrison =
        [
            .. Garrison.OrderBy(g => g.UnitType).Select(g => new UnitStack(g.UnitType, g.Count)),
        ],
        TrainingQueue =
        [
            .. TrainingQueue.OrderBy(o => o.StartedAt).Select(o => new TrainingOrder
            {
                Id = o.Id,
                UnitType = o.UnitType,
                Count = o.Count,
                StartedAt = o.StartedAt,
                PerUnitDuration = o.PerUnitDuration,
            }),
        ],
        Runes =
        [
            .. Runes.OrderBy(r => r.Id).Select(r => new RuneInstance
            {
                Id = r.Id,
                Type = r.Type,
                Rarity = r.Rarity,
                SlottedAt = r.SlottedAtQ.HasValue && r.SlottedAtR.HasValue
                    ? new HexCoord(r.SlottedAtQ.Value, r.SlottedAtR.Value)
                    : null,
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
        ShieldExpiresAtUtc = settlement.ShieldExpiresAtUtc;

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
        SyncGarrison(settlement);
        SyncTrainingQueue(settlement);
        SyncRunes(settlement);
    }

    private void SyncBuildings(Settlement settlement)
    {
        // A building razed to level 0 by catapults (issue #40 phase 5) drops
        // out of settlement.Buildings entirely — see SiegeResolver.Resolve —
        // and must be removed here too, freeing the hex on disk. Nothing
        // before phase 5 ever removed a building, so this had no prior case
        // to cover; same removal shape as SyncGarrison/SyncQueue below.
        var present = settlement.Buildings.Select(b => (b.Coord.Q, b.Coord.R)).ToHashSet();
        Buildings.RemoveAll(b => !present.Contains((b.Q, b.R)));

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

    private void SyncGarrison(Settlement settlement)
    {
        // A stack with a type no longer present (fully starved or otherwise
        // removed) simply drops out; the rest are updated or added in place,
        // same shape as SyncBuildings.
        var present = settlement.Garrison.Select(g => g.Type).ToHashSet();
        Garrison.RemoveAll(g => !present.Contains(g.UnitType));

        foreach (var stack in settlement.Garrison)
        {
            var existing = Garrison.FirstOrDefault(g => g.UnitType == stack.Type);
            if (existing is null)
            {
                Garrison.Add(new UnitStackEntity
                {
                    SettlementId = Id,
                    UnitType = stack.Type,
                    Count = stack.Count,
                });
            }
            else
            {
                existing.Count = stack.Count;
            }
        }
    }

    private void SyncTrainingQueue(Settlement settlement)
    {
        var keep = settlement.TrainingQueue.Select(o => o.Id).ToHashSet();

        // Completed (or cancelled) orders leave the queue; EF deletes the
        // rows via the cascade configured on the relationship — same as
        // SyncQueue for build orders.
        TrainingQueue.RemoveAll(o => !keep.Contains(o.Id));

        foreach (var order in settlement.TrainingQueue)
        {
            if (TrainingQueue.Any(o => o.Id == order.Id))
            {
                continue;
            }

            TrainingQueue.Add(new TrainingOrderEntity
            {
                Id = order.Id,
                SettlementId = Id,
                UnitType = order.UnitType,
                Count = order.Count,
                StartedAt = order.StartedAt,
                PerUnitDuration = order.PerUnitDuration,
            });
        }
    }

    private void SyncRunes(Settlement settlement)
    {
        // A rune is never destroyed once granted (issue #53 v1) — only its
        // Id set can shrink here, and only if a caller removed one from the
        // domain list entirely, which nothing does yet. Same add-or-update
        // shape as SyncGarrison/SyncTrainingQueue.
        var keep = settlement.Runes.Select(r => r.Id).ToHashSet();
        Runes.RemoveAll(r => !keep.Contains(r.Id));

        foreach (var rune in settlement.Runes)
        {
            var existing = Runes.FirstOrDefault(r => r.Id == rune.Id);
            if (existing is null)
            {
                Runes.Add(new RuneInstanceEntity
                {
                    Id = rune.Id,
                    SettlementId = Id,
                    Type = rune.Type,
                    Rarity = rune.Rarity,
                    SlottedAtQ = rune.SlottedAt?.Q,
                    SlottedAtR = rune.SlottedAt?.R,
                });
            }
            else
            {
                existing.SlottedAtQ = rune.SlottedAt?.Q;
                existing.SlottedAtR = rune.SlottedAt?.R;
            }
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

/// <summary>Some number of one unit type standing in a settlement's garrison.</summary>
public class UnitStackEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid SettlementId { get; set; }

    public SettlementEntity? Settlement { get; set; }

    public UnitType UnitType { get; set; }

    public int Count { get; set; }
}

/// <summary>A batch of units being trained. Completes by clock, same as <see cref="BuildOrderEntity"/>.</summary>
public class TrainingOrderEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid SettlementId { get; set; }

    public SettlementEntity? Settlement { get; set; }

    public UnitType UnitType { get; set; }

    public int Count { get; set; }

    /// <summary>Game instant, not wall time.</summary>
    public DateTimeOffset StartedAt { get; set; }

    /// <summary>Time to train a single unit; the batch trains one after another.</summary>
    public TimeSpan PerUnitDuration { get; set; }
}

/// <summary>
/// A rune a settlement holds — in storage (<see cref="SlottedAtQ"/>/
/// <see cref="SlottedAtR"/> both null) or slotted into the shrine standing on
/// that hex (issue #53).
/// </summary>
public class RuneInstanceEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid SettlementId { get; set; }

    public SettlementEntity? Settlement { get; set; }

    public RuneType Type { get; set; }

    public RuneRarity Rarity { get; set; }

    public int? SlottedAtQ { get; set; }

    public int? SlottedAtR { get; set; }
}
