using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

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

    /// <summary>True when this was fought as an <see cref="Domain.Armies.ArmyMission.Raid"/> rather than a plain Attack (issue #40 phase 7).</summary>
    public bool WasRaid { get; set; }

    public double LootWood { get; set; }

    public double LootStone { get; set; }

    public double LootFood { get; set; }

    public double LootIron { get; set; }

    /// <summary>
    /// The building-damage section (issue #40 phase 5) — all null when no
    /// catapult damage happened this battle; see <see cref="BattleReport.Siege"/>.
    /// </summary>
    public int? SiegeTargetQ { get; set; }

    public int? SiegeTargetR { get; set; }

    public BuildingType? SiegeTargetType { get; set; }

    public int? SiegeLevelBefore { get; set; }

    public int? SiegeLevelAfter { get; set; }

    public bool? SiegeSettlementRazed { get; set; }

    /// <summary>
    /// The ship fight of a fleet's attack (<see cref="BattleReport.ShipFight"/>): all null when none was fought (a land army, an
    /// older report, or a target without ships). Its lines are the line rows with <see cref="BattleReportFight.Ship"/>.
    /// </summary>
    public double? ShipFightAttackPower { get; set; }

    public double? ShipFightDefensePower { get; set; }

    public int? ShipFightWinner { get; set; }

    /// <summary>The Fire Ships burned by the fire damage (zero when none, and for older reports).</summary>
    public int FireShipsBurned { get; set; }

    /// <summary>The Fire Ships' building damage — all null when nothing burned; see <see cref="BattleReport.FireSiege"/>.</summary>
    public int? FireSiegeTargetQ { get; set; }

    public int? FireSiegeTargetR { get; set; }

    public BuildingType? FireSiegeTargetType { get; set; }

    public int? FireSiegeLevelBefore { get; set; }

    public int? FireSiegeLevelAfter { get; set; }

    public bool? FireSiegeSettlementRazed { get; set; }

    /// <summary>
    /// Attacker line rows of every fight (<see cref="BattleReportFight"/>): the land fight's, the ship fight's, and the drowned
    /// passengers (<see cref="BattleReportFight.Drowned"/>, <c>Sent</c> = <c>Lost</c> = how many drowned).
    /// </summary>
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
            WasRaid = report.WasRaid,
            LootWood = report.LootTaken.Wood,
            LootStone = report.LootTaken.Stone,
            LootFood = report.LootTaken.Food,
            LootIron = report.LootTaken.Iron,
            SiegeTargetQ = report.Siege?.TargetCoord.Q,
            SiegeTargetR = report.Siege?.TargetCoord.R,
            SiegeTargetType = report.Siege?.TargetType,
            SiegeLevelBefore = report.Siege?.LevelBefore,
            SiegeLevelAfter = report.Siege?.LevelAfter,
            SiegeSettlementRazed = report.Siege?.SettlementRazed,
            ShipFightAttackPower = report.ShipFight?.AttackPower,
            ShipFightDefensePower = report.ShipFight?.DefensePower,
            ShipFightWinner = report.ShipFight is { } shipFight ? (int)shipFight.Winner : null,
            FireShipsBurned = report.FireShipsBurned,
            FireSiegeTargetQ = report.FireSiege?.TargetCoord.Q,
            FireSiegeTargetR = report.FireSiege?.TargetCoord.R,
            FireSiegeTargetType = report.FireSiege?.TargetType,
            FireSiegeLevelBefore = report.FireSiege?.LevelBefore,
            FireSiegeLevelAfter = report.FireSiege?.LevelAfter,
            FireSiegeSettlementRazed = report.FireSiege?.SettlementRazed,
        };

        BattleReportAttackerLineEntity AttackerLine(BattleReportFight fight, BattleReportAttackerLine l) => new()
        {
            BattleReportId = entity.Id,
            Fight = fight,
            UnitType = l.Type,
            Sent = l.Sent,
            Lost = l.Lost,
            Survived = l.Survived,
        };

        BattleReportDefenderLineEntity DefenderLine(BattleReportFight fight, BattleReportDefenderLine l) => new()
        {
            BattleReportId = entity.Id,
            Fight = fight,
            UnitType = l.Type,
            Lost = l.Lost,
            Survived = l.Survived,
        };

        entity.AttackerLines =
        [
            .. report.AttackerLines.Select(l => AttackerLine(BattleReportFight.Land, l)),
            .. (report.ShipFight?.AttackerLines ?? []).Select(l => AttackerLine(BattleReportFight.Ship, l)),
            .. report.Drowned.Select(d => AttackerLine(BattleReportFight.Drowned, new BattleReportAttackerLine(d.Type, d.Count, d.Count, 0))),
        ];

        entity.DefenderLines =
        [
            .. report.DefenderLines.Select(l => DefenderLine(BattleReportFight.Land, l)),
            .. (report.ShipFight?.DefenderLines ?? []).Select(l => DefenderLine(BattleReportFight.Ship, l)),
        ];

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
        WasRaid = WasRaid,
        LootTaken = new ResourceAmounts(LootWood, LootStone, LootFood, LootIron),
        Siege = SiegeTargetQ is { } q
            ? new BattleReportSiegeLine(
                new HexCoord(q, SiegeTargetR!.Value), SiegeTargetType!.Value, SiegeLevelBefore!.Value,
                SiegeLevelAfter!.Value, SiegeSettlementRazed!.Value)
            : null,
        AttackerLines =
        [
            .. AttackerLines.Where(l => l.Fight == BattleReportFight.Land)
                .Select(l => new BattleReportAttackerLine(l.UnitType, l.Sent, l.Lost, l.Survived)),
        ],
        DefenderLines =
        [
            .. DefenderLines.Where(l => l.Fight == BattleReportFight.Land)
                .Select(l => new BattleReportDefenderLine(l.UnitType, l.Lost, l.Survived)),
        ],
        ShipFight = ShipFightWinner is { } shipWinner
            ? new BattleReportShipFight(
                [.. AttackerLines.Where(l => l.Fight == BattleReportFight.Ship)
                    .Select(l => new BattleReportAttackerLine(l.UnitType, l.Sent, l.Lost, l.Survived))],
                [.. DefenderLines.Where(l => l.Fight == BattleReportFight.Ship)
                    .Select(l => new BattleReportDefenderLine(l.UnitType, l.Lost, l.Survived))],
                ShipFightAttackPower ?? 0,
                ShipFightDefensePower ?? 0,
                (BattleWinner)shipWinner)
            : null,
        Drowned =
        [
            .. AttackerLines.Where(l => l.Fight == BattleReportFight.Drowned).Select(l => new UnitStack(l.UnitType, l.Lost)),
        ],
        FireShipsBurned = FireShipsBurned,
        FireSiege = FireSiegeTargetQ is { } fireQ
            ? new BattleReportSiegeLine(
                new HexCoord(fireQ, FireSiegeTargetR!.Value), FireSiegeTargetType!.Value, FireSiegeLevelBefore!.Value,
                FireSiegeLevelAfter!.Value, FireSiegeSettlementRazed!.Value)
            : null,
    };
}

/// <summary>Which part of an attack a stored report line belongs to.</summary>
public enum BattleReportFight
{
    /// <summary>The land fight, or the only fight of a land army (and every line of a report stored before ships fought separately).</summary>
    Land = 0,

    /// <summary>The ship fight of a fleet's attack.</summary>
    Ship = 1,

    /// <summary>Passengers drowned (attacker lines only): <c>Sent</c> and <c>Lost</c> are the number drowned.</summary>
    Drowned = 2,
}

/// <summary>One unit type's sent/lost/survived counts on the attacking side of a stored battle.</summary>
public class BattleReportAttackerLineEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid BattleReportId { get; set; }

    public BattleReportEntity? BattleReport { get; set; }

    public BattleReportFight Fight { get; set; }

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

    public BattleReportFight Fight { get; set; }

    public UnitType UnitType { get; set; }

    public int Lost { get; set; }

    public int Survived { get; set; }
}
