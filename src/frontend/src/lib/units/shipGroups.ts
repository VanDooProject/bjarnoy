/**
 * The jobs the ships are grouped by in the training window and the docs (docs/design/units-and-ships.md §1): one place
 * for which ship belongs to which group and the order the groups are shown in.
 */
export const SHIP_GROUPS = ['scouts', 'cargo', 'transport', 'warships', 'fireCraft'] as const;

export type ShipGroup = (typeof SHIP_GROUPS)[number];

/** The ships in display order (the order of the units-and-ships table), which is also the order inside a group. */
const SHIP_ORDER = ['faering', 'byrding', 'knarr', 'karve', 'snekkja', 'skeid', 'fireraft', 'firehulk'];

const GROUP_OF: Record<string, ShipGroup> = {
  faering: 'scouts',
  byrding: 'cargo',
  knarr: 'cargo',
  karve: 'transport',
  snekkja: 'warships',
  skeid: 'warships',
  fireraft: 'fireCraft',
  firehulk: 'fireCraft',
};

/** The group a ship unit belongs to, or null for a unit that is not a grouped ship. */
export function shipGroupOf(unit: string): ShipGroup | null {
  return GROUP_OF[unit] ?? null;
}

/** Splits rows into the ship groups in display order. Rows without a group come first, as one group with a null key. */
export function groupByShipGroup<T>(rows: readonly T[], unitOf: (row: T) => string): { group: ShipGroup | null; rows: T[] }[] {
  const out: { group: ShipGroup | null; rows: T[] }[] = [];
  const ungrouped = rows.filter((r) => shipGroupOf(unitOf(r)) === null);
  if (ungrouped.length > 0) out.push({ group: null, rows: ungrouped });
  for (const group of SHIP_GROUPS) {
    const inGroup = rows
      .filter((r) => shipGroupOf(unitOf(r)) === group)
      .sort((a, b) => SHIP_ORDER.indexOf(unitOf(a)) - SHIP_ORDER.indexOf(unitOf(b)));
    if (inGroup.length > 0) out.push({ group, rows: inGroup });
  }
  return out;
}
