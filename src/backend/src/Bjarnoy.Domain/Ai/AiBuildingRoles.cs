using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Trade;
using Bjarnoy.Domain.Units;

namespace Bjarnoy.Domain.Ai;

/// <summary>
/// What one <see cref="BuildingType"/> is <em>for</em>, derived purely from
/// catalogue data (<see cref="BuildingCatalogue"/>, <see cref="UnitCatalogue"/>)
/// rather than hand-listed here — see <c>docs/design/ai-players.md</c>'s
/// "Building roles" section. A building added to, removed from, or changed in
/// the tech tree is picked up automatically; nothing in <see cref="AiPlanner"/>
/// lists a <see cref="BuildingType"/> by name any more except the one
/// structural exception, <see cref="BuildingType.Longhouse"/> (see
/// <see cref="AiBuildingRole.Anchor"/>).
/// </summary>
[Flags]
public enum AiBuildingRole
{
    None = 0,

    /// <summary>Produces at least one <see cref="TradeResource"/> — see <see cref="AiBuildingRoles.ProducedResources"/>.</summary>
    Producer = 1 << 0,

    /// <summary>Adds storage capacity at level 1.</summary>
    Storage = 1 << 1,

    /// <summary>Extends the settlement's claimed territory (a non-zero <see cref="BuildingDefinition.ClaimRadius"/>).</summary>
    Territory = 1 << 2,

    /// <summary>Grants a combat defense bonus — today this coincides exactly with <see cref="Territory"/>, see the remarks on <see cref="AiBuildingRoles"/>.</summary>
    Defense = 1 << 3,

    /// <summary>Trains at least one <see cref="Units.UnitType"/> — see <see cref="Units.UnitDefinition.RequiredBuildingType"/>.</summary>
    Military = 1 << 4,

    /// <summary>Raised to a god — see <see cref="BuildingCatalogue.GodOf"/>.</summary>
    Faith = 1 << 5,

    /// <summary>The settlement's own structural anchor — <see cref="BuildingType.Longhouse"/> alone.</summary>
    Anchor = 1 << 6,
}

/// <summary>
/// Derives <see cref="AiBuildingRole"/> and produced-resource data for every
/// <see cref="BuildingType"/> from <see cref="BuildingCatalogue"/> and
/// <see cref="UnitCatalogue"/>, cached once per type since the catalogues
/// themselves never change at runtime.
/// </summary>
/// <remarks>
/// <para>
/// <b>Defense</b> is derived from <see cref="BuildingCatalogue.ClaimRadius"/>
/// wearing a hat borrowed from combat: the only place a claim-granting
/// building's level currently feeds a defense bonus is
/// <see cref="BuildingCatalogue.TowerDefenseBonusPercent"/>, which
/// (via <c>Army.RunBattleAsync</c>/<c>FieldBattleResolver.ClaimAt</c>) is
/// always looked up by finding the standing <see cref="BuildingType.Tower"/>,
/// never by a general "does this building type defend" table. So for now,
/// "grants a claim disc" (<see cref="AiBuildingRole.Territory"/>) and "grants
/// a defense bonus" (<see cref="AiBuildingRole.Defense"/>) are the same
/// predicate. If a future claim-granting building has no defense bonus (or a
/// defense-only building with no claim), this becomes two separate
/// catalogue-driven checks instead of one.
/// </para>
/// <para>
/// <b>Faith</b> only marks a building as shrine-like; it does not (yet) fold
/// a shrine's specific <see cref="Shrines.ShrineCatalogue.Favour"/> back into
/// which resource it indirectly boosts (e.g. <see cref="Shrines.GodType.Freyja"/>
/// boosting Food) for objective/scarcity matching — that would need
/// <see cref="AiPlanner"/>'s scarcity and <c>ProductionRate</c> objective
/// logic to reason about percentage multipliers rather than flat producer
/// output, which is more than this pass takes on. Skipped, not forgotten.
/// </para>
/// </remarks>
public static class AiBuildingRoles
{
    private static readonly IReadOnlySet<TradeResource> NoResources = new HashSet<TradeResource>();

    private sealed record RoleInfo(AiBuildingRole Roles, IReadOnlySet<TradeResource> ProducedResources);

    private static readonly Lazy<IReadOnlyDictionary<BuildingType, RoleInfo>> Cache = new(BuildRoleTable);

    private static readonly Lazy<IReadOnlySet<TradeResource>> MilitaryFeedingResourcesCache =
        new(BuildMilitaryFeedingResources);

    /// <summary>The role(s) a building type serves — see the type-level remarks for how each flag is derived.</summary>
    public static AiBuildingRole RolesOf(BuildingType type) => Cache.Value[type].Roles;

    /// <summary>
    /// Which resources <paramref name="type"/> produces, from
    /// <see cref="BuildingDefinition.ProductionPerHour"/> — empty for a
    /// non-producer. Checked at levels 1-3 rather than level 1 alone, so a
    /// hypothetical producer whose first tier or two produces nothing (e.g. an
    /// unlock-gated ramp) is still classified correctly.
    /// </summary>
    public static IReadOnlySet<TradeResource> ProducedResources(BuildingType type) => Cache.Value[type].ProducedResources;

