/**
 * Small line pictograms of the units (12x12 viewBox, stroked with `currentColor`), for chips that have no room for the
 * unit's name — the building HUD's garrison and training rows. `UnitIcon.vue` renders them. `filled` parts are the solid
 * bits of a glyph (an axe head), drawn with the same colour.
 */
interface UnitGlyph {
  stroke: string;
  fill?: string;
}

const PERSON: UnitGlyph = { stroke: '<circle cx="6" cy="3.6" r="1.8"/><path d="M2.6 10.5c0-2.6 1.5-3.9 3.4-3.9s3.4 1.3 3.4 3.9z"/>' };

const SPEAR: UnitGlyph = { stroke: '<path d="M2 10 9 3M9 3l1.5-1.5M7.5 2.5 9.5 4.5"/>' };
const SHIP: UnitGlyph = { stroke: '<path d="M1 7.5h10l-1.5 2.5h-7zM6 7.5V1.5l3 4.5H6"/>' };

export const UNIT_GLYPHS: Record<string, UnitGlyph> = {
  spearman: SPEAR,
  axeman: { stroke: '<path d="M3 10.5 8 3"/>', fill: '<path d="M7 2.5c1.8-.6 3 .4 3.3 2.2L8 4.5z"/>' },
  berserker: { stroke: '<path d="M2.5 10.5 8 3"/><path d="M9.5 10.5 4 3"/>', fill: '<path d="M7 2.5c1.8-.6 3 .4 3.3 2.2L8 4.5z"/>' },
  bowman: { stroke: '<path d="M3 1.5c4 1.5 4 7.5 0 9M3 1.5v9M3 6h7M8.5 4.5 10 6 8.5 7.5"/>' },
  // A thrown spear: the shaft with a leaf head and two speed lines behind it.
  skirmisher: { stroke: '<path d="M1.5 9.5 8.5 4M2 6.5h2.5M3.5 11h2.5"/>', fill: '<path d="M8 2.4 11 3.6 9.6 6.6 7.2 4.6z"/>' },
  thrall: { stroke: '<path d="M3 10.5 7 4"/>', fill: '<ellipse cx="8" cy="3" rx="2" ry="1.6"/>' },
  provisioner: { stroke: '<path d="M2 5h8l-1 5H3zM4 5a2 2 0 0 1 4 0"/>' },
  catapult: { stroke: '<path d="M1.5 10.5h9M3 10.5 7.5 3M7.5 3 10 4"/><circle cx="3.3" cy="4.2" r="1.2"/>' },
  ram: { stroke: '<path d="M1 8h9M2 8v2.5M9 8v2.5M2 5.5h7"/><path d="M10 6.2v3.6"/>' },
  karve: SHIP,
  snekkja: { stroke: '<path d="M.8 7h10.4l-2 3h-6.4zM6 7V1.5M6 2l3.5 3H6"/>' },
  faering: { stroke: '<path d="M2 8h8l-1 1.8H3zM6 8V3.5l2.2 3H6"/>' },
  byrding: { stroke: '<path d="M1.5 6.5h9c0 2.2-1.6 3.5-4.5 3.5s-4.5-1.3-4.5-3.5zM6 6.5V2.5"/>' },
  knarr: { stroke: '<path d="M1 6.5h10c0 2.4-1.8 3.8-5 3.8s-5-1.4-5-3.8zM6 6.5V1.5M3.5 2.5h5v3h-5z"/>' },
  skeid: { stroke: '<path d="M.5 7.5h11l-2 2.5h-7zM6 7.5V2M6 2.5l3.8 3H6M.5 7.5 1.2 5"/>' },
  fireraft: { stroke: '<path d="M2 9.5h8M3 9.5v-1.5h6v1.5"/>', fill: '<path d="M6 2c1.8 1.6 2 3 .9 4.5H5.1C4 5 4.4 3.6 6 2z"/>' },
  firehulk: { stroke: '<path d="M1 8h10l-1.5 2.5h-7z"/>', fill: '<path d="M6 1.5c1.8 1.6 2 3.1.9 4.8H5.1C4 4.6 4.4 3.1 6 1.5z"/>' },
  settler: PERSON,
};

export const FALLBACK_UNIT_GLYPH = PERSON;

export function unitGlyph(unit: string): UnitGlyph {
  return UNIT_GLYPHS[unit] ?? FALLBACK_UNIT_GLYPH;
}
