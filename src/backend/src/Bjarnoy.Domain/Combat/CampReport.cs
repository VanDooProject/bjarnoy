using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Combat;

/// <summary>Why a camp fight happened. The integer values are stored; never renumber.</summary>
public enum CampReportKind
{
    /// <summary>A player's army hunted the camp (<see cref="Armies.ArmyMission.Hunt"/>).</summary>
    Hunt = 0,

    /// <summary>The camp ambushed an army whose route entered its guard range.</summary>
    Ambush = 1,

    /// <summary>The camp attacked a tower inside its guard range.</summary>
    Tower = 2,
}

/// <summary>One unit type's sent/lost counts on the player's side of a camp fight.</summary>
public sealed record CampReportUnitLine(UnitType Type, int Sent, int Lost);

/// <summary>One beast tier's count before the fight and how many of them died.</summary>
public sealed record CampReportBeastLine(BeastTier Tier, int Before, int Lost);

/// <summary>
/// The immutable, persisted record of one camp fight (hunt, ambush or tower attack) — see
/// <c>docs/design/wildlife-camps.md</c>, "Reports". Lands in the inbox of the player's settlement only;
/// the camp has no owner. Carries <see cref="Seed"/> so the fight can be replayed from its inputs.
/// </summary>
public sealed record CampReport
{
    public required Guid Id { get; init; }

    public required Guid WorldId { get; init; }

    public required CampReportKind Kind { get; init; }

    /// <summary>Game instant of the fight.</summary>
    public required DateTimeOffset OccurredAt { get; init; }

    public required HexCoord CampCoord { get; init; }

    public required string Family { get; init; }

    /// <summary>The camp's effective level at the fight (before a clear raised it).</summary>
    public required int EffectiveLevel { get; init; }

    /// <summary>The player side's settlement: the army's home, or the tower's owner.</summary>
    public required Guid SettlementId { get; init; }

    public Guid? ArmyId { get; init; }

    public required CampFightWinner Winner { get; init; }

    /// <summary>The player side's power (see <see cref="CampFightPlan.ArmyPower"/>).</summary>
    public required double ArmyPower { get; init; }

    public required double CampPower { get; init; }

    public required int Seed { get; init; }

    public required ResourceAmounts Loot { get; init; }

    /// <summary>True when this fight killed the last beast of a camp that had some.</summary>
    public required bool CampCleared { get; init; }

    public HexCoord? TowerCoord { get; init; }

    public bool TowerBurned { get; init; }

    public required IReadOnlyList<CampReportUnitLine> UnitLines { get; init; }

    public required IReadOnlyList<CampReportBeastLine> BeastLines { get; init; }

    /// <summary>Builds the report from a resolved <see cref="CampFightPlan"/> and the garrison it was fought against.</summary>
    public static CampReport From(
        Guid id,
        Guid worldId,
        CampReportKind kind,
        DateTimeOffset occurredAt,
        Camp camp,
        int effectiveLevel,
        Guid settlementId,
        Guid? armyId,
        IReadOnlyList<UnitStack> sent,
        CampGarrison garrisonBefore,
        CampFightPlan plan,
        int seed,
        HexCoord? towerCoord = null,
        bool towerBurned = false)
    {
        ArgumentNullException.ThrowIfNull(sent);
        ArgumentNullException.ThrowIfNull(plan);

        var lostByType = plan.ArmyLosses.ToDictionary(s => s.Type, s => s.Count);
        var unitLines = sent
            .Select(s => new CampReportUnitLine(s.Type, s.Count, lostByType.GetValueOrDefault(s.Type)))
            .ToList();

        // A hunt on an empty camp reports no beasts at all; otherwise every tier that stood.
        var beastLines = Enum.GetValues<BeastTier>()
            .Where(t => garrisonBefore[t] > 0)
            .Select(t => new CampReportBeastLine(t, garrisonBefore[t], plan.BeastLosses[t]))
            .ToList();

        return new CampReport
        {
            Id = id,
            WorldId = worldId,
            Kind = kind,
            OccurredAt = occurredAt,
            CampCoord = camp.Coord,
            Family = camp.Family,
            EffectiveLevel = effectiveLevel,
            SettlementId = settlementId,
            ArmyId = armyId,
            Winner = plan.Winner,
            ArmyPower = plan.ArmyPower,
            CampPower = plan.CampPower,
            Seed = seed,
            Loot = plan.Loot,
            CampCleared = !garrisonBefore.IsEmpty && plan.BeastSurvivors.IsEmpty,
            TowerCoord = towerCoord,
            TowerBurned = towerBurned,
            UnitLines = unitLines,
            BeastLines = beastLines,
        };
    }
}
