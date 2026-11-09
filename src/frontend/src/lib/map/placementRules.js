/**
 * Types the demo world places that the backend has no definition for: the starter hut, drawn by the landing page and the showcase
 * village. Not in the catalogue, never in the ring.
 */
const DEMO_ONLY_RULES = [
    {
        type: 'hut',
        category: null,
        order: 0,
        allowedTerrain: ['grass'],
        requiresCoastalWater: false,
        alsoOnCoastalWater: false,
        requiresBogKinds: [],
        alsoOnBogKinds: [],
        lakeShoreKinds: [],
        requiresRiverShapes: [],
        excludedRiverVariants: [],
        newPlacementDisabled: false,
    },
];
let rules = new Map();
/** Registers the placement rules of the catalogue's level-1 entries (every level of a building shares them), replacing earlier ones. */
export function setPlacementRules(definitions) {
    const next = new Map();
    for (const rule of DEMO_ONLY_RULES)
        next.set(rule.type, rule);
    for (const d of definitions) {
        if (d.level !== 1)
            continue;
        next.set(d.type, {
            type: d.type,
            category: d.ringCategory,
            order: d.ringOrder,
            allowedTerrain: d.allowedTerrain,
            requiresCoastalWater: d.requiresCoastalWater,
            alsoOnCoastalWater: d.alsoOnCoastalWater ?? false,
            requiresBogKinds: d.requiresBogKinds,
            alsoOnBogKinds: d.alsoOnBogKinds,
            lakeShoreKinds: d.lakeShoreKinds,
            requiresRiverShapes: d.requiresRiverShapes,
            excludedRiverVariants: d.excludedRiverVariants,
            newPlacementDisabled: d.newPlacementDisabled,
        });
    }
    rules = next;
}
export function placementRuleFor(type) {
    return type === undefined ? undefined : rules.get(type);
}
/** Every registered rule, in no particular order. */
export function allPlacementRules() {
    return rules.values();
}