    /// <summary>
    /// Resources that (per the current catalogue) exist essentially to feed
    /// the military: at least one unit's <see cref="Units.UnitDefinition.TrainingCost"/>
    /// needs it, and every building that spends it in its own
    /// <see cref="BuildingDefinition.Cost"/> is itself <see cref="AiBuildingRole.Military"/>
    /// or <see cref="AiBuildingRole.Defense"/>. Today this is exactly
    /// { Iron } — Wood/Stone are spent by nearly every building and Food by
    /// the Longhouse/shrines, so neither qualifies, while Iron is only ever
    /// spent building Tower/Barracks/ArcheryRange/Dockyard — but nothing here
    /// names Iron or <see cref="BuildingType.MagicTower"/> directly; a future
    /// building/unit changing that shape changes this set automatically.
    /// </summary>
    public static IReadOnlySet<TradeResource> MilitaryFeedingResources => MilitaryFeedingResourcesCache.Value;

    private static IReadOnlyDictionary<BuildingType, RoleInfo> BuildRoleTable()
    {
        var result = new Dictionary<BuildingType, RoleInfo>();
        foreach (var type in BuildingCatalogue.AllTypes)
        {
            result[type] = Classify(type);
        }

        return result;
    }

    private static RoleInfo Classify(BuildingType type)
    {
        // The one allowed hardcode (per the design doc): the Longhouse is the
        // settlement's structural anchor, the same way Settlement.PlanBuild
        // itself singles it out (LonghousePlacementNotAllowed). It happens to
        // also carry non-zero ProductionPerHour/StorageCapacity/ClaimRadius in
        // the catalogue, but none of that is what makes it the anchor, so it
        // is classified before any of the data-driven checks below run.
        if (type == BuildingType.Longhouse)
        {
            return new RoleInfo(AiBuildingRole.Anchor, NoResources);
        }

        var produced = ProducedResourcesFromCatalogue(type);
        var roles = AiBuildingRole.None;

        if (produced.Count > 0)
        {
            roles |= AiBuildingRole.Producer;
        }

        var definition = BuildingCatalogue.TryGet(type, 1);
        if (definition is not null)
        {
            if (HasAny(definition.StorageCapacity))
            {
                roles |= AiBuildingRole.Storage;
            }

            if (definition.ClaimRadius > 0)
            {
                // See the type-level remarks: Territory and Defense coincide
                // today because TowerDefenseBonusPercent is the only combat
                // bonus keyed off a claim-granting building's level.
                roles |= AiBuildingRole.Territory | AiBuildingRole.Defense;
            }
        }

        if (UnitCatalogue.AllTypes.Any(unit => UnitCatalogue.Get(unit).RequiredBuildingType == type))
        {
            roles |= AiBuildingRole.Military;
        }

        if (BuildingCatalogue.GodOf(type) is not null)
        {
            roles |= AiBuildingRole.Faith;
        }

        return new RoleInfo(roles, produced);
    }

    private static IReadOnlySet<TradeResource> ProducedResourcesFromCatalogue(BuildingType type)
    {
        for (var level = 1; level <= 3 && level <= BuildingCatalogue.MaxLevel; level++)
        {
            var definition = BuildingCatalogue.TryGet(type, level);
            if (definition is null)
            {
                continue;
            }

            var resources = NonZeroResources(definition.ProductionPerHour);
            if (resources.Count > 0)
            {
                return resources;
            }
        }

        return NoResources;
    }

    private static IReadOnlySet<TradeResource> NonZeroResources(ResourceAmounts amounts)
    {
        HashSet<TradeResource>? set = null;
        foreach (var resource in Enum.GetValues<TradeResource>())
        {
            if (amounts.Amount(resource) > 0)
            {
                (set ??= []).Add(resource);
            }
        }

        return (IReadOnlySet<TradeResource>?)set ?? NoResources;
    }

    private static bool HasAny(ResourceAmounts amounts) =>
        amounts.Wood > 0 || amounts.Stone > 0 || amounts.Food > 0 || amounts.Iron > 0;

    private static IReadOnlySet<TradeResource> BuildMilitaryFeedingResources()
    {
        var result = new HashSet<TradeResource>();

        foreach (var resource in Enum.GetValues<TradeResource>())
        {
            var neededByAnyUnit = UnitCatalogue.AllTypes
                .Any(unit => UnitCatalogue.Get(unit).TrainingCost.Amount(resource) > 0);
            if (!neededByAnyUnit)
            {
                continue;
            }

            var spentOutsideMilitaryOrDefense = BuildingCatalogue.AllTypes.Any(type =>
            {
                var definition = BuildingCatalogue.TryGet(type, 1);
                if (definition is null || definition.Cost.Amount(resource) <= 0)
                {
                    return false;
                }

                var roles = RolesOf(type);
                return (roles & (AiBuildingRole.Military | AiBuildingRole.Defense)) == AiBuildingRole.None;
            });

            if (!spentOutsideMilitaryOrDefense)
            {
                result.Add(resource);
            }
        }

        return result;
    }
}
