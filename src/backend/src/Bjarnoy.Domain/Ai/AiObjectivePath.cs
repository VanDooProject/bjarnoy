using Bjarnoy.Domain.Buildings;

namespace Bjarnoy.Domain.Ai;

/// <summary>
/// Walks a building's prerequisite chain (<see cref="BuildingDefinition.Prerequisites"/>,
/// <see cref="BuildingDefinition.RequiredLonghouseLevel"/>) to find which
/// building type(s) an AI actually needs to build <em>right now</em> to make
/// progress toward some deeper, currently-locked target — see
/// <c>docs/design/ai-players.md</c>'s "Building roles" section.
/// </summary>
/// <remarks>
/// A pure function of a <see cref="Settlement"/> snapshot and
/// <see cref="BuildingCatalogue"/>, so it needs no test double beyond an
/// in-memory <see cref="Settlement"/> — same spirit as <see cref="AiPlanner"/>
/// itself. Cycle-safe (a <c>visiting</c> set) and depth-limited, even though
/// the current catalogue has no cycles — a future catalogue edit that
/// accidentally introduced one should degrade to "stop chasing it", not hang
/// or stack-overflow the planner.
/// </remarks>
public static class AiObjectivePath
{
    /// <summary>How many prerequisite hops to follow before giving up on a chain — generous for the current tech tree's depth of at most 3.</summary>
    private const int MaxDepth = 8;

    /// <summary>
    /// The building type(s) worth boosting toward <paramref name="type"/>
    /// eventually going up a level: just <paramref name="type"/> itself when
    /// its very next level is unblocked, or — when the longhouse or a
    /// cross-building prerequisite stands in the way — the unmet
    /// prerequisite(s) instead, recursively, so a deeply-gated objective
    /// (e.g. <c>ReachBuildingLevel(GreatStorehouse, 1)</c>, which needs
    /// <c>StorageHouse 10</c> and <c>Longhouse 10</c>) steers the planner
    /// toward the first rung it can actually build today rather than sitting
    /// idle because the target itself is unbuildable.
    /// </summary>
    public static IReadOnlySet<BuildingType> BoostedTypes(Settlement settlement, BuildingType type)
    {
        ArgumentNullException.ThrowIfNull(settlement);

        var boosted = new HashSet<BuildingType>();
        Collect(settlement, type, boosted, [], 0);
        return boosted;
    }

    private static void Collect(
        Settlement settlement,
        BuildingType type,
        HashSet<BuildingType> boosted,
        HashSet<BuildingType> visiting,
        int depth)
    {
        if (depth > MaxDepth || !visiting.Add(type))
        {
            // Depth limit or a cycle: stop chasing this branch rather than
            // recursing forever.
            return;
        }

        var nextLevel = HighestLevelOf(settlement, type) + 1;
        if (nextLevel > BuildingCatalogue.MaxLevel)
        {
            // Already maxed — nothing left to build toward here, and nothing
            // blocking anything else either.
            return;
        }

        var definition = BuildingCatalogue.TryGet(type, nextLevel);
        if (definition is null)
        {
            return;
        }

        var blocked = false;

        if (settlement.LonghouseLevel < definition.RequiredLonghouseLevel)
        {
            blocked = true;
            boosted.Add(BuildingType.Longhouse);
        }

        foreach (var prerequisite in definition.Prerequisites)
        {
            if (HighestLevelOf(settlement, prerequisite.Type) < prerequisite.Level)
            {
                blocked = true;
                Collect(settlement, prerequisite.Type, boosted, visiting, depth + 1);
            }
        }

        if (!blocked)
        {
            boosted.Add(type);
        }
    }

    /// <summary>Mirrors <see cref="AiObjective.IsMet"/>'s own "highest standing level of that type" reading.</summary>
    private static int HighestLevelOf(Settlement settlement, BuildingType type) =>
        settlement.Buildings.Where(b => b.Type == type).Select(b => b.Level).DefaultIfEmpty(0).Max();
}
