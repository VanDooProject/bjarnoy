using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;

namespace Bjarnoy.Domain.Ai;

/// <summary>
/// The weights and thresholds one <see cref="AiPersonality"/> reads —
/// see <c>docs/design/ai-players.md</c>'s "Personalities" table. A profile is
/// data, not behaviour: <see cref="AiPlanner"/> is the only code that reads
/// it.
/// </summary>
/// <param name="Economy">
/// Weight for <see cref="Ai.AiBuildingRole.Producer"/> buildings — which
/// <see cref="BuildingType"/>s that is, and which resource(s) each one
/// produces, is derived from the catalogue by <see cref="AiBuildingRoles"/>,
/// not listed here.
/// </param>
/// <param name="Storage">Weight for <see cref="Ai.AiBuildingRole.Storage"/> buildings (today StorageHouse/GreatStorehouse).</param>
/// <param name="Military">Weight for <see cref="Ai.AiBuildingRole.Military"/> buildings — those that train at least one unit (today Barracks/ArcheryRange/Dockyard).</param>
/// <param name="Defense">Weight for <see cref="Ai.AiBuildingRole.Defense"/> buildings — see that flag's remarks for why it coincides with <see cref="Territory"/> today.</param>
/// <param name="Territory">Weight for <see cref="Ai.AiBuildingRole.Territory"/> buildings (today Tower).</param>
/// <param name="Faith">Weight for <see cref="Ai.AiBuildingRole.Faith"/> buildings (the four shrines).</param>
/// <param name="Longhouse">Weight for <see cref="Ai.AiBuildingRole.Anchor"/> — the Longhouse itself.</param>
/// <param name="GarrisonPerLonghouseLevel">
/// Target garrison size is this, times the current longhouse level (or
/// higher, if an open <see cref="AiObjectiveKind.GarrisonStrength"/>
/// objective asks for more).
/// </param>
/// <param name="PreferredUnits">
/// Tried in order when training — see <see cref="AiPlanner"/>'s train step.
/// Never includes <see cref="UnitType.SettlerCrew"/> or a
/// <see cref="UnitClass.Ship"/> type; the planner trains neither.
/// </param>
/// <param name="AttackMargin">
/// <see langword="null"/> means this personality never raids. Otherwise, a
/// raid is only sent when this settlement's own offensive power is at least
/// <c>target defence × AttackMargin</c> — see <see cref="AiPlanner"/>'s raid
/// step.
/// </param>
/// <param name="DefaultObjectives">The objective list a freshly taken-over AI of this personality starts with.</param>
/// <param name="BuildingBias">
/// Optional per-building-type multiplier on <see cref="AiPlanner"/>'s build
/// score, on top of the role weights above — a per-personality escape hatch
/// for a specific building without adding a new role. A type missing from
/// this dictionary (including an empty/<see langword="null"/> dictionary, the
/// default) gets 1.0 — no change. 0 means the planner never proposes that
/// type at all, regardless of how well it would otherwise score; anything
/// above 1 promotes it. Wired from <c>AiPlayersOptions.BuildingBias</c> — see
/// <c>docs/design/ai-players.md</c>'s Configuration table.
/// </param>
public sealed record AiProfile(
    double Economy,
    double Storage,
    double Military,
    double Defense,
    double Territory,
    double Faith,
    double Longhouse,
    int GarrisonPerLonghouseLevel,
    IReadOnlyList<UnitType> PreferredUnits,
    double? AttackMargin,
    IReadOnlyList<AiObjective> DefaultObjectives,
    IReadOnlyDictionary<BuildingType, double>? BuildingBias = null);

/// <summary>The catalogue of built-in personality profiles — the numbers behind the design doc's table.</summary>
public static class AiProfiles
{
    /// <summary>Never attacks; low garrison; leans on producers, storage, shrines and the longhouse.</summary>
    private static readonly AiProfile EconomicProfile = new(
        Economy: 3.0,
        Storage: 2.0,
        Military: 0.0,
        Defense: 0.2,
        Territory: 0.5,
        Faith: 1.5,
        Longhouse: 2.0,
        GarrisonPerLonghouseLevel: 1,
        PreferredUnits: [UnitType.Spearman, UnitType.Thrall],
        AttackMargin: null,
        DefaultObjectives: [new AiObjective { Kind = AiObjectiveKind.ReachLonghouseLevel, Target = 10 }]);

    /// <summary>An even split across roles; medium garrison; attacks rarely, only with a clear (2x) edge.</summary>
    private static readonly AiProfile BalancedProfile = new(
        Economy: 1.0,
        Storage: 1.0,
        Military: 1.0,
        Defense: 1.0,
        Territory: 1.0,
        Faith: 1.0,
        Longhouse: 1.0,
        GarrisonPerLonghouseLevel: 3,
        PreferredUnits: [UnitType.Spearman, UnitType.Bowman, UnitType.Axeman],
        AttackMargin: 2.0,
        DefaultObjectives: [new AiObjective { Kind = AiObjectiveKind.ReachLonghouseLevel, Target = 10 }]);

    /// <summary>Leans on towers, spearmen/bowmen and storage; high garrison; never attacks.</summary>
    private static readonly AiProfile DefensiveProfile = new(
        Economy: 1.0,
        Storage: 1.5,
        Military: 0.5,
        Defense: 3.0,
        Territory: 2.0,
        Faith: 0.5,
        Longhouse: 1.0,
        GarrisonPerLonghouseLevel: 6,
        PreferredUnits: [UnitType.Spearman, UnitType.Bowman],
        AttackMargin: null,
        DefaultObjectives: [new AiObjective { Kind = AiObjectiveKind.GarrisonStrength, Target = 50 }]);

    /// <summary>Leans on barracks, iron and axemen/berserkers; medium garrison with a large field army on top; raids when stronger.</summary>
    private static readonly AiProfile AggressiveProfile = new(
        Economy: 1.0,
        Storage: 0.5,
        Military: 3.0,
        Defense: 0.5,
        Territory: 0.5,
        Faith: 0.5,
        Longhouse: 1.0,
        GarrisonPerLonghouseLevel: 5,
        PreferredUnits: [UnitType.Axeman, UnitType.Berserker],
        AttackMargin: 1.3,
        DefaultObjectives: [new AiObjective { Kind = AiObjectiveKind.GarrisonStrength, Target = 30 }]);

    /// <summary>The profile a given personality plans from.</summary>
    public static AiProfile For(AiPersonality personality) => personality switch
    {
        AiPersonality.Economic => EconomicProfile,
        AiPersonality.Balanced => BalancedProfile,
        AiPersonality.Defensive => DefensiveProfile,
        AiPersonality.Aggressive => AggressiveProfile,
        _ => throw new ArgumentOutOfRangeException(nameof(personality), personality, "Unknown AI personality"),
    };
}
