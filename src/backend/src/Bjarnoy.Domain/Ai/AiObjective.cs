using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Trade;

namespace Bjarnoy.Domain.Ai;

/// <summary>
/// The shape an <see cref="AiObjective"/> can take — see
/// <c>docs/design/ai-players.md</c>'s "Objectives" section.
/// </summary>
public enum AiObjectiveKind
{
    /// <summary>Reach a given longhouse level.</summary>
    ReachLonghouseLevel,

    /// <summary>Reach a given level of the highest building of <see cref="AiObjective.Building"/>.</summary>
    ReachBuildingLevel,

    /// <summary>Reach a given net hourly production rate of <see cref="AiObjective.Resource"/>.</summary>
    ProductionRate,

    /// <summary>Reach a given total unit count standing in the garrison.</summary>
    GarrisonStrength,
}

/// <summary>
/// One entry in an AI player's ordered objective list. Every AI has a
/// personality-default list (<see cref="AiProfile.DefaultObjectives"/>);
/// admins can replace it through the admin API. An open (unmet) objective
/// raises the planner's priority for the actions that serve it — see
/// <see cref="AiPlanner"/> — so, for example, an Economic AI told to reach
/// <see cref="AiObjectiveKind.GarrisonStrength"/> 40 still trains troops.
/// </summary>
/// <remarks>
/// Plain init properties and enum-typed fields only, no custom converters —
/// this must round-trip through <c>System.Text.Json</c> unchanged, since the
/// persistence layer (step 3) stores an AI player's objective list as a JSON
/// column rather than a normalised table.
/// </remarks>
public sealed record AiObjective
{
    public required AiObjectiveKind Kind { get; init; }

    /// <summary>The building type this objective tracks. Only meaningful for <see cref="AiObjectiveKind.ReachBuildingLevel"/>.</summary>
    public BuildingType? Building { get; init; }

    /// <summary>The resource this objective tracks. Only meaningful for <see cref="AiObjectiveKind.ProductionRate"/>.</summary>
    public TradeResource? Resource { get; init; }

    /// <summary>
    /// The level, per-hour rate, or unit count to reach — which one depends
    /// on <see cref="Kind"/>. Always a plain number so the type stays simple
    /// enough to serialise without a custom converter; a count is stored as a
    /// whole number in this <see langword="double"/> rather than as its own
    /// <see langword="int"/> field.
    /// </summary>
    public required double Target { get; init; }

    /// <summary>Whether <paramref name="settlement"/> currently satisfies this objective.</summary>
    public bool IsMet(Buildings.Settlement settlement)
    {
        ArgumentNullException.ThrowIfNull(settlement);

        return Kind switch
        {
            AiObjectiveKind.ReachLonghouseLevel => settlement.LonghouseLevel >= Target,
            AiObjectiveKind.ReachBuildingLevel => Building is { } building
                && settlement.Buildings.Where(b => b.Type == building).Select(b => b.Level).DefaultIfEmpty(0).Max() >= Target,
            AiObjectiveKind.ProductionRate => Resource is { } resource
                && settlement.CurrentTotals().ProductionPerHour.Amount(resource) >= Target,
            AiObjectiveKind.GarrisonStrength => settlement.Garrison.Sum(s => s.Count) >= Target,
            _ => throw new ArgumentOutOfRangeException(nameof(Kind), Kind, "Unknown AI objective kind"),
        };
    }
}
