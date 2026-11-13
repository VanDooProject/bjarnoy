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

export const UNIT_GLYPHS: Record<string, UnitGlyph> = {
  spearman: SPEAR,
  axeman: { stroke: '<path d="M3 10.5 8 3"/>', fill: '<path d="M7 2.5c1.8-.6 3 .4 3.3 2.2L8 4.5z"/>' },
  berserker: { stroke: '<path d="M2.5 10.5 8 3"/><path d="M9.5 10.5 4 3"/>', fill: '<path d="M7 2.5c1.8-.6 3 .4 3.3 2.2L8 4.5z"/>' },
  bowman: { stroke: '<path d="M3 1.5c4 1.5 4 7.5 0 9M3 1.5v9M3 6h7M8.5 4.5 10 6 8.5 7.5"/>' },
  // A thrown spear: the shaft with a leaf head and two speed lines behind it.
  skirmisher: { stroke: '<path d="M1.5 10.5 8.6 3.4M1.6 6.8h2.4M3.6 10.9h2.2"/>', fill: '<path d="M8.1 3.9C8.6 2.6 9.9 1.5 11 1.1 10.6 2.2 9.5 3.5 8.1 3.9z"/>' },
  thrall: { stroke: '<path d="M3 10.5 7 4"/>', fill: '<ellipse cx="8" cy="3" rx="2" ry="1.6"/>' },
  provisioner: { stroke: '<path d="M2 5h8l-1 5H3zM4 5a2 2 0 0 1 4 0"/>' },
  catapult: { stroke: '<path d="M1.5 10.5h9M3 10.5 7.5 3M7.5 3 10 4"/><circle cx="3.3" cy="4.2" r="1.2"/>' },
  ram: { stroke: '<path d="M1 8h9M2 8v2.5M9 8v2.5M2 5.5h7"/><path d="M10 6.2v3.6"/>' },
  karve: { stroke: '<path d="M1 7.6Q6 10.4 11 7.6zM1 7.6.6 6.2M11 7.6l.4-1.4M6 7.6V1.2"/>', fill: '<path d="M3.9 1.8H8.1Q8.7 3.8 8.1 5.8H3.9Q3.3 3.8 3.9 1.8z"/>' },
  snekkja: { stroke: '<path d="M.5 7.8Q6 9.8 11.5 7.8zM.5 7.8C.1 6.8.4 5.9 1.2 5.6M11.5 7.8c.4-1 .1-1.9-.7-2.2M6 7.8V1.6"/>', fill: '<path d="M4.1 2.2H7.9Q8.5 4.1 7.9 6H4.1Q3.5 4.1 4.1 2.2z"/>' },
  faering: { stroke: '<path d="M1.8 6.6Q6 10.2 10.2 6.6zM1.8 6.6 1.3 5.2M10.2 6.6l.5-1.4M3.4 8.6 1.2 10.6M8.6 8.6l2.2 2"/>' },
  byrding: { stroke: '<path d="M2 7.2Q2.4 10.4 6 10.4T10 7.2zM6 7.2V1.6"/>', fill: '<path d="M4.3 2.2H7.7Q8.2 3.9 7.7 5.6H4.3Q3.8 3.9 4.3 2.2z"/>' },
  knarr: { stroke: '<path d="M1 6.6Q1.4 10.8 6 10.8T11 6.6zM6 6.6V.8"/>', fill: '<path d="M3.2 1.4H8.8Q9.5 3.4 8.8 5.4H3.2Q2.5 3.4 3.2 1.4z"/>' },
  skeid: { stroke: '<path d="M.3 7.6Q6 9.6 11.7 7.6zM.3 7.6C-.1 6.5.2 5.5 1.1 5.1M11.7 7.6c.4-1 .1-2-.8-2.4M6 7.6V.8"/>', fill: '<path d="M3.3 1.4H8.7Q9.4 3.6 8.7 5.8H3.3Q2.6 3.6 3.3 1.4zM3.4 8.15a.55.55 0 1 0 0 .01zM6 8.55a.55.55 0 1 0 0 .01zM8.6 8.15a.55.55 0 1 0 0 .01z"/>' },
  fireraft: { stroke: '<path d="M2 9.5h8M3 9.5v-1.5h6v1.5"/>', fill: '<path d="M6 2c1.8 1.6 2 3 .9 4.5H5.1C4 5 4.4 3.6 6 2z"/>' },
  firehulk: { stroke: '<path d="M1 8.2Q6 11 11 8.2zM1 8.2.6 6.9M11 8.2l.4-1.3"/>', fill: '<path d="M6 1.5c1.8 1.6 2 3.1.9 4.8H5.1C4 4.6 4.4 3.1 6 1.5z"/>' },
  settler: PERSON,
};

export const FALLBACK_UNIT_GLYPH = PERSON;

export function unitGlyph(unit: string): UnitGlyph {
  return UNIT_GLYPHS[unit] ?? FALLBACK_UNIT_GLYPH;
}
