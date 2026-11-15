import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Report-only palette audit for the visual specs: which colours a screen really renders and how many of them are a
 * `:root` token from src/style.css. Plain functions on purpose, so the report can become a failing check later.
 * Only `collectPagePalette` runs in the browser; everything else is Node-side and unit-tested (src/test/visualPalette.test.ts).
 */

const STYLE_CSS = fileURLToPath(new URL('../../src/style.css', import.meta.url));
const MAX_SAMPLES = 5;

export interface PaletteSample {
  selector: string;
  property: string;
}

/** What the browser hands back: one entry per distinct "r,g,b" with every use counted. */
export interface RawColorUse {
  rgb: string;
  uses: number;
  samples: PaletteSample[];
}

export interface RawPagePalette {
  /** Every `:root` custom property resolved to "r,g,b", or null when its value is not a colour. */
  tokens: Record<string, string | null>;
  colors: RawColorUse[];
}

export interface PaletteColor {
  rgb: string;
  token: string | null;
  uses: number;
  samples: PaletteSample[];
}

export interface PaletteReport {
  screen: string;
  project: string;
  tokens: number;
  colors: PaletteColor[];
  offPalette: number;
}

/** Names of every custom property defined in a `:root` rule (plain, `:root[data-theme=...]`, inside `@media`). */
export function extractRootTokenNames(css: string): string[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const names = new Set<string>();
  for (const rule of stripped.matchAll(/(?:^|[}\s;{,])(:root[^{}]*)\{([^{}]*)\}/g)) {
    for (const decl of rule[2].matchAll(/(?:^|;)\s*(--[\w-]+)\s*:/g)) names.add(decl[1]);
  }
  return [...names];
}

export function readRootTokenNames(): string[] {
  return extractRootTokenNames(readFileSync(STYLE_CSS, 'utf8'));
}

/**
 * Parses a computed colour (`rgb(...)`, `rgba(...)`, `color(srgb ...)`) to 0-255 channels and alpha 0-1.
 * Null for anything else (`none`, `url(...)`, empty).
 */
export function parseComputedColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const v = value.trim();
  const legacy = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (legacy) return { r: +legacy[1], g: +legacy[2], b: +legacy[3], a: parseAlpha(legacy[4]) };
  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(v);
  if (srgb) return { r: +srgb[1] * 255, g: +srgb[2] * 255, b: +srgb[3] * 255, a: parseAlpha(srgb[4]) };
  return null;
}

function parseAlpha(raw: string | undefined): number {
  if (raw === undefined) return 1;
  return raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
}

/** "r,g,b" (rounded, alpha ignored) of a computed colour, or null when it is not a colour or fully transparent. */
export function toRgbKey(value: string): string | null {
  const c = parseComputedColor(value);
  if (!c || c.a === 0) return null;
  return `${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)}`;
}

/** Every colour inside a computed value such as a box-shadow or a gradient, as "r,g,b" keys (transparent ones left out). */
export function extractRgbKeys(value: string): string[] {
  const keys: string[] = [];
  for (const m of value.matchAll(/(?:rgba?|color)\([^()]*\)/g)) {
    const key = toRgbKey(m[0]);
    if (key) keys.push(key);
  }
  return keys;
}

/** Joins the raw browser result with the token table: a colour is on-palette when some token has the same RGB. */
export function buildPaletteReport(screen: string, project: string, raw: RawPagePalette): PaletteReport {
  const tokenByRgb = new Map<string, string>();
  let tokenCount = 0;
  for (const [name, rgb] of Object.entries(raw.tokens)) {
    if (rgb === null) continue;
    tokenCount++;
    if (!tokenByRgb.has(rgb)) tokenByRgb.set(rgb, name);
  }
  const colors: PaletteColor[] = raw.colors
    .map((c) => ({ rgb: c.rgb, token: tokenByRgb.get(c.rgb) ?? null, uses: c.uses, samples: c.samples.slice(0, MAX_SAMPLES) }))
    .sort((a, b) => b.uses - a.uses || a.rgb.localeCompare(b.rgb));
  return { screen, project, tokens: tokenCount, colors, offPalette: colors.filter((c) => c.token === null).length };
}

