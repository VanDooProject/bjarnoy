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
    /// Alongside <see cref="AllowedTerrain"/>: this building may also stand on a coastal-water hex (a sea hex with a land neighbour),
    /// the terrain under it staying plain <see cref="Terrain.Sea"/>. The Palisade's sea end; any further rule for that hex
    /// (it must touch exactly one wall, it is never a gate) is <see cref="Palisades.PalisadeRules"/>'s.
    /// </summary>
    public bool AlsoOnCoastalWater { get; init; }

    /// <summary>
    /// This building's own hex must be a bog tile (<see cref="World.BogTile"/>) of one of these kinds — <see langword="null"/>
    /// (the default) means no such requirement. Bog-ore works and Clay Brickworks stand on plain moss
    /// (<see cref="World.BogTileKind.Bog"/>: not a shore, mouth, creek or lake), the Hammerschmiede on a creek
    /// (<see cref="World.BogTileKind.Creek"/>). A hex whose bog kind the caller could not tell (<see langword="null"/>) is refused.
    /// </summary>
    public IReadOnlySet<World.BogTileKind>? RequiresBogKind { get; init; }

    /// <summary>
    /// Alongside <see cref="RequiresCoastalWater"/>: bog tile kinds this building may stand on instead of coastal water. The
    /// Fishing Hut stands on a lake's half shore (<see cref="World.BogTileKind.Half"/>, three water edges) with its lake art.
    /// <see langword="null"/> (the default) means coastal water only.
    /// </summary>
    public IReadOnlySet<World.BogTileKind>? LakeShoreKinds { get; init; }

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
    /// Alongside <see cref="RequiresRiverShape"/>: a river-art variant
    /// (<see cref="World.RiverVariant"/>) this building's hex must NOT be
    /// showing, even though its shape otherwise qualifies — <see
    /// langword="null"/> (the default) excludes nothing. The Sawmill's
    /// rule: its Bend60 composite reads from the bank of the plain hairpin
    /// channel, and has no matching art for the <see
    /// cref="World.RiverVariant.Loop"/> variant's full-half-circle loop, so
    /// that one variant is refused even though <see
    /// cref="RiverTileShape.Bend60"/> itself is in <see
    /// cref="RequiresRiverShape"/>. Checked in <see
    /// cref="Settlement.PlanBuild"/> only once the shape itself has already
    /// matched.
    /// </summary>
    public IReadOnlySet<RiverVariant>? ExcludedRiverVariants { get; init; }

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
    /// (<c>max(unlock level, level)</c>) governs the rest of its ladder. This is data, not a rule in
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

    /// <summary>
    /// Whether this building may stand on one hex, from everything that can decide it: the terrain, whether it is coastal water,
    /// and the bog kind of the hex (<see langword="null"/> when it is not a bog tile, or the caller cannot say). River shape
    /// rules are separate (<see cref="RequiresRiverShape"/>).
    /// </summary>
    public bool AllowsHex(Terrain terrain, bool isCoastalWater, World.BogTileKind? bogKind)
    {
        bool terrainOk;
        if (RequiresCoastalWater)
        {
            terrainOk = isCoastalWater
                || (terrain == Terrain.Bog && bogKind is { } shore && LakeShoreKinds?.Contains(shore) == true);
        }
        else
        {
            terrainOk = AllowsTerrain(terrain) || (AlsoOnCoastalWater && isCoastalWater && terrain == Terrain.Sea);
        }

        if (terrainOk && RequiresBogKind is { } kinds)
        {
            terrainOk = terrain == Terrain.Bog && bogKind is { } kind && kinds.Contains(kind);
        }

        return terrainOk;
    }

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
