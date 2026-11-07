export function sumLine(line) {
    return line.wood + line.stone + line.food + line.iron;
}
/** Per-level economy curves for one building type. Reads only the catalogue rows it is given. */
export function curvesFor(defs) {
    const sorted = [...defs].sort((a, b) => a.level - b.level);
    const points = [];
    let previousProduction = 0;
    for (const def of sorted) {
        const totalCost = sumLine(def.cost);
        const production = sumLine(def.productionPerHour);
        const gained = production - previousProduction;
        points.push({
            level: def.level,
            totalCost,
            cost: { ...def.cost },
            buildMinutes: def.buildSeconds / 60,
            productionPerHour: production,
            paybackHours: gained > 0 ? totalCost / gained : null,
        });
        previousProduction = production;
    }
    return points;
}
