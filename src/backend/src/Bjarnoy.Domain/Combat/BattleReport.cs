using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;

namespace Bjarnoy.Domain.Combat;

/// <summary>One unit type's sent/lost/survived counts on the attacking side of a battle.</summary>
public sealed record BattleReportAttackerLine(UnitType Type, int Sent, int Lost, int Survived);

/// <summary>One unit type's lost/survived counts on the defending side of a battle.</summary>
public sealed record BattleReportDefenderLine(UnitType Type, int Lost, int Survived);

/// <summary>
/// The immutable, persisted record of one <see cref="BattleResolver.Resolve"/>
/// call (issue #40 phase 3) — one row per battle, landing in both the
/// attacker's and the defender's settlement inbox (see
/// <c>Infrastructure.Services.BattleReportService</c>'s query, which matches
/// either side).
/// </summary>
/// <remarks>
/// Carries <see cref="Seed"/> alongside every input the resolver took, so the
/// exact fight can be replayed by calling <see cref="BattleResolver.Resolve"/>
/// again with the same arguments — this is what "a battle must be replayable
/// from its inputs" (issue #40, §6) means in practice.
/// </remarks>
public sealed record BattleReport
{
    public required Guid Id { get; init; }

    /// <summary>Game instant the battle happened — the attacking army's outbound arrival.</summary>
    public required DateTimeOffset OccurredAt { get; init; }

    public required Guid AttackerArmyId { get; init; }

    /// <summary>The settlement the attacking army was dispatched from (and, if it survives, returns to).</summary>
    public required Guid AttackerSettlementId { get; init; }

    public required Guid DefenderSettlementId { get; init; }

    public required IReadOnlyList<BattleReportAttackerLine> AttackerLines { get; init; }

    public required IReadOnlyList<BattleReportDefenderLine> DefenderLines { get; init; }

    public required ResourceAmounts LootTaken { get; init; }

    public required double AttackPower { get; init; }

    public required double DefensePower { get; init; }

    public required BattleWinner Winner { get; init; }

    public required int Seed { get; init; }

    /// <summary>
    /// Builds the report from a resolved <see cref="BattlePlan"/> plus the
    /// identity fields the resolver itself has no reason to know about.
    /// </summary>
    public static BattleReport From(
        Guid id,
        DateTimeOffset occurredAt,
        Guid attackerArmyId,
        Guid attackerSettlementId,
        Guid defenderSettlementId,
        IReadOnlyList<UnitStack> attackerSent,
        BattlePlan plan,
        int seed)
    {
        ArgumentNullException.ThrowIfNull(attackerSent);
        ArgumentNullException.ThrowIfNull(plan);

        var lostByType = plan.AttackerLosses.ToDictionary(s => s.Type, s => s.Count);
        var survivedByType = plan.AttackerSurvivors.ToDictionary(s => s.Type, s => s.Count);

        var attackerLines = attackerSent
            .Select(sent => new BattleReportAttackerLine(
                sent.Type,
                sent.Count,
                lostByType.GetValueOrDefault(sent.Type),
                survivedByType.GetValueOrDefault(sent.Type)))
            .ToList();

        var defenderSurvivedByType = plan.DefenderSurvivors.ToDictionary(s => s.Type, s => s.Count);
        var defenderLines = plan.DefenderLosses
            .Select(lost => new BattleReportDefenderLine(
                lost.Type, lost.Count, defenderSurvivedByType.GetValueOrDefault(lost.Type)))
            // A defender stack that took no losses at all (winning defence)
            // still belongs in the report — add any survivor-only types the
            // loss list did not already cover.
            .Concat(plan.DefenderSurvivors
                .Where(s => !plan.DefenderLosses.Any(l => l.Type == s.Type))
                .Select(s => new BattleReportDefenderLine(s.Type, Lost: 0, Survived: s.Count)))
            .ToList();

        return new BattleReport
        {
            Id = id,
            OccurredAt = occurredAt,
            AttackerArmyId = attackerArmyId,
            AttackerSettlementId = attackerSettlementId,
            DefenderSettlementId = defenderSettlementId,
            AttackerLines = attackerLines,
            DefenderLines = defenderLines,
            LootTaken = plan.LootTaken,
            AttackPower = plan.AttackPower,
            DefensePower = plan.DefensePower,
            Winner = plan.Winner,
            Seed = seed,
        };
    }
}
