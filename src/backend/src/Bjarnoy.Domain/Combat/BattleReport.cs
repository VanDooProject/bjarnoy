using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Combat;

/// <summary>One unit type's sent/lost/survived counts on the attacking side of a battle.</summary>
public sealed record BattleReportAttackerLine(UnitType Type, int Sent, int Lost, int Survived);

/// <summary>One unit type's lost/survived counts on the defending side of a battle.</summary>
public sealed record BattleReportDefenderLine(UnitType Type, int Lost, int Survived);

/// <summary>
/// The ship fight of a fleet's attack (<see cref="AttackPlan.ShipFight"/>): the attacking ships against all the defending ships.
/// Present on a <see cref="BattleReport"/> only when the defender had ships to fight.
/// </summary>
public sealed record BattleReportShipFight(
    IReadOnlyList<BattleReportAttackerLine> AttackerLines,
    IReadOnlyList<BattleReportDefenderLine> DefenderLines,
    double AttackPower,
    double DefensePower,
    BattleWinner Winner);

/// <summary>
/// The building-damage section of a <see cref="BattleReport"/> (issue #40
/// phase 5) — present only when catapult damage actually happened; see
/// <see cref="BattleReport.Siege"/>. A trimmed-down mirror of
/// <see cref="SiegeOutcome"/> that drops <see cref="SiegeOutcome.UpdatedBuildings"/>
/// (the report is a record of what happened, not the defender's whole
/// building list — that is read from the settlement itself).
/// </summary>
public sealed record BattleReportSiegeLine(
    HexCoord TargetCoord, BuildingType TargetType, int LevelBefore, int LevelAfter, bool SettlementRazed)
{
    public static BattleReportSiegeLine? From(SiegeOutcome? siege) =>
        siege is { Applied: true } applied
            ? new BattleReportSiegeLine(
                applied.TargetCoord!.Value, applied.TargetType!.Value, applied.LevelBefore, applied.LevelAfter, applied.SettlementRazed)
            : null;
}