/**
 * Runs in the browser, in one evaluate. Self-contained: it is serialised, so it cannot call anything above.
 * Skips display:none, visibility:hidden, zero-size elements and the map canvas; records the computed value of every colour property.
 */
export function collectPagePalette(tokenNames: string[]): RawPagePalette {
  const parse = (value: string): string | null => {
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value.trim());
    let r: number, g: number, b: number, a: number;
    if (m) {
      [r, g, b] = [+m[1], +m[2], +m[3]];
      a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    } else {
      const s = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(value.trim());
      if (!s) return null;
      [r, g, b] = [+s[1] * 255, +s[2] * 255, +s[3] * 255];
      a = s[4] === undefined ? 1 : s[4].endsWith('%') ? parseFloat(s[4]) / 100 : parseFloat(s[4]);
    }
    return a === 0 ? null : `${Math.round(r)},${Math.round(g)},${Math.round(b)}`;
  };
  const parseAll = (value: string): string[] => {
    const keys: string[] = [];
    for (const m of value.matchAll(/(?:rgba?|color)\([^()]*\)/g)) {
      const k = parse(m[0]);
      if (k) keys.push(k);
    }
    return keys;
  };

  // Tokens: a probe element turns any CSS colour syntax into its computed rgb()/color(srgb ...) form.
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  const probe = document.createElement('span');
  root.appendChild(probe);
  const tokens: Record<string, string | null> = {};
  for (const name of tokenNames) {
    const value = rootStyle.getPropertyValue(name).trim();
    probe.style.color = '';
    probe.style.color = value;
    tokens[name] = probe.style.color === '' ? null : parse(getComputedStyle(probe).color);
  }
  probe.remove();

  const shortSelector = (el: Element): string => {
    const own = (e: Element): string => {
      const tag = e.tagName.toLowerCase();
      if (e.id) return `${tag}#${e.id}`;
      const classes = (e.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2);
      return classes.length ? `${tag}.${classes.join('.')}` : tag;
    };
    let ancestor = el.parentElement;
    while (ancestor && !(ancestor.getAttribute('class') ?? '').trim()) ancestor = ancestor.parentElement;
    return ancestor ? `${own(ancestor)} > ${own(el)}` : own(el);
  };

  const found = new Map<string, RawColorUse>();
  const record = (rgb: string, el: Element, property: string): void => {
    let entry = found.get(rgb);
    if (!entry) found.set(rgb, (entry = { rgb, uses: 0, samples: [] }));
    entry.uses++;
    if (entry.samples.length < 5) {
      const selector = shortSelector(el);
      if (!entry.samples.some((s) => s.selector === selector && s.property === property)) entry.samples.push({ selector, property });
    }
  };

  const sides = ['top', 'right', 'bottom', 'left'];
  for (const el of document.querySelectorAll('*')) {
    if (el.matches('.map-container > canvas')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const single = (property: string, value: string): void => {
      const rgb = parse(value);
      if (rgb) record(rgb, el, property);
    };
    const multi = (property: string, value: string): void => {
      for (const rgb of parseAll(value)) record(rgb, el, property);
    };

    single('color', cs.color);
    single('background-color', cs.backgroundColor);
    for (const side of sides) {
      const width = parseFloat(cs.getPropertyValue(`border-${side}-width`));
      if (width > 0 && cs.getPropertyValue(`border-${side}-style`) !== 'none') single(`border-${side}-color`, cs.getPropertyValue(`border-${side}-color`));
    }
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) single('outline-color', cs.outlineColor);
    if (cs.textDecorationLine !== 'none') single('text-decoration-color', cs.textDecorationColor);
    if (el instanceof SVGGeometryElement || el instanceof SVGTextContentElement) {
      single('fill', cs.fill);
      single('stroke', cs.stroke);
    }
    if (cs.boxShadow !== 'none') multi('box-shadow', cs.boxShadow);
    if (cs.backgroundImage !== 'none') multi('background-image', cs.backgroundImage);
  }

  return { tokens, colors: [...found.values()] };
}
