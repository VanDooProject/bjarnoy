const ZERO = { wood: 0, stone: 0, food: 0, iron: 0 };
/** Hand-made catalogue row for tests. */
export function def(type, level, o = {}) {
    return {
        type,
        level,
        cost: { ...ZERO, ...o.cost },
        buildSeconds: o.buildSeconds ?? 60,
        productionPerHour: { ...ZERO, ...o.prod },
        storageCapacity: { wood: o.storage ?? 0, stone: o.storage ?? 0, food: o.storage ?? 0, iron: o.storage ?? 0 },
        allowedTerrain: [],
        requiresCoastalWater: false,
        requiredLonghouseLevel: o.reqLh ?? 1,
        slotCost: 1,
        occupiesAllSlots: o.occupiesAllSlots ?? type === 'longhouse',
        claimRadius: 0,
        prerequisites: o.prereqs ?? [],
    };
}
export function group(defs) {
    const out = {};
    for (const d of defs)
        (out[d.type] ??= []).push(d);
    for (const l of Object.values(out))
        l.sort((a, b) => a.level - b.level);
    return out;
}
