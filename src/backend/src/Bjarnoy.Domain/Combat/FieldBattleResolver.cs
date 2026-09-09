using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Combat;

/// <summary>Which side (if either) came out on top of a <see cref="FieldBattleResolver.Resolve"/> call.</summary>
public enum FieldBattleWinner
{
    SideA,
    SideB,

    /// <summary>An exact power tie — both sides lose the raid-capped fraction and both retreat (issue #206 §3).</summary>
    Tie,
}

/// <summary>
/// One side's claim to defend the meeting hex (issue #206 §2) — whether its
/// own settlement's territory covers the hex, and, if so, the already-halved
/// defense-bonus percent that grants. Deliberately scoped to the army's own
/// settlement only, not any guildmate's — no other defense-bonus computation
/// in this codebase looks past a single settlement's own buildings either
/// (see <c>Army.SettleArrival</c>'s own <c>defenseBonusPercent</c>), so a
/// field battle staying consistent with that is the minimal-surprise choice;
/// see the PR's implementation notes.
/// </summary>
/// <param name="Claims">
/// True when the hex falls inside this side's own <see cref="Settlement.ClaimDiscs"/>.
/// </param>
/// <param name="DefenseBonusPercent">
/// Half of the bonus that disc's building would grant in ordinary settlement
/// combat — see <see cref="FieldBattleResolver.ClaimAt"/>. Meaningless (and
/// always 0) when <paramref name="Claims"/> is <see langword="false"/>.
/// </param>
public readonly record struct FieldBattleClaim(bool Claims, double DefenseBonusPercent)
{
    public static readonly FieldBattleClaim None = new(false, 0);
}

/// <summary>
/// The full outcome of one in-flight interception fight (issue #206) — the
/// field-battle sibling of <see cref="BattlePlan"/>. Two hostile armies meet
/// mid-march with nobody besieging anybody: <see cref="BattleResolver.Resolve"/>
/// itself is not reused wholesale because it always treats one side as the
/// asymmetric "attack stat vs. defense stat" defender, whereas a field battle
/// on neutral/contested ground needs both sides to fight with their attack
/// stat symmetrically (issue #206 §2) — a shape <see cref="BattleResolver"/>
/// has no way to express. What *is* reused, byte-for-byte, is the loss
/// rounding (<see cref="BattleResolver.ApplyProportionalLossesInternal"/>) and
/// the water-fill loot split (<see cref="BattleResolver.ComputeLootWithCapacity"/>)
/// — no field-battle-specific divergence in either.
/// </summary>
public sealed record FieldBattlePlan(
    IReadOnlyList<UnitStack> SideALosses,
    IReadOnlyList<UnitStack> SideASurvivors,
    IReadOnlyList<UnitStack> SideBLosses,
    IReadOnlyList<UnitStack> SideBSurvivors,
    ResourceAmounts LootTakenByWinner,
    FieldBattleWinner Winner,
    double SideAPower,
    double SideBPower,
    bool SideAWasDefending,
    bool SideBWasDefending);

/// <summary>
/// Pure combat math for an in-flight, army-vs-army interception (issue #206)
/// — no I/O, no ambient clock or RNG, mirroring <see cref="BattleResolver"/>'s
/// own posture so a fight can always be replayed exactly from the inputs a
/// stored report carries.
/// </summary>
public static class FieldBattleResolver
{
    /// <summary>
    /// Whether two armies are hostile at all (issue #206 §1) — same owner or
    /// same guild never fights, full stop; anything else is hostile by
    /// default (no peace-treaty check here — see #205, deliberately deferred).
    /// Evaluated at resolution time, not detection time (guild membership can
    /// change in between) — callers must re-check this immediately before
    /// resolving, not trust a value cached from when the encounter was
    /// predicted.
    /// </summary>
    public static bool IsHostile(Guid ownerAUserId, Guid? guildAId, Guid ownerBUserId, Guid? guildBId)
    {
        if (ownerAUserId == ownerBUserId)
        {
            return false;
        }

        if (guildAId is { } a && guildBId is { } b && a == b)
        {
            return false;
        }

        return true;
    }

