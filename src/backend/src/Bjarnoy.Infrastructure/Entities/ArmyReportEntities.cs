using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Units;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// An army report ("army stuck", "army starved"): written once, never changed. It belongs to the player, not to a
/// settlement — <see cref="OwnerId"/> and <see cref="UserId"/> carry the same meaning as on <see cref="SettlementEntity"/>
/// (the realm's founding owner key, and the account, or the reserved abandoned user for an anonymous realm).
/// </summary>
public class ArmyReportEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid WorldId { get; set; }

    /// <summary>Same meaning as <see cref="SettlementEntity.OwnerId"/>.</summary>
    public required string OwnerId { get; set; }

    /// <summary>Same meaning as <see cref="SettlementEntity.UserId"/>.</summary>
    public Guid UserId { get; set; }

    /// <summary>An <see cref="ArmyReportKind"/>.</summary>
    public int Kind { get; set; }

    /// <summary>Game instant, not wall time.</summary>
    public DateTimeOffset OccurredAt { get; set; }

    /// <summary>The army the report is about. No foreign key: a starved army's row is gone.</summary>
    public Guid ArmyId { get; set; }

    /// <summary>Where the army stood.</summary>
    public int Q { get; set; }

    public int R { get; set; }

    /// <summary>The army's <see cref="ArmyMission"/> when it happened.</summary>
    public int Mission { get; set; }

    /// <summary>Troops lost (<see cref="ArmyReportKind.Starved"/>) or troops in the army (<see cref="ArmyReportKind.Stuck"/>).</summary>
    public List<ArmyReportUnitLineEntity> UnitLines { get; set; } = [];

    public static ArmyReportEntity Create(
        Guid worldId, string ownerId, Guid userId, ArmyReportKind kind, DateTimeOffset occurredAt,
        Guid armyId, Bjarnoy.Domain.World.HexCoord hex, ArmyMission mission, IEnumerable<UnitStack> units)
    {
        ArgumentNullException.ThrowIfNull(ownerId);
        ArgumentNullException.ThrowIfNull(units);

        var report = new ArmyReportEntity
        {
            WorldId = worldId,
            OwnerId = ownerId,
            UserId = userId,
            Kind = (int)kind,
            OccurredAt = occurredAt,
            ArmyId = armyId,
            Q = hex.Q,
            R = hex.R,
            Mission = (int)mission,
        };
        report.UnitLines = [.. units.Where(u => u.Count > 0).Select(u => new ArmyReportUnitLineEntity
        {
            ArmyReportId = report.Id,
            UnitType = u.Type,
            Count = u.Count,
        })];
        return report;
    }
}

/// <summary>One unit type's count in an army report.</summary>
public class ArmyReportUnitLineEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid ArmyReportId { get; set; }

    public ArmyReportEntity? ArmyReport { get; set; }

    public UnitType UnitType { get; set; }

    public int Count { get; set; }
}
