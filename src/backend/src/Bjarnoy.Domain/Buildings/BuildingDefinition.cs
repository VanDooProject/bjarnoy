using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// One cross-building prerequisite: another of the settlement's own buildings
/// that must stand at <paramref name="Level"/> or higher before the building
/// listing it may be placed. See <see cref="BuildingDefinition.Prerequisites"/>
/// for how a list of these is read.
/// </summary>
public readonly record struct BuildingPrerequisite(BuildingType Type, int Level = 1);

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
    /// Radius (in hexes) of the claim disc this building/level contributes,
    /// or 0 for a building that contributes none. For
    /// <see cref="BuildingType.Longhouse"/> this is the settlement's own
    /// centre-disc radius (<see cref="Settlement.ClaimRadius"/>); for
    /// <see cref="BuildingType.Tower"/> it is that tower's own satellite-disc
    /// radius, centred on the tower rather than the settlement (see
    /// <see cref="Settlement.ClaimDiscsFor"/>). Every other building leaves
    /// this at 0 — it does not extend the realm at all.
    /// </summary>
    public int ClaimRadius { get; init; }

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
    /// This building's own hex must itself be a river tile of one of these
    /// shapes — <see langword="null"/> (the default) means no river
    /// requirement at all. The Sawmill's rule: it's built directly on a
    /// river tile (replacing that tile's plain art with a sawmill+river
    /// composite — see <see cref="World.RiverTileShape"/>'s
    /// <c>Straight</c>/<c>Bend</c>), and only those two shapes have matching
    /// art, so a <c>Spring</c>/<c>Confluence</c>/<c>Mouth</c> river hex (or
    /// plain land with no river at all) doesn't qualify. Checked against
    /// whatever river tile (if any) stands on the target hex itself, the
    /// same own-hex shape <see cref="RequiresCoastalWater"/> checks.
    /// </summary>
    public IReadOnlySet<RiverTileShape>? RequiresRiverShape { get; init; }

    /// <summary>
    /// Longhouse level required before this may be built, so the anchor gates
    /// the settlement's growth (MECHANICS.md §2).
    /// </summary>
    public int RequiredLonghouseLevel { get; init; } = 1;

    /// <summary>
    /// Other buildings of this settlement's own that must already stand before
    /// this one may be built — cross-building prerequisites alongside (not
    /// instead of) <see cref="RequiredLonghouseLevel"/>. Empty (the default)
    /// means no such prerequisite. Mirrors
    /// <see cref="Units.UnitDefinition.RequiredUnitType"/>'s shape for units.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>All</b> entries must be satisfied, not any one of them — a building
    /// with two prerequisites needs both. A prerequisite is met when the
    /// settlement's <em>highest-level</em> building of that type stands at
    /// <see cref="BuildingPrerequisite.Level"/> or higher; a level-0
    /// foundation stub does not count, since it is not standing yet.
    /// </para>
    /// <para>
    /// These gate <em>placing</em> a building, not upgrading one: the
    /// catalogue attaches them to a type's level-1 definition only, so once a
    /// building stands its own <see cref="RequiredLonghouseLevel"/> curve
    /// governs the rest of its ladder. <see cref="BuildingType.GreatStorehouse"/>
    /// is the deliberate exception — it carries its prerequisite on every
    /// level, being a flat level-10-only tier. This is data, not a rule in
    /// <see cref="Settlement.PlanBuild"/>: the check simply enforces whatever
    /// the target level's definition lists, so a future "level 5 of X needs Y"
    /// is a catalogue edit rather than a code change.
    /// </para>
    /// </remarks>
    public IReadOnlyList<BuildingPrerequisite> Prerequisites { get; init; } = [];

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