/// <summary>
/// The immutable, persisted record of one attack (issue #40 phase 3) — one row per battle, landing in both the
/// attacker's and the defender's settlement inbox (see
/// <c>Infrastructure.Services.BattleReportService</c>'s query, which matches
/// either side).
/// </summary>
/// <remarks>
/// <para>
/// A land army fights one fight and a fleet two (<see cref="AttackResolver"/>): the report's own fields
/// (<see cref="AttackerLines"/>, <see cref="DefenderLines"/>, <see cref="AttackPower"/>, <see cref="DefensePower"/>,
/// <see cref="LootTaken"/>, <see cref="Siege"/>) are the land fight (the only fight of a land army; empty for a fleet that
/// fought none), <see cref="ShipFight"/> is the fight at sea, and <see cref="Winner"/> is the whole attack's. A report stored
/// before ships fought separately has no ship fight and reads exactly as it did.
/// </para>
/// <para>
/// Carries <see cref="Seed"/> alongside every input the resolver took, so the
/// exact fight can be replayed by calling <see cref="AttackResolver.Resolve"/>
/// again with the same arguments — this is what "a battle must be replayable
/// from its inputs" (issue #40, §6) means in practice.
/// </para>
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

    /// <summary>The land fight's attacking side (a land army's only fight); empty when a fleet fought no land fight.</summary>
    public required IReadOnlyList<BattleReportAttackerLine> AttackerLines { get; init; }

    /// <summary>The land fight's defending side; empty when no land fight happened.</summary>
    public required IReadOnlyList<BattleReportDefenderLine> DefenderLines { get; init; }

    public required ResourceAmounts LootTaken { get; init; }

    /// <summary>The land fight's attack power; zero when no land fight happened.</summary>
    public required double AttackPower { get; init; }

    /// <summary>The land fight's defence power; zero when no land fight happened.</summary>
    public required double DefensePower { get; init; }

    /// <summary>The whole attack's winner: the attacker unless a fight was lost (a fight not fought counts as not lost).</summary>
    public required BattleWinner Winner { get; init; }

    public required int Seed { get; init; }

    /// <summary>
    /// True when this battle was fought as an <see cref="Armies.ArmyMission.Raid"/>
    /// rather than a plain <see cref="Armies.ArmyMission.Attack"/> (issue #40
    /// phase 7) — see <see cref="BattleResolver.Resolve"/>'s <c>raid</c>
    /// parameter for what that changed about the fight.
    /// </summary>
    public bool WasRaid { get; init; }

    /// <summary>
    /// The siege engines' building damage (issue #40 phase 5), or <see langword="null"/>
    /// when none happened this battle — the land fight was lost or not fought, no
    /// siege engine survived to fire, or the defender had no buildings to hit.
    /// </summary>
    public BattleReportSiegeLine? Siege { get; init; }

    /// <summary>The fight at sea; <see langword="null"/> for a land army and for a fleet whose target had no ships.</summary>
    public BattleReportShipFight? ShipFight { get; init; }

    /// <summary>The passengers the surviving ships could not carry, drowned.</summary>
    public IReadOnlyList<UnitStack> Drowned { get; init; } = [];

    /// <summary>The Fire Ships burned by the fire damage.</summary>
    public int FireShipsBurned { get; init; }

    /// <summary>The Fire Ships' damage to a building standing in the water, or <see langword="null"/> when nothing burned.</summary>
    public BattleReportSiegeLine? FireSiege { get; init; }

    /// <summary>
    /// Builds the report from a resolved <see cref="AttackPlan"/> plus the
    /// identity fields the resolver itself has no reason to know about.
    /// </summary>
    /// <param name="attackerSent">The army as dispatched, at the moment of battle.</param>
    public static BattleReport From(
        Guid id,
        DateTimeOffset occurredAt,
        Guid attackerArmyId,
        Guid attackerSettlementId,
        Guid defenderSettlementId,
        IReadOnlyList<UnitStack> attackerSent,
        AttackPlan attack,
        int seed,
        bool wasRaid = false)
    {
        ArgumentNullException.ThrowIfNull(attackerSent);
        ArgumentNullException.ThrowIfNull(attack);

        var isFleet = ShipCargo.Ships(attackerSent).Count > 0;

        // A land army's land fight carries everyone it sent; a fleet's carries the passengers still aboard when it was fought.
        var landSent = isFleet ? Army.SubtractStacks(ShipCargo.Passengers(attackerSent), attack.Drowned) : attackerSent;
        var land = attack.LandFight;

        BattleReportShipFight? shipFight = null;
        if (attack.ShipFight is { } ship)
        {
            shipFight = new BattleReportShipFight(
                AttackerLinesOf(ShipCargo.Ships(attackerSent), ship),
                DefenderLinesOf(ship),
                ship.AttackPower,
                ship.DefensePower,
                ship.Winner);
        }

        return new BattleReport
        {
            Id = id,
            OccurredAt = occurredAt,
            AttackerArmyId = attackerArmyId,
            AttackerSettlementId = attackerSettlementId,
            DefenderSettlementId = defenderSettlementId,
            AttackerLines = land is null ? [] : AttackerLinesOf(landSent, land),
            DefenderLines = land is null ? [] : DefenderLinesOf(land),
            LootTaken = attack.Loot,
            AttackPower = land?.AttackPower ?? 0,
            DefensePower = land?.DefensePower ?? 0,
            Winner = attack.Winner,
            Seed = seed,
            WasRaid = wasRaid,
            Siege = BattleReportSiegeLine.From(attack.LandSiege),
            ShipFight = shipFight,
            Drowned = attack.Drowned,
            FireShipsBurned = attack.FireShipsBurned,
            FireSiege = BattleReportSiegeLine.From(attack.FireSiege),
        };
    }

    private static List<BattleReportAttackerLine> AttackerLinesOf(IReadOnlyList<UnitStack> sent, BattlePlan fight)
    {
        var lostByType = fight.AttackerLosses.ToDictionary(s => s.Type, s => s.Count);
        var survivedByType = fight.AttackerSurvivors.ToDictionary(s => s.Type, s => s.Count);

        return [.. sent.Select(unit => new BattleReportAttackerLine(
            unit.Type,
            unit.Count,
            lostByType.GetValueOrDefault(unit.Type),
            survivedByType.GetValueOrDefault(unit.Type)))];
    }

    private static List<BattleReportDefenderLine> DefenderLinesOf(BattlePlan fight)
    {
        var survivedByType = fight.DefenderSurvivors.ToDictionary(s => s.Type, s => s.Count);
        return [.. fight.DefenderLosses
            .Select(lost => new BattleReportDefenderLine(lost.Type, lost.Count, survivedByType.GetValueOrDefault(lost.Type)))
            // A defender stack that took no losses at all (winning defence)
            // still belongs in the report — add any survivor-only types the
            // loss list did not already cover.
            .Concat(fight.DefenderSurvivors
                .Where(s => !fight.DefenderLosses.Any(l => l.Type == s.Type))
                .Select(s => new BattleReportDefenderLine(s.Type, Lost: 0, Survived: s.Count)))];
    }
}