    /// <summary>
    /// Whether <paramref name="hex"/> falls inside the claimed territory
    /// described by <paramref name="settlementCentre"/>/<paramref name="buildings"/>
    /// (issue #206 §2), and if so, the already-halved defense-bonus percent
    /// that grants a defender standing there. A specific <see cref="BuildingType.Tower"/>'s
    /// own satellite disc is checked before the central disc (mirroring
    /// <see cref="Settlement.ClaimDiscsFor"/>'s own disc ordering), since the
    /// two use different bonus sources: a Tower's own disc uses that exact
    /// tower's level, while the central/Longhouse disc — which has no bonus
    /// of its own to halve — uses the settlement's single highest Tower
    /// instead, representing overall fortification rather than one structure.
    /// </summary>
    public static FieldBattleClaim ClaimAt(
        HexCoord hex, HexCoord settlementCentre, IReadOnlyList<PlacedBuilding> buildings)
    {
        ArgumentNullException.ThrowIfNull(buildings);

        foreach (var building in buildings)
        {
            if (building.Type != BuildingType.Tower)
            {
                continue;
            }

            var towerRadius = Settlement.TowerClaimRadius(building.Level);
            if (building.Coord.DistanceTo(hex) <= towerRadius)
            {
                return new FieldBattleClaim(true, BuildingCatalogue.TowerDefenseBonusPercent(building.Level) * 0.5);
            }
        }

        var longhouseLevel = buildings.FirstOrDefault(b => b.Type == BuildingType.Longhouse).Level;
        var centreRadius = Settlement.ClaimRadiusForLonghouseLevel(longhouseLevel);
        if (settlementCentre.DistanceTo(hex) > centreRadius)
        {
            return FieldBattleClaim.None;
        }

        var highestTowerLevel = buildings
            .Where(b => b.Type == BuildingType.Tower)
            .Select(b => b.Level)
            .DefaultIfEmpty(0)
            .Max();
        return new FieldBattleClaim(true, BuildingCatalogue.TowerDefenseBonusPercent(highestTowerLevel) * 0.5);
    }

    /// <summary>
    /// Resolves one in-flight interception. Both sides commit everything they
    /// have — there is no partial commitment, and unlike <see cref="BattleResolver.Resolve"/>
    /// this is unconditionally raid-shaped (issue #206 §3): both sides' losses
    /// are capped at 50%, since an accidental mid-march meeting is not a
    /// committed siege.
    /// </summary>
    /// <param name="sideAStacks">Side A's committed stacks.</param>
    /// <param name="sideAClaim">
    /// Side A's <see cref="FieldBattleClaim"/> at the meeting hex — see
    /// <see cref="ClaimAt"/>.
    /// </param>
    /// <param name="sideBStacks">Side B's committed stacks.</param>
    /// <param name="sideBClaim">Side B's <see cref="FieldBattleClaim"/> at the meeting hex.</param>
    /// <param name="sideALootCarried">
    /// Side A's own already-carried <c>Army.Loot</c> — counts against its
    /// carry capacity exactly as much as any loot it might additionally take
    /// here, so a winning army can never loot past its actual limit (issue
    /// #206 §4). Also what side B loots if side A loses.
    /// </param>
    /// <param name="sideBLootCarried">Side B's own carried loot — the mirror of <paramref name="sideALootCarried"/>.</param>
    /// <param name="seed">
    /// Seeds the tie-breaking RNG for proportional-loss rounding — see
    /// <see cref="BattleResolver.Resolve"/>'s own <c>seed</c> remarks. The
    /// same seed always produces the same result, so a stored
    /// <c>FieldBattleReport</c> can always be replayed exactly.
    /// </param>
    /// <remarks>
    /// <para>
    /// Exactly one side qualifying as defender (<see cref="FieldBattleClaim.Claims"/>)
    /// makes this asymmetric — that side fights with its Defense stat plus its
    /// halved bonus, the other with its Attack stat — same shape
    /// <see cref="BattleResolver.Resolve"/> uses for settlement combat.
    /// Neither side qualifying, or both qualifying (contested/neutral
    /// ground), makes this symmetric instead: both sides use their Attack
    /// stat, nobody dug in, no walls to defend from (issue #206 §2) — the one
    /// shape <see cref="BattleResolver"/> itself cannot express, which is why
    /// this type exists rather than calling it directly.
    /// </para>
    /// <para>
    /// An exact power tie needs no special-case tie-break: both sides are
    /// simply each other's "loser", so both take the raid-capped 50% loss and
    /// both have survivors — this falls directly out of applying the same
    /// loss formula symmetrically (issue #206 §3).
    /// </para>
    /// </remarks>
    public static FieldBattlePlan Resolve(
        IReadOnlyList<UnitStack> sideAStacks,
        FieldBattleClaim sideAClaim,
        IReadOnlyList<UnitStack> sideBStacks,
        FieldBattleClaim sideBClaim,
        ResourceAmounts sideALootCarried,
        ResourceAmounts sideBLootCarried,
        int seed)
    {
        ArgumentNullException.ThrowIfNull(sideAStacks);
        ArgumentNullException.ThrowIfNull(sideBStacks);

        // Exactly one side defending is the only case that gets asymmetric
        // treatment — see the remarks above.
        var asymmetric = sideAClaim.Claims ^ sideBClaim.Claims;

        var sideAPower = asymmetric && sideAClaim.Claims
            ? DefensePower(sideAStacks, sideAClaim.DefenseBonusPercent)
            : AttackPower(sideAStacks);
        var sideBPower = asymmetric && sideBClaim.Claims
            ? DefensePower(sideBStacks, sideBClaim.DefenseBonusPercent)
            : AttackPower(sideBStacks);

        var winner = sideAPower > sideBPower
            ? FieldBattleWinner.SideA
            : sideBPower > sideAPower
                ? FieldBattleWinner.SideB
                : FieldBattleWinner.Tie;

        var rng = new Random(seed);

        IReadOnlyList<UnitStack> sideALosses;
        IReadOnlyList<UnitStack> sideASurvivors;
        IReadOnlyList<UnitStack> sideBLosses;
        IReadOnlyList<UnitStack> sideBSurvivors;

        if (winner == FieldBattleWinner.Tie)
        {
            var tieFraction = BattleResolver.RaidLossFractionInternal(1.0);
            (sideALosses, sideASurvivors) = BattleResolver.ApplyProportionalLossesInternal(sideAStacks, tieFraction, rng);
            (sideBLosses, sideBSurvivors) = BattleResolver.ApplyProportionalLossesInternal(sideBStacks, tieFraction, rng);
        }
        else if (winner == FieldBattleWinner.SideA)
        {
            var loserFraction = BattleResolver.RaidLossFractionInternal(1.0);
            (sideBLosses, sideBSurvivors) = BattleResolver.ApplyProportionalLossesInternal(sideBStacks, loserFraction, rng);

            var winnerFraction = BattleResolver.RaidLossFractionInternal(SafeRatioPow(sideBPower, sideAPower));
            (sideALosses, sideASurvivors) = BattleResolver.ApplyProportionalLossesInternal(sideAStacks, winnerFraction, rng);
        }
        else
        {
            var loserFraction = BattleResolver.RaidLossFractionInternal(1.0);
            (sideALosses, sideASurvivors) = BattleResolver.ApplyProportionalLossesInternal(sideAStacks, loserFraction, rng);

            var winnerFraction = BattleResolver.RaidLossFractionInternal(SafeRatioPow(sideAPower, sideBPower));
            (sideBLosses, sideBSurvivors) = BattleResolver.ApplyProportionalLossesInternal(sideBStacks, winnerFraction, rng);
        }

        var loot = winner switch
        {
            FieldBattleWinner.SideA => LootFor(sideASurvivors, sideALootCarried, sideBLootCarried),
            FieldBattleWinner.SideB => LootFor(sideBSurvivors, sideBLootCarried, sideALootCarried),
            _ => ResourceAmounts.Zero,
        };

        return new FieldBattlePlan(
            sideALosses, sideASurvivors, sideBLosses, sideBSurvivors,
            loot, winner, sideAPower, sideBPower,
            SideAWasDefending: asymmetric && sideAClaim.Claims,
            SideBWasDefending: asymmetric && sideBClaim.Claims);
    }

