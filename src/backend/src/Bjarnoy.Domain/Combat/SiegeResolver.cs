using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Combat;

/// <summary>
/// The result of asking <see cref="SiegeResolver.Resolve"/> to apply catapult
/// damage after a won battle (issue #40 phase 5).
/// </summary>
/// <param name="Applied">
/// Whether any damage actually happened — <see langword="false"/> when there
/// were no surviving catapults, or the defender had no buildings at all to
/// hit (defensive; a settlement always has a Longhouse in practice).
/// </param>
/// <param name="TargetCoord">The hex hit, or <see langword="null"/> when <paramref name="Applied"/> is false.</param>
/// <param name="TargetType">The building type hit.</param>
/// <param name="LevelBefore">The target's level immediately before this siege.</param>
/// <param name="LevelAfter">
/// The target's level after — 0 means the building was removed from
/// <paramref name="UpdatedBuildings"/> entirely, freeing its hex.
/// </param>
/// <param name="SettlementRazed">
/// True when the target was the Longhouse and <paramref name="LevelAfter"/>
/// is 0 — per the design doc, a settlement with no Longhouse is "razed": its
/// <see cref="Settlement.ClaimRadius"/> falls to its level-0 floor for free
/// (see <see cref="Settlement.ClaimRadius"/>'s remarks), nothing else is
/// implied or applied automatically. The garrison is left as-is (not
/// specified by the design doc) and guest armies are not forcibly recalled —
/// both deliberately deferred, see <see cref="Resolve"/>'s remarks.
/// </param>
/// <param name="UpdatedBuildings">
/// The defender's full building list with the damage applied, or
/// <see langword="null"/> when <paramref name="Applied"/> is false (nothing
/// for the caller to swap in).
/// </param>
public sealed record SiegeOutcome(
    bool Applied,
    HexCoord? TargetCoord,
    BuildingType? TargetType,
    int LevelBefore,
    int LevelAfter,
    bool SettlementRazed,
    IReadOnlyList<PlacedBuilding>? UpdatedBuildings)
{
    /// <summary>No catapult damage happened this battle.</summary>
    public static SiegeOutcome None { get; } = new(false, null, null, 0, 0, false, null);
}

/// <summary>
/// Pure catapult building-destruction math (issue #40 phase 5), applied by
/// <see cref="Armies.Army.SettleArrival"/> after a won <see cref="Armies.ArmyMission.Attack"/>
/// battle. No I/O, no ambient clock — the RNG seed is a parameter, exactly
/// like <see cref="BattleResolver.Resolve"/>, so a siege is always replayable
/// from a stored <see cref="BattleReport"/>'s inputs.
/// </summary>
/// <remarks>
/// <para>
/// Settlement conquest/capture is explicitly out of scope for issue #40
/// phase 5 — razing (reducing the Longhouse to 0, which shrinks
/// <see cref="Settlement.ClaimRadius"/> to its floor for free) is as far as
/// this goes. Forcibly recalling guest (<see cref="Armies.ArmyMission.Support"/>)
/// armies from a settlement razed out from under them is reasonable future
/// polish, deliberately not implemented here — a razed settlement with no
/// Longhouse is a slightly unusual state (no anchor, but still a settlement
/// with a garrison, guests, and a resource stock) that the rest of the system
/// needs to tolerate defensively rather than assume can never happen, not a
/// new mechanic in its own right.
/// </para>
/// </remarks>
public static class SiegeResolver
{
    /// <summary>
    /// <c>max(1, floor(sqrt(survivingSiegePower / 2)))</c> when
    /// <paramref name="survivingSiegePower"/> is positive, else 0 — the
    /// design doc's levels-destroyed formula.
    /// </summary>
    public static int LevelsDestroyed(long survivingSiegePower) =>
        survivingSiegePower <= 0 ? 0 : Math.Max(1, (int)Math.Floor(Math.Sqrt(survivingSiegePower / 2.0)));

    /// <summary>
    /// Applies catapult damage from <paramref name="attackerSurvivors"/>
    /// against one of <paramref name="defenderBuildings"/>.
    /// </summary>
    /// <param name="attackerSurvivors">
    /// The attacking army's stacks that survived the battle (<see cref="BattlePlan.AttackerSurvivors"/>).
    /// Only <see cref="UnitType.Catapult"/> stacks contribute; call this only
    /// when the attacker actually won — an attacker that lost contributes no
    /// siege damage regardless of what it brought, and this method does not
    /// check the battle's winner itself (the caller already knows).
    /// </param>
    /// <param name="defenderBuildings">The defender's current placed buildings, as of the battle instant.</param>
    /// <param name="requestedTargetCoord">
    /// The coordinate named at dispatch (<see cref="Armies.Army.TargetBuildingCoord"/>),
    /// or <see langword="null"/> for "no preference". Used only if a building
    /// still actually stands there now — the settlement's layout can change
    /// between dispatch and arrival, and re-validating "does this building
    /// exist" is this method's job, not dispatch's (see
    /// <see cref="Armies.Army.PlanDispatch"/>'s remarks). Falls back to a
    /// uniformly random pick (seeded by <paramref name="seed"/>, so
    /// deterministic and replayable) when it no longer exists or none was
    /// requested. The Longhouse is a valid target either way — including as a
    /// random pick — the design doc explicitly calls out Longhouse
    /// destruction as a real, intended consequence.
    /// </param>
    /// <param name="seed">Seeds the random-target fallback only; the same seed always picks the same target.</param>
    public static SiegeOutcome Resolve(
        IReadOnlyList<UnitStack> attackerSurvivors,
        IReadOnlyList<PlacedBuilding> defenderBuildings,
        HexCoord? requestedTargetCoord,
        int seed)
    {
        ArgumentNullException.ThrowIfNull(attackerSurvivors);
        ArgumentNullException.ThrowIfNull(defenderBuildings);

        if (defenderBuildings.Count == 0)
        {
            // Defensive: a settlement always has a Longhouse in practice.
            return SiegeOutcome.None;
        }

        var survivingSiegePower = attackerSurvivors
            .Where(s => s.Type == UnitType.Catapult)
            .Sum(s => (long)UnitCatalogue.Get(s.Type).SiegePower * s.Count);

        var levelsDestroyed = LevelsDestroyed(survivingSiegePower);
        if (levelsDestroyed <= 0)
        {
            // No catapults survived to fire (none were sent, or a
            // 100%-catapult army that won by a hair still lost every one of
            // them) — no damage happens.
            return SiegeOutcome.None;
        }

        var buildings = defenderBuildings.ToList();
        var index = requestedTargetCoord is { } coord
            ? buildings.FindIndex(b => b.Coord == coord)
            : -1;

        if (index < 0)
        {
            var rng = new Random(seed);
            index = rng.Next(buildings.Count);
        }

        var target = buildings[index];
        var levelAfter = Math.Max(0, target.Level - levelsDestroyed);

        if (levelAfter <= 0)
        {
            buildings.RemoveAt(index);
        }
        else
        {
            buildings[index] = target with { Level = levelAfter };
        }

        var razed = target.Type == BuildingType.Longhouse && levelAfter <= 0;

        return new SiegeOutcome(
            Applied: true,
            TargetCoord: target.Coord,
            TargetType: target.Type,
            LevelBefore: target.Level,
            LevelAfter: levelAfter,
            SettlementRazed: razed,
            UpdatedBuildings: buildings);
    }
}
