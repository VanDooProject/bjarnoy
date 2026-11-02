using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// The mutable state of one wildlife camp, keyed by its world and hex (the camp itself — family, rolled level —
/// lives in <c>islands.Camps</c>). No row means a pristine camp (<see cref="CampState.Pristine"/>); a row is
/// written by the first fight (or pickup) at the camp.
/// </summary>
public class CampStateEntity
{
    public Guid WorldId { get; set; }

    public WorldEntity? World { get; set; }

    public int Q { get; set; }

    public int R { get; set; }

    /// <summary>Beasts alive at <see cref="SnapshotAt"/>.</summary>
    public int Young { get; set; }

    public int Adult { get; set; }

    public int Alpha { get; set; }

    /// <summary>Game instant of the snapshot; regrowth runs from here.</summary>
    public DateTimeOffset SnapshotAt { get; set; }

    public DateTimeOffset? ClearedAt { get; set; }

    public DateTimeOffset? CalmUntil { get; set; }

    public int Clears { get; set; }

    public double LeftoverWood { get; set; }

    public double LeftoverStone { get; set; }

    public double LeftoverFood { get; set; }

    public double LeftoverIron { get; set; }

    public CampState ToDomain() => new(
        new CampGarrison(Young, Adult, Alpha),
        SnapshotAt,
        ClearedAt,
        CalmUntil,
        Clears,
        new ResourceAmounts(LeftoverWood, LeftoverStone, LeftoverFood, LeftoverIron));

    /// <summary>Writes <paramref name="state"/> onto this entity (the key columns are untouched).</summary>
    public void ApplyDomain(CampState state)
    {
        ArgumentNullException.ThrowIfNull(state);

        Young = state.Snapshot.Young;
        Adult = state.Snapshot.Adult;
        Alpha = state.Snapshot.Alpha;
        SnapshotAt = state.SnapshotAt;
        ClearedAt = state.ClearedAt;
        CalmUntil = state.CalmUntil;
        Clears = state.Clears;
        LeftoverWood = state.Leftover.Wood;
        LeftoverStone = state.Leftover.Stone;
        LeftoverFood = state.Leftover.Food;
        LeftoverIron = state.Leftover.Iron;
    }

    public static CampStateEntity FromDomain(Guid worldId, HexCoord coord, CampState state)
    {
        var entity = new CampStateEntity { WorldId = worldId, Q = coord.Q, R = coord.R };
        entity.ApplyDomain(state);
        return entity;
    }
}

/// <summary>
/// A camp fight's stored form. Immutable once written, like <see cref="BattleReportEntity"/>; lands in the inbox
/// of <see cref="SettlementId"/> only (the camp has no owner).
/// </summary>
public class CampReportEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid WorldId { get; set; }

    /// <summary>A <see cref="CampReportKind"/>.</summary>
    public int Kind { get; set; }

    /// <summary>Game instant, not wall time.</summary>
    public DateTimeOffset OccurredAt { get; set; }

    public int CampQ { get; set; }

    public int CampR { get; set; }

    public string Family { get; set; } = string.Empty;

    public int EffectiveLevel { get; set; }

    public Guid SettlementId { get; set; }

    public Guid? ArmyId { get; set; }

    /// <summary>A <see cref="CampFightWinner"/>.</summary>
    public int Winner { get; set; }

    public double ArmyPower { get; set; }

    public double CampPower { get; set; }

    public int Seed { get; set; }

    public double LootWood { get; set; }

    public double LootStone { get; set; }

    public double LootFood { get; set; }

    public double LootIron { get; set; }

    public bool CampCleared { get; set; }

    public int? TowerQ { get; set; }

    public int? TowerR { get; set; }

    public bool TowerBurned { get; set; }

    public List<CampReportUnitLineEntity> UnitLines { get; set; } = [];

    public List<CampReportBeastLineEntity> BeastLines { get; set; } = [];

    public static CampReportEntity FromDomain(CampReport report)
    {
        ArgumentNullException.ThrowIfNull(report);

        var entity = new CampReportEntity
        {
            Id = report.Id,
            WorldId = report.WorldId,
            Kind = (int)report.Kind,
            OccurredAt = report.OccurredAt,
            CampQ = report.CampCoord.Q,
            CampR = report.CampCoord.R,
            Family = report.Family,
            EffectiveLevel = report.EffectiveLevel,
            SettlementId = report.SettlementId,
            ArmyId = report.ArmyId,
            Winner = (int)report.Winner,
            ArmyPower = report.ArmyPower,
            CampPower = report.CampPower,
            Seed = report.Seed,
            LootWood = report.Loot.Wood,
            LootStone = report.Loot.Stone,
            LootFood = report.Loot.Food,
            LootIron = report.Loot.Iron,
            CampCleared = report.CampCleared,
            TowerQ = report.TowerCoord?.Q,
            TowerR = report.TowerCoord?.R,
            TowerBurned = report.TowerBurned,
        };

        entity.UnitLines = [.. report.UnitLines.Select(l => new CampReportUnitLineEntity
        {
            CampReportId = entity.Id,
            UnitType = l.Type,
            Sent = l.Sent,
            Lost = l.Lost,
        })];

        entity.BeastLines = [.. report.BeastLines.Select(l => new CampReportBeastLineEntity
        {
            CampReportId = entity.Id,
            Tier = (int)l.Tier,
            Before = l.Before,
            Lost = l.Lost,
        })];

        return entity;
    }

    public CampReport ToDomain() => new()
    {
        Id = Id,
        WorldId = WorldId,
        Kind = (CampReportKind)Kind,
        OccurredAt = OccurredAt,
        CampCoord = new HexCoord(CampQ, CampR),
        Family = Family,
        EffectiveLevel = EffectiveLevel,
        SettlementId = SettlementId,
        ArmyId = ArmyId,
        Winner = (CampFightWinner)Winner,
        ArmyPower = ArmyPower,
        CampPower = CampPower,
        Seed = Seed,
        Loot = new ResourceAmounts(LootWood, LootStone, LootFood, LootIron),
        CampCleared = CampCleared,
        TowerCoord = TowerQ is { } q ? new HexCoord(q, TowerR!.Value) : null,
        TowerBurned = TowerBurned,
        UnitLines = [.. UnitLines.OrderBy(l => l.UnitType).Select(l => new CampReportUnitLine(l.UnitType, l.Sent, l.Lost))],
        BeastLines = [.. BeastLines.OrderBy(l => l.Tier).Select(l => new CampReportBeastLine((BeastTier)l.Tier, l.Before, l.Lost))],
    };
}

/// <summary>One unit type's sent/lost counts on the player's side of a stored camp fight.</summary>
public class CampReportUnitLineEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid CampReportId { get; set; }

    public CampReportEntity? CampReport { get; set; }

    public UnitType UnitType { get; set; }

    public int Sent { get; set; }

    public int Lost { get; set; }
}

/// <summary>One beast tier's count before a stored camp fight and how many of them died.</summary>
public class CampReportBeastLineEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid CampReportId { get; set; }

    public CampReportEntity? CampReport { get; set; }

    /// <summary>A <see cref="BeastTier"/>.</summary>
    public int Tier { get; set; }

    public int Before { get; set; }

    public int Lost { get; set; }
}
