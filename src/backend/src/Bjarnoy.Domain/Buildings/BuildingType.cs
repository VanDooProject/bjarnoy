namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// The anchor and terrain-bound producers are the four-resource economy from
/// <c>prototypes/MECHANICS.md</c> §7; <see cref="Lumberjack"/>,
/// <see cref="Tower"/> and <see cref="StorageHouse"/> take their names from
/// the buildings <c>legacy/browsergame</c> actually implemented
/// (<c>Models/Buildings/Lumberjack.cs</c>, <c>Tower.cs</c>,
/// <c>StorageHouse.cs</c>) rather than the design-zip mockups' names for the
/// same roles (lumber camp / watchtower / warehouse).
/// </summary>
/// <remarks>
/// Serialised to the client by name, lowercased, matching the frontend's
/// <c>buildingType</c> union in <c>src/frontend/src/lib/map/types.ts</c>.
/// </remarks>
public enum BuildingType
{
    /// <summary>The anchor. Its level sets claim radius, build slots and settlement cap.</summary>
    Longhouse = 0,

    /// <summary>Wood, on forest.</summary>
    Lumberjack = 1,

    /// <summary>Stone, on a ridge.</summary>
    Quarry = 2,

    /// <summary>Food, on grass.</summary>
    Farm = 3,

    /// <summary>Storage capacity. Placed on grass.</summary>
    StorageHouse = 4,

    /// <summary>Extends the claimed border. Placed on grass.</summary>
    Tower = 5,

    /// <summary>Food, from shallow (coastal) water rather than land.</summary>
    FishingHut = 6,

    /// <summary>
    /// <b>Obsolete — removed from the game</b> (<c>docs/design/economy.md</c>
    /// section 2). The value stays in the enum only because persisted rows
    /// store the integer and the ones after it must not shift; it has no
    /// definition in <see cref="BuildingCatalogue"/> (<c>TryGet</c> returns
    /// <see langword="null"/>), is not in <see cref="BuildingCatalogue.AllTypes"/>,
    /// cannot be built, and a stored MagicTower is dropped when its settlement
    /// is loaded.
    /// </summary>
    MagicTower = 7,

    /// <summary>Food, on grass. A second farm variant (issue #24).</summary>
    PumpkinFarm = 8,

    /// <summary>
    /// Raised to Thor. Its favour, plus any slotted runes, boosts Wood and
    /// Stone production (issue #53).
    /// </summary>
    ShrineOfThor = 9,

    /// <summary>
    /// Raised to Freyja. Its favour, plus any slotted runes, boosts Food
    /// production (issue #53).
    /// </summary>
    ShrineOfFreyja = 10,

    /// <summary>
    /// A late-game storage tier on grass, gated behind both a level-10
    /// Longhouse and a level-10 <see cref="StorageHouse"/> of its own — see
    /// <see cref="BuildingDefinition.Prerequisites"/>.
    /// </summary>
    GreatStorehouse = 11,

    /// <summary>
    /// Trains the archer/siege slice of the land roster (Bowman, Catapult)
    /// in place of the Longhouse. No production/storage of its own, and no
    /// combat bonus (deferred) — unlike <see cref="Tower"/>. See
    /// <see cref="Barracks"/> for the basic-melee half of the split.
    /// </summary>
    ArcheryRange = 12,

    /// <summary>
    /// Trains ships in place of the Longhouse. Placed on shallow (coastal)
    /// water, like <see cref="FishingHut"/>.
    /// </summary>
    Dockyard = 13,

    /// <summary>
    /// Trains the basic melee slice of the land roster (Spearman, Axeman,
    /// Berserker) in place of the Longhouse — <see cref="ArcheryRange"/>
    /// keeps the archer/siege units (Bowman, Catapult). A garrison building
    /// on land otherwise: no production/storage of its own, and no combat
    /// bonus (deferred: a garrison capacity, once one exists to hang it off).
    /// </summary>
    Barracks = 14,

    /// <summary>
    /// <b>Obsolete — merged into <see cref="FishingHut"/></b>
    /// (<c>docs/design/economy.md</c>). The value stays in the enum only
    /// because persisted rows store the integer; it has no definition in
    /// <see cref="BuildingCatalogue"/>, is not in
    /// <see cref="BuildingCatalogue.AllTypes"/>, cannot be built, and a stored
    /// FisherHut (or queued order for one) becomes a FishingHut at the same
    /// hex and level when its settlement is loaded.
    /// </summary>
    FisherHut = 15,