    private static double AttackPower(IReadOnlyList<UnitStack> stacks) =>
        stacks.Sum(s => (double)UnitCatalogue.Get(s.Type).Attack * s.Count);

    private static double DefensePower(IReadOnlyList<UnitStack> stacks, double defenseBonusPercent) =>
        stacks.Sum(s => (double)UnitCatalogue.Get(s.Type).Defense * s.Count) * (1 + (defenseBonusPercent / 100.0));

    /// <summary>(loserPower / winnerPower)^1.5, or 0 when either power is non-positive — mirrors <see cref="BattleResolver"/>'s own helper.</summary>
    private static double SafeRatioPow(double loserPower, double winnerPower) =>
        loserPower <= 0 || winnerPower <= 0 ? 0.0 : Math.Pow(loserPower / winnerPower, 1.5);

    /// <summary>
    /// The winner's remaining carry capacity — its total capacity minus
    /// whatever loot it is already carrying — filled from the loser's carried
    /// loot (issue #206 §4).
    /// </summary>
    private static ResourceAmounts LootFor(
        IReadOnlyList<UnitStack> winnerSurvivors, ResourceAmounts winnerAlreadyCarried, ResourceAmounts loserCarried)
    {
        var totalCapacity = winnerSurvivors.Sum(s => (double)UnitCatalogue.Get(s.Type).CarryCapacity * s.Count);
        var alreadyUsed = winnerAlreadyCarried.Wood + winnerAlreadyCarried.Stone
            + winnerAlreadyCarried.Food + winnerAlreadyCarried.Iron;
        var remainingCapacity = Math.Max(0, totalCapacity - alreadyUsed);
        return BattleResolver.ComputeLootWithCapacity(remainingCapacity, loserCarried);
    }
}
