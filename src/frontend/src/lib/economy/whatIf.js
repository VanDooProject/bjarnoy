export const DEFAULT_WHAT_IF = {
    costGrowth: 1.3,
    longhouseCostGrowth: 1.34,
    timeGrowth: 1.33,
    longhouseTimeGrowth: 1.33,
    productionGrowth: 1.2,
    producerCostScale: 1,
    longhouseCostScale: 1,
    timeScale: 1,
    foundingStock: { wood: 700, stone: 700, food: 700, iron: 0 },
};
export function defaultWhatIf() {
    return { ...DEFAULT_WHAT_IF, foundingStock: { ...DEFAULT_WHAT_IF.foundingStock } };
}
const scaleLine = (l, f) => ({
    wood: l.wood * f,
    stone: l.stone * f,
    food: l.food * f,
    iron: l.iron * f,
});
// Manual copy: the input is often a reactive proxy, which structuredClone rejects.
const copyDef = (d) => ({
    ...d,
    cost: { ...d.cost },
    productionPerHour: { ...d.productionPerHour },
    storageCapacity: { ...d.storageCapacity },
    allowedTerrain: [...d.allowedTerrain],
    prerequisites: d.prerequisites.map((p) => ({ ...p })),
});
/** Types whose per-level cost and time are spelled out in the catalogue (BuildingCatalogue.BridgeLevels), not grown from level 1: copied as is. */
const SPELLED_OUT_TYPES = new Set(['bridge']);
/** A new catalogue with every level regenerated from its type's level 1. Types without a level 1 are copied as is. */
export function applyWhatIf(byType, knobs) {
    const out = {};
    for (const [type, defs] of Object.entries(byType)) {
        const first = defs.find((d) => d.level === 1);
        if (!first || SPELLED_OUT_TYPES.has(type)) {
            out[type] = defs.map(copyDef);
            continue;
        }
        const lh = type === 'longhouse';
        const costGrowth = lh ? knobs.longhouseCostGrowth : knobs.costGrowth;
        const timeGrowth = lh ? knobs.longhouseTimeGrowth : knobs.timeGrowth;
        const costScale = lh ? knobs.longhouseCostScale : knobs.producerCostScale;
        out[type] = defs.map((d) => {
            const n = d.level - 1;
            return {
                ...copyDef(d),
                cost: scaleLine(first.cost, costScale * costGrowth ** n),
                buildSeconds: Math.round(first.buildSeconds * knobs.timeScale * timeGrowth ** n),
                productionPerHour: scaleLine(first.productionPerHour, lh ? d.level : knobs.productionGrowth ** n),
            };
        });
    }
    return out;
}
