using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// A battle's stored form (issue #40 phase 3). Immutable once written — a
/// battle is resolved once by <see cref="BattleResolver.Resolve"/> and never
/// replayed against live state, so unlike <see cref="ArmyEntity"/> or
/// <see cref="SettlementEntity"/> there is no <c>ApplyDomain</c>/settle cycle
/// here, only a one-way <see cref="FromDomain"/> at creation and
/// <see cref="ToDomain"/> for reads.
/// </summary>
public class BattleReportEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>Game instant, not wall time.</summary>
    public DateTimeOffset OccurredAt { get; set; }

    public Guid AttackerArmyId { get; set; }

    public Guid AttackerSettlementId { get; set; }

    public Guid DefenderSettlementId { get; set; }

    public int Winner { get; set; }

    public double AttackPower { get; set; }

    public double DefensePower { get; set; }

    public int Seed { get; set; }

    public double LootWood { get; set; }

    public double LootStone { get; set; }

    public double LootFood { get; set; }

    public double LootIron { get; set; }

    public List<BattleReportAttackerLineEntity> AttackerLines { get; set; } = [];

    public List<BattleReportDefenderLineEntity> DefenderLines { get; set; } = [];

    public static BattleReportEntity FromDomain(BattleReport report)
    {
        ArgumentNullException.ThrowIfNull(report);

        var entity = new BattleReportEntity
        {
            Id = report.Id,
            OccurredAt = report.OccurredAt,
            AttackerArmyId = report.AttackerArmyId,
            AttackerSettlementId = report.AttackerSettlementId,
            DefenderSettlementId = report.DefenderSettlementId,
            Winner = (int)report.Winner,
            AttackPower = report.AttackPower,
            DefensePower = report.DefensePower,
            Seed = report.Seed,
            LootWood = report.LootTaken.Wood,
            LootStone = report.LootTaken.Stone,
            LootFood = report.LootTaken.Food,
            LootIron = report.LootTaken.Iron,
        };

        entity.AttackerLines = [.. report.AttackerLines.Select(l => new BattleReportAttackerLineEntity
        {
            BattleReportId = entity.Id,
            UnitType = l.Type,
            Sent = l.Sent,
            Lost = l.Lost,
            Survived = l.Survived,
        })];

        entity.DefenderLines = [.. report.DefenderLines.Select(l => new BattleReportDefenderLineEntity
        {
            BattleReportId = entity.Id,
            UnitType = l.Type,
            Lost = l.Lost,
            Survived = l.Survived,
        })];

        return entity;
    }

    public BattleReport ToDomain() => new()
    {
        Id = Id,
        OccurredAt = OccurredAt,
        AttackerArmyId = AttackerArmyId,
        AttackerSettlementId = AttackerSettlementId,
        DefenderSettlementId = DefenderSettlementId,
        Winner = (BattleWinner)Winner,
        AttackPower = AttackPower,
        DefensePower = DefensePower,
        Seed = Seed,
        LootTaken = new ResourceAmounts(LootWood, LootStone, LootFood, LootIron),
        AttackerLines =
        [
            .. AttackerLines.Select(l => new BattleReportAttackerLine(l.UnitType, l.Sent, l.Lost, l.Survived)),
        ],
        DefenderLines =
        [
            .. DefenderLines.Select(l => new BattleReportDefenderLine(l.UnitType, l.Lost, l.Survived)),
        ],
    };
}

/// <summary>One unit type's sent/lost/survived counts on the attacking side of a stored battle.</summary>
public class BattleReportAttackerLineEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid BattleReportId { get; set; }

    public BattleReportEntity? BattleReport { get; set; }

    public UnitType UnitType { get; set; }

    public int Sent { get; set; }

    public int Lost { get; set; }

    public int Survived { get; set; }
}

/// <summary>One unit type's lost/survived counts on the defending side of a stored battle.</summary>
public class BattleReportDefenderLineEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid BattleReportId { get; set; }

    public BattleReportEntity? BattleReport { get; set; }

    public UnitType UnitType { get; set; }

    public int Lost { get; set; }

    public int Survived { get; set; }
}