    /// <summary>
    /// Wood, on grass — refines what a <see cref="Lumberjack"/> cuts, so it
    /// shares that building's Forest-neighbour boost (see
    /// <see cref="BuildingCatalogue.Boosts"/>). Its hex must be adjacent to a
    /// river of any shape (see
    /// <see cref="BuildingDefinition.RequiresAdjacentRiver"/>). Ships with
    /// art keyed off which river shape the adjacency comes from
    /// (flat/riverside/river-bend) — cosmetic only on the frontend, not
    /// modelled here.
    /// </summary>
    Sawmill = 16,

    /// <summary>
    /// Raised to Ullr. Its favour, plus any slotted runes, boosts Wood
    /// production — the wood/hunting line's own capstone, alongside
    /// <see cref="ShrineOfThor"/> and <see cref="ShrineOfFreyja"/>.
    /// </summary>
    ShrineOfUllr = 17,

    /// <summary>
    /// Raised to Njörd. Its favour, plus any slotted runes, boosts storage
    /// capacity rather than any resource's production — sea-trade wealth
    /// rather than a harvest — so it never overlaps with
    /// <see cref="ShrineOfThor"/> or <see cref="ShrineOfFreyja"/>. The
    /// water line's own capstone, alongside <see cref="Dockyard"/>.
    /// </summary>
    ShrineOfNjord = 18,

    /// <summary>
    /// Food, on grass, behind a level-5 <see cref="Farm"/> — a third grass
    /// food producer alongside <see cref="Farm"/>/<see cref="PumpkinFarm"/>,
    /// not a converter (the domain has no input-consumption mechanic).
    /// </summary>
    Meadery = 19,

    /// <summary>
    /// No production or storage of its own yet — a civic building that will
    /// later become a prerequisite or grant a boost (a settler-cap increase
    /// is the leading idea). Placed on grass.
    /// </summary>
    TownSquare = 20,

    /// <summary>
    /// Food, on grass — refines what a maxed <see cref="Farm"/> grows, the
    /// same shape as <see cref="Sawmill"/> refining a maxed
    /// <see cref="Lumberjack"/>. Its own hex must be a Straight river tile
    /// (see <see cref="BuildingDefinition.RequiresRiverShape"/>) — its
    /// waterwheel stands in the stream.
    /// </summary>
    CropMill = 21,

    /// <summary>
    /// The Weaponsmith (display name; the type keeps its persisted name).
    /// Produces nothing — a troop-upgrade building only — and is the military
    /// line's capstone behind a level-10 <see cref="Barracks"/>, feeding the
    /// <see cref="ShrineOfThor"/>.
    /// </summary>
    Smithy = 22,

    /// <summary>
    /// No production or storage of its own yet — its ring of runestones is
    /// meant for a future favour/rune mechanic. Placed on grass, behind a
    /// standing <see cref="TownSquare"/>.
    /// </summary>
    DruidHut = 23,

    /// <summary>
    /// Trains the civilian Provisioner/SettlerCrew half of the roster in
    /// place of the Longhouse (see
    /// <see cref="Units.UnitDefinition.RequiredBuildingType"/>), plus a
    /// modest storage bonus. Behind a level-3 <see cref="StorageHouse"/> and
    /// a standing <see cref="TownSquare"/>. Placed on grass.
    /// </summary>
    CartWorkshop = 24,

    /// <summary>
    /// Stone, on plain bog — the start's stone source (<see cref="World.WorldGenerator"/> guarantees bog in reach of a
    /// landing spot, not a Mountain hex), an alternative to <see cref="Quarry"/> at a lower rate.
    /// </summary>
    ClayBrickworks = 25,

    /// <summary>
    /// Iron, on plain bog moss (<see cref="World.BogTileKind.Bog"/>: not a shore, mouth, creek or lake) — the game's iron
    /// producer (<c>docs/design/economy.md</c> section 8, <c>docs/design/bog.md</c>). Boosted by the bog, creek and
    /// lake hexes around it and, later, by the <see cref="Hammerschmiede"/>. Unlocks at Longhouse level 6 with no feeder.
    /// </summary>
    BogOreWorks = 26,

