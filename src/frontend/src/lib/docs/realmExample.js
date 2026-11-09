// The Extending the realm docs page's example map (RealmExample.vue): a small hand-placed island, the longhouse near its middle,
// and three steps that add a tower each. The island is handed to the game's own `HexMapRenderer` as a plain `Tile[]` through a
// `StaticWorldModel`, like the other docs examples.
//
// The realm is not drawn by hand: each step registers a settlement on the model and feeds it the same snapshot a live world gets
// (`WorldModel.applyServerSnapshot`), which derives the claim from the longhouse level and the towers (`claimDiscs`, shoreline.ts),
// the hex enumeration and the giants rule (`claimsWithGiants`, territory.ts) and writes `ownerId` on every claimed hex. The renderer
// draws the gold border of the player's own realm from that, exactly as in a world.
import { coordKey, hexesInRadius } from '../hex/coords';
import { DEFAULT_GENERATION, defaultOrientation, variantForTerrain } from '../map/worldGenerator';
/** The example's seed, only for each hex's art rotation and variant (the same hash a world uses). */
const EXAMPLE_WORLD = { seed: 23, generation: DEFAULT_GENERATION };
/** The settlement id and the account that owns it: the viewer's own realm gets the gold border. */
export const REALM_EXAMPLE_SETTLEMENT = 'docs-realm';
export const REALM_EXAMPLE_PLAYER = 'docs';
/** The longhouse and its level: claim radius 3 (level 2 and up). */
export const REALM_EXAMPLE_LONGHOUSE = { q: 0, r: 0 };
export const REALM_EXAMPLE_LONGHOUSE_LEVEL = 2;
/** The middle of the island and how far it reaches from there. */
const ISLAND_CENTRE = { q: 3, r: 0 };
const ISLAND_RADIUS = 4;
/** Corner hexes left out, so the coast is not a perfect hexagon. */
const CUT = [
    { q: 7, r: -4 },
    { q: -1, r: 4 },
    { q: 3, r: 4 },
];
/** Forest hexes: a grove at the edge of the longhouse's claim (the first tower stands in it) and one by the longhouse. */
const FOREST = [
    { q: 3, r: 0 },
    { q: 3, r: -1 },
    { q: 2, r: 1 },
    { q: 3, r: 1 },
    { q: -1, r: 1 },
    { q: -1, r: 2 },
];
/** Plain bog moss: a patch beyond the first tower's reach edge. */
const BOG = [
    { q: 4, r: -2 },
    { q: 5, r: -2 },
    { q: 5, r: -1 },
    { q: 6, r: -2 },
];
const MOUNTAIN = [
    { q: 1, r: -2 },
    { q: 2, r: -2 },
    { q: 5, r: 1 },
];
/** The first tower: level 2 on a forest hex at the very edge of the longhouse's claim (3 hexes out), so its disc reaches 5 out. */
export const REALM_EXAMPLE_FOREST_TOWER = { coord: { q: 3, r: 0 }, level: 2, ground: 'forest' };
/** The second tower: level 1 on plain bog moss, inside the ground the first one claimed and 4 hexes from the longhouse. */
export const REALM_EXAMPLE_BOG_TOWER = { coord: { q: 5, r: -1 }, level: 1, ground: 'bog' };
/** The three steps, each with the towers standing in it. */
export const REALM_EXAMPLE_STEPS = [
    [],
    [REALM_EXAMPLE_FOREST_TOWER],
    [REALM_EXAMPLE_FOREST_TOWER, REALM_EXAMPLE_BOG_TOWER],
];
const sameHex = (a, b) => a.q === b.q && a.r === b.r;
const contains = (list, c) => list.some((x) => sameHex(x, c));
/** The land of the island: a disc round its centre without the cut corners. */
function landHexes() {
    return hexesInRadius(ISLAND_CENTRE, ISLAND_RADIUS).filter((c) => !contains(CUT, c));
}
const PLAIN_BOG = (c) => ({ q: c.q, r: c.r, kind: 'bog', inDirections: [], outDirection: null, waterEdges: [] });
/** The island's ground without any building or owner: grass, forest, plain bog moss, mountain and sand along the coast, sea rings round it. */
export function buildRealmExampleGround() {
    const tiles = new Map();
    const place = (c, terrain, extra = {}) => {
        tiles.set(coordKey(c), {
            q: c.q,
            r: c.r,
            terrain,
            orientation: defaultOrientation(c.q, c.r, EXAMPLE_WORLD),
            variant: variantForTerrain(c.q, c.r, EXAMPLE_WORLD, terrain),
            ...extra,
        });
    };
    const land = landHexes();
    const isLand = new Set(land.map(coordKey));
    for (const c of land) {
        const coastal = hexesInRadius(c, 1).some((n) => !isLand.has(coordKey(n)));
        if (contains(BOG, c))
            place(c, 'bog', { bog: PLAIN_BOG(c) });
        else if (contains(MOUNTAIN, c))
            place(c, 'mountain');
        else if (contains(FOREST, c))
            place(c, 'forest');
        else
            place(c, coastal ? 'sand' : 'grass');
    }
    // Two rings of water round the land: coastal water next to it, open sea beyond.
    const ring = (from, extra) => {
        const added = [];
        for (const t of from) {
            for (const n of hexesInRadius(t, 1)) {
                if (tiles.has(coordKey(n)))
                    continue;
                place(n, 'sea', extra);
                added.push(tiles.get(coordKey(n)));
            }
        }
        return added;
    };
    const coast = ring([...tiles.values()], { isCoastalWater: true });
    ring(coast, {});
    return [...tiles.values()];
}
/**
 * Shows step `step` (0-based) on `world`: fresh ground, then the settlement with the longhouse and that step's towers, claimed by
 * the model itself. The caller redraws the renderer afterwards (`forceRebuild`).
 */
export function applyRealmExampleStep(world, step) {
    const towers = REALM_EXAMPLE_STEPS[step] ?? [];
    world.setTiles(buildRealmExampleGround());
    world.registerSettlement({
        id: REALM_EXAMPLE_SETTLEMENT,
        ownerId: REALM_EXAMPLE_PLAYER,
        ownerName: REALM_EXAMPLE_PLAYER,
        name: REALM_EXAMPLE_SETTLEMENT,
        q: REALM_EXAMPLE_LONGHOUSE.q,
        r: REALM_EXAMPLE_LONGHOUSE.r,
        // Below the snapshot's level, so the snapshot counts as a level-up and (re)claims the territory.
        level: 1,
        resources: { wood: 0, stone: 0, food: 0, iron: 0 },
        rates: { wood: 0, stone: 0, food: 0, iron: 0 },
        foundedAt: 0,
    });
    const zero = { wood: 0, stone: 0, food: 0, iron: 0 };
    world.applyServerSnapshot(REALM_EXAMPLE_SETTLEMENT, {
        level: REALM_EXAMPLE_LONGHOUSE_LEVEL,
        resources: zero,
        rates: zero,
        capacity: zero,
        buildings: [
            { ...REALM_EXAMPLE_LONGHOUSE, type: 'longhouse', level: REALM_EXAMPLE_LONGHOUSE_LEVEL },
            ...towers.map((t) => ({ ...t.coord, type: 'tower', level: t.level })),
        ],
    });
}
/** Every hex of the example (water included: a claim does not care about terrain) the model currently marks as the realm's. */
export function realmExampleClaimed(world) {
    return buildRealmExampleGround()
        .filter((t) => world.getTile(t.q, t.r).ownerId === REALM_EXAMPLE_SETTLEMENT)
        .map((t) => ({ q: t.q, r: t.r }));
}
