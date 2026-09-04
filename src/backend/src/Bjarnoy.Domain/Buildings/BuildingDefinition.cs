using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// What one building at one level costs, takes, and gives.
/// </summary>
/// <remarks>
/// <para>
/// <see cref="AllowedTerrain"/> is the replacement for the legacy
/// <c>BuildTechnology.AllowedTiles</c>. That held a <c>List&lt;Tile&gt;</c> of
/// throwaway instances — <c>new ForestTile()</c> with no position and no owner —
/// purely so <c>BuildHelper</c> could compare <c>.type</c>, a string derived
/// from the class name by reflection. The rule it encoded is worth keeping;
/// expressing it as a class per terrain was not. Here it is a set of
/// <see cref="Terrain"/> values, checked by value.
/// </para>
/// <para>
/// This is data, not code. The legacy tech tree was one C# class per building
/// (<c>BuildingLumberjackInitializer</c> and friends), so adding a building
/// meant a new type and rebalancing meant a deploy.
/// </para>
/// </remarks>
public sealed record BuildingDefinition
{
    public required BuildingType Type { get; init; }

    /// <summary>The level this definition produces, counting from 1.</summary>
    public required int Level { get; init; }

    public required ResourceAmounts Cost { get; init; }

    public required TimeSpan BuildDuration { get; init; }

    /// <summary>Added to the settlement's hourly production when this level completes.</summary>
    public ResourceAmounts ProductionPerHour { get; init; } = ResourceAmounts.Zero;

    /// <summary>Added to the settlement's storage ceiling when this level completes.</summary>
    public ResourceAmounts StorageCapacity { get; init; } = ResourceAmounts.Zero;

    /// <summary>
    /// Terrain this building may stand on. Empty means anywhere buildable —
    /// which is any land hex; nothing is built on open sea. Meaningless (and
    /// unused — see <see cref="RequiresCoastalWater"/>) for a building that
    /// stands on water instead of land.
    /// </summary>
    public IReadOnlySet<Terrain> AllowedTerrain { get; init; } = new HashSet<Terrain>();

    /// <summary>
    /// Placed on shallow (coastal) water rather than land — a sea hex with at
    /// least one land neighbour (<see cref="World.TerrainSampler.IsCoastalWater"/>).
    /// A settlement's <see cref="Buildings.Settlement.PlanBuild"/> checks this
    /// instead of <see cref="AllowsTerrain"/> for such a building; the terrain
    /// under it stays plain <see cref="Terrain.Sea"/>, so it is a separate rail
    /// rather than another <see cref="AllowedTerrain"/> entry.
    /// </summary>
    public bool RequiresCoastalWater { get; init; }

    /// <summary>
    /// This building's own hex must have at least one water (sea) neighbour —
    /// unlike <see cref="RequiresCoastalWater"/>, the building itself still
    /// stands on land and is still gated by <see cref="AllowedTerrain"/>; this
    /// is an additional, separate check. The Fisher Hut's rule: any Grass hex
    /// qualifies terrain-wise, but only a coastal one is buildable.
    /// </summary>
    public bool RequiresAdjacentToWater { get; init; }

    /// <summary>
    /// This building's own hex must have at least one river-tile neighbour,
    /// of any <see cref="World.RiverTileShape"/> — same shape as
    /// <see cref="RequiresAdjacentToWater"/>, but for rivers instead of the
    /// sea. The Sawmill's rule: any Grass hex qualifies terrain-wise, but
    /// only one next to a river is buildable.
    /// </summary>
    public bool RequiresAdjacentRiver { get; init; }

    /// <summary>
    /// Longhouse level required before this may be built, so the anchor gates
    /// the settlement's growth (MECHANICS.md §2).
    /// </summary>
    public int RequiredLonghouseLevel { get; init; } = 1;

    /// <summary>
    /// Another of this settlement's own buildings that must stand at
    /// <see cref="RequiredBuildingLevel"/> or higher before this one may be
    /// built — a cross-building prerequisite alongside (not instead of)
    /// <see cref="RequiredLonghouseLevel"/>. <see langword="null"/> (the
    /// default) means no such prerequisite. Mirrors
    /// <see cref="Units.UnitDefinition.RequiredUnitType"/>'s shape for units.
    /// </summary>
    public BuildingType? RequiredBuildingType { get; init; }

    /// <summary>The level <see cref="RequiredBuildingType"/> must reach. Meaningless when that is <see langword="null"/>.</summary>
    public int RequiredBuildingLevel { get; init; } = 1;

    /// <summary>
    /// How many construction slots one order for this building occupies while
    /// it is actively building (issue #158). Ignored when
    /// <see cref="OccupiesAllSlots"/> is set.
    /// </summary>
    public int SlotCost { get; init; } = 1;

    /// <summary>
    /// When set, a building order for this level always occupies every slot
    /// the settlement currently has (<see cref="Settlement.ConstructionSlots"/>),
    /// rather than <see cref="SlotCost"/> — the Longhouse's rule: an upgrade
    /// can only start with every slot free, and blocks everything else queued
    /// behind it while it runs.
    /// </summary>
    public bool OccupiesAllSlots { get; init; }

    /// <summary>Whether this building may stand on <paramref name="terrain"/>.</summary>
    public bool AllowsTerrain(Terrain terrain)
    {
        if (!terrain.IsLand())
        {
            return false;
        }

        return AllowedTerrain.Count == 0 || AllowedTerrain.Contains(terrain);
    }
}