    /// <summary>
    /// A water-powered hammer mill on a bog creek (<see cref="World.BogTileKind.Creek"/>, straight or bend; never a mouth,
    /// spring or lake). Produces nothing of its own: it raises every <see cref="BogOreWorks"/> within its range, the way the
    /// <see cref="Sawmill"/> raises Lumberjacks. Unlocks at Longhouse level 20 behind a level-10 bog-ore works.
    /// </summary>
    Hammerschmiede = 27,

    /// <summary>
    /// Food, on grass — the starting food building, unlocked at Longhouse 1.
    /// <see cref="Farm"/> and <see cref="PumpkinFarm"/> now come later (LH 4,
    /// behind a level-3 Reindeer Herder). Appended at the end so persisted
    /// integers do not shift.
    /// </summary>
    ReindeerHerder = 28,

    /// <summary>
    /// Raised to Odin (<see cref="Shrines.GodType.Odin"/>), on grass, at
    /// Longhouse 25 behind a level-10 <see cref="DruidHut"/>. Counts as a shrine:
    /// a settlement holds only one shrine in total. Its favour is not a
    /// production or attack bonus but two effects on its own settlement —
    /// Wisdom (shorter builds) and Ravens (wider vision). Appended at the end so
    /// persisted integers do not shift.
    /// </summary>
    OdinStatue = 29,

    /// <summary>
    /// One hex of the settlement's wall (<c>docs/design/economy.md</c> section 5): on grass, forest or sand inside the claim, or on a
    /// coastal-water hex as the wall's sea end. Unlocks at Longhouse 7 behind a level-5 <see cref="Tower"/>, three levels. Which piece
    /// it draws as (straight, bend, end) follows its wall neighbours (<see cref="Palisades.PalisadeRules"/>). Every palisade hex
    /// blocks land armies, the owner's included; a land end (one wall neighbour) is half open. Appended at the end so persisted
    /// integers do not shift.
    /// </summary>
    Palisade = 30,

    /// <summary>
    /// A palisade hex with a gate: only on a hex that resolves to a straight, passable for the wall owner's armies only. Shares the
    /// Palisade's unlock, prerequisite, costs and levels (one tech-tree card). Appended at the end so persisted integers do not shift.
    /// </summary>
    PalisadeGate = 31,
}

public static class BuildingTypeExtensions
{
    public static string ToWireName(this BuildingType type) => type switch
    {
        BuildingType.Longhouse => "longhouse",
        BuildingType.Lumberjack => "lumberjack",
        BuildingType.Quarry => "quarry",
        BuildingType.Farm => "farm",
        BuildingType.StorageHouse => "storagehouse",
        BuildingType.Tower => "tower",
        BuildingType.FishingHut => "fishinghut",
        BuildingType.MagicTower => "magictower",
        BuildingType.PumpkinFarm => "pumpkinfarm",
        BuildingType.ShrineOfThor => "shrineofthor",
        BuildingType.ShrineOfFreyja => "shrineoffreyja",
        BuildingType.GreatStorehouse => "greatstorehouse",
        BuildingType.ArcheryRange => "archeryrange",
        BuildingType.Dockyard => "dockyard",
        BuildingType.Barracks => "barracks",
        BuildingType.FisherHut => "fisherhut",
        BuildingType.Sawmill => "sawmill",
        BuildingType.ShrineOfUllr => "shrineofullr",
        BuildingType.ShrineOfNjord => "shrineofnjord",
        BuildingType.Meadery => "meadery",
        BuildingType.TownSquare => "townsquare",
        BuildingType.CropMill => "cropmill",
        BuildingType.Smithy => "smithy",
        BuildingType.DruidHut => "druidhut",
        BuildingType.CartWorkshop => "cartworkshop",
        BuildingType.ClayBrickworks => "claybrickworks",
        BuildingType.BogOreWorks => "bogoreworks",
        BuildingType.Hammerschmiede => "hammerschmiede",
        BuildingType.ReindeerHerder => "reindeerherder",
        BuildingType.OdinStatue => "odinstatue",
        BuildingType.Palisade => "palisade",
        BuildingType.PalisadeGate => "palisadegate",
        _ => throw new ArgumentOutOfRangeException(nameof(type), type, "Unknown building type"),
    };
}
