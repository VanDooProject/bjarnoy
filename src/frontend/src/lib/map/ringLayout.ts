/**
 * Placement maths for the two-lane, edge-aware ring menu (RingMenu.vue).
 *
 * Kept out of the component so the placement *contract* can be asserted
 * directly in unit tests rather than only being visible on screen:
 *
 *   1. every bubble sits inside the area it was given, and
 *   2. no bubble overlaps the hub, another bubble, or the detail card.
 *
 * Both rules held only "usually" while this lived inline in a prototype —
 * near a screen edge, and especially with a HUD panel narrowing the area on
 * one side, the fallbacks used to return unchecked positions. The functions
 * here return `null` instead of an unvalidated guess wherever a caller can
 * still try something else.
 *
 * The one non-obvious rule the ladders below follow: arc length is r·θ, so a
 * *narrow* free wedge needs a BIGGER radius to seat the same bubbles, not a
 * smaller one. Shrinking the radius when space is tight is what used to
 * stack four category bubbles on top of each other beside a panel.
 */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A placed bubble centre, plus the angle from the tile it ended up at. */
export interface Spot {
  x: number;
  y: number;
  ang: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Orbit radius of the inner lane (root actions / build categories). */
export const LANE1 = 68;
/** Orbit radius of the outer lane (the open category's buildings). */
export const LANE2 = 118;
/** Inner-lane bubble diameter. */
export const BUB1 = 52;
/** Outer-lane bubble diameter. */
export const BUB2 = 46;
/** Hub (the tile itself) diameter. */
export const HUB = 66;
/** Diameter a spent inner lane collapses to when two full lanes don't fit. */
export const DOT = 14;
export const CARD_W = 200;
/** Measured, not nominal — the rendered card is ~222px tall, and a 200 here made every clearance test 20px optimistic. */
export const CARD_H = 222;
/** Distance from an edge below which the ring stops being a full circle. */
export const NEED = LANE2 + BUB2 / 2 + 11;

const D2R = Math.PI / 180;

function pt(px: number, py: number, ang: number, r: number): [number, number] {
  return [px + Math.cos(ang * D2R) * r, py + Math.sin(ang * D2R) * r];
}

/** True when the tile is close enough to an edge that a full circle would be clipped. */
export function isCramped(px: number, py: number, area: Rect): boolean {
  return px - area.left < NEED || area.right - px < NEED || py - area.top < NEED || area.bottom - py < NEED;
}

/** The direction with the most room — the ring opens this way when space is tight. */
export function baseAngle(px: number, py: number, area: Rect): number {
  const dx = area.right - px - (px - area.left);
  const dy = area.bottom - py - (py - area.top);
  return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx) / D2R;
}

/** Human-readable placement mode, for tests and debugging overlays. */
export function placementMode(px: number, py: number, area: Rect): string {
  if (!isCramped(px, py, area)) return 'FULL RING';
  const a = ((baseAngle(px, py, area) % 360) + 360) % 360;
  if (a > 45 && a <= 135) return 'OPENS DOWN';
  if (a > 135 && a <= 225) return 'OPENS LEFT';
  if (a > 225 && a <= 315) return 'OPENS UP';
  return 'OPENS RIGHT';
}

function spread(n: number, center: number, arcMax: number): number[] {
  const arc = Math.min(arcMax, n * 52);
  return Array.from({ length: n }, (_, i) => center - arc / 2 + (arc * (i + 0.5)) / n);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

function fits(x: number, y: number, radius: number, area: Rect): boolean {
  return x - radius >= area.left && x + radius <= area.right && y - radius >= area.top && y + radius <= area.bottom;
}

function minSep(spots: Spot[]): number {
  if (spots.length < 2) return Infinity;
  let m = Infinity;
  for (let i = 1; i < spots.length; i++) {
    m = Math.min(m, Math.hypot(spots[i].x - spots[i - 1].x, spots[i].y - spots[i - 1].y));
  }
  return m;
}

/** Smallest gap between any of `spots` (as circles of `size`) and any obstacle. */
export function clearance(spots: { x: number; y: number }[], size: number, avoid: Circle[]): number {
  if (!avoid.length) return Infinity;
  let m = Infinity;
  for (const s of spots) {
    for (const o of avoid) m = Math.min(m, Math.hypot(s.x - o.x, s.y - o.y) - size / 2 - o.r);
  }
  return m;
}

/** Rect-vs-circle clearance, for testing the detail card against the bubbles. */
export function rectClears(cx: number, cy: number, w: number, h: number, avoid: Circle[]): boolean {
  return avoid.every((o) => {
    const dx = Math.max(Math.abs(o.x - cx) - w / 2, 0);
    const dy = Math.max(Math.abs(o.y - cy) - h / 2, 0);
    return Math.hypot(dx, dy) >= o.r + 5;
  });
}

/**
 * Seat `n` bubbles on an arc: widest arc first, and within each arc the
 * smallest radius that can actually hold them (the `need` term), nudging the
 * arc's centre a little when the straight-on placement doesn't fit.
 */
function arcPlace(
  n: number,
  base: number,
  px: number,
  py: number,
  area: Rect,
  size: number,
  radii: number[],
  arcs: number[],
  avoid: Circle[],
): Spot[] | null {
  const pitch = size + 6;
  for (const arc of arcs) {
    const need = n > 1 ? ((n - 1) * pitch) / (arc * D2R) : 0;
    const candidates = [...radii, need].filter((r) => r >= need - 0.5).sort((a, b) => a - b);
    for (const r of candidates) {
      for (const offset of [0, 18, -18, 36, -36]) {
        const spots = spread(n, base + offset, arc).map((a) => {
          const [x, y] = pt(px, py, a, r);
          return { x, y, ang: a };
        });
        if (
          spots.every((s) => fits(s.x, s.y, size / 2 + 4, area)) &&
          minSep(spots) >= size + 2 &&
          clearance(spots, size, avoid) >= 4
        ) {
          return spots;
        }
      }
    }
  }
  return null;
}

/**
 * A stacked column, for when the free wedge cannot seat `n` circles at any
 * radius. `offset` is signed and displaces the column along the axis it runs
 * perpendicular to, so a negative value moves *inward* — the direction the
 * edge clamp does not block.
 *
 * Offsets are measured from the tile PROJECTED into `area`: when the tile
 * itself lies outside it (a hex under a HUD panel), offsetting from the true
 * anchor makes every candidate clamp to the same edge, which is how both
 * lanes used to land on top of each other.
 */
function columnRun(n: number, base: number, px: number, py: number, area: Rect, size: number, offset: number): Spot[] {
  const pitch = size + 6;
  const pad = size / 2 + 2;
  const cos = Math.cos(base * D2R);
  const sin = Math.sin(base * D2R);
  const total = (n - 1) * pitch;
  const ox = clamp(px, area.left + pad, area.right - pad);
  const oy = clamp(py, area.top + pad, area.bottom - pad);
  const raw: { x: number; y: number }[] = [];
  if (Math.abs(cos) >= Math.abs(sin)) {
    const x = clamp(ox + (cos >= 0 ? offset : -offset), area.left + pad, area.right - pad);
    const y0 = clamp(oy - total / 2, area.top + pad, area.bottom - pad - total);
    for (let i = 0; i < n; i++) raw.push({ x, y: y0 + i * pitch });
  } else {
    const y = clamp(oy + (sin >= 0 ? offset : -offset), area.top + pad, area.bottom - pad);
    const x0 = clamp(ox - total / 2, area.left + pad, area.right - pad - total);
    for (let i = 0; i < n; i++) raw.push({ x: x0 + i * pitch, y });
  }
  return raw.map((p) => ({ x: p.x, y: p.y, ang: Math.atan2(p.y - py, p.x - px) / D2R }));
}

function columnPlace(
  n: number,
  base: number,
  px: number,
  py: number,
  area: Rect,
  size: number,
  offset: number,
  avoid: Circle[],
  allowBest = false,
): Spot[] | null {
  const runs: Spot[][] = [];
  for (const extra of [0, 34, 68, 102]) {
    runs.push(columnRun(n, base, px, py, area, size, offset + extra));
    runs.push(columnRun(n, base, px, py, area, size, -(offset + extra)));
  }
  if (avoid.length) {
    // Candidates derived from where the obstacles actually are, displaced
    // past them rather than by a fixed step from the tile.
    const vertical = Math.abs(Math.cos(base * D2R)) >= Math.abs(Math.sin(base * D2R));
    const pad = size / 2 + 2;
    const anchor = vertical
      ? clamp(px, area.left + pad, area.right - pad)
      : clamp(py, area.top + pad, area.bottom - pad);
    const lo = Math.min(...avoid.map((o) => (vertical ? o.x - o.r : o.y - o.r)));
    const hi = Math.max(...avoid.map((o) => (vertical ? o.x + o.r : o.y + o.r)));
    for (const gap of [14, 34, 58]) {
      runs.push(columnRun(n, base, px, py, area, size, lo - (size / 2 + gap) - anchor));
      runs.push(columnRun(n, base, px, py, area, size, hi + (size / 2 + gap) - anchor));
      runs.push(columnRun(n, base, px, py, area, size, anchor - (lo - (size / 2 + gap))));
    }
  }
  let best: Spot[] | null = null;
  let bestScore = -Infinity;
  for (const run of runs) {
    const score = clearance(run, size, avoid);
    if (score >= 4) return run;
    if (score > bestScore) {
      bestScore = score;
      best = run;
    }
  }
  return allowBest ? best : null;
}

/** The inner lane: an even circle when there's room, an arc or column when there isn't. */
export function lane1Spots(n: number, px: number, py: number, area: Rect): Spot[] {
  if (!isCramped(px, py, area)) {
    return Array.from({ length: n }, (_, i) => {
      const ang = -90 + (360 * i) / n;
      const [x, y] = pt(px, py, ang, LANE1);
      return { x, y, ang };
    });
  }
  const base = baseAngle(px, py, area);
  return (
    arcPlace(n, base, px, py, area, BUB1, [LANE1, 84, 100, 118, 140], [210, 170, 130, 100, 80, 64, 50], []) ??
    columnPlace(n, base, px, py, area, BUB1, HUB / 2 + BUB1 / 2 + 12, [], true)!
  );
}

/**
 * Docks the detail card clear of the ring, ordered by how close it is to the
 * direction the cursor is already travelling in.
 *
 * `obstacles` is the bubbles actually on screen, not a fixed box around the
 * hub: near an edge a lane can be displaced well outside that box, and a card
 * tested only against the box then lands on the menu.
 */
export function cardSpot(
  px: number,
  py: number,
  ang: number,
  area: Rect,
  obstacles: Circle[],
): { x: number; y: number } {
  const clear = LANE2 + 42;
  const box = { l: px - clear, t: py - clear, r: px + clear, b: py + clear };
  const right = { x: px + clear, y: py - CARD_H / 2 };
  const left = { x: px - clear - CARD_W, y: py - CARD_H / 2 };
  const down = { x: px - CARD_W / 2, y: py + clear };
  const up = { x: px - CARD_W / 2, y: py - clear - CARD_H };
  const a = ((ang % 360) + 360) % 360;
  const order =
    a < 45 || a >= 315
      ? [right, up, down, left]
      : a < 135
        ? [down, right, left, up]
        : a < 225
          ? [left, up, down, right]
          : [up, right, left, down];
  // The side docks float vertically rather than aligning to the hub, which is
  // what a 222px-tall card needs when the tile sits near the top or bottom.
  const midY = Math.max(area.top + 8, Math.min(py - CARD_H / 2, area.bottom - CARD_H - 8));
  const docks = [
    { x: area.left + 8, y: area.top + 8 },
    { x: area.right - CARD_W - 8, y: area.top + 8 },
    { x: area.left + 8, y: area.bottom - CARD_H - 8 },
    { x: area.right - CARD_W - 8, y: area.bottom - CARD_H - 8 },
    { x: area.left + 8, y: midY },
    { x: area.right - CARD_W - 8, y: midY },
  ].sort(
    (p, q) =>
      Math.hypot(q.x + CARD_W / 2 - px, q.y + CARD_H / 2 - py) - Math.hypot(p.x + CARD_W / 2 - px, p.y + CARD_H / 2 - py),
  );
  const inArea = (c: { x: number; y: number }) =>
    c.x >= area.left && c.x + CARD_W <= area.right && c.y >= area.top && c.y + CARD_H <= area.bottom;
  const boxClash = (c: { x: number; y: number }) =>
    c.x < box.r && c.x + CARD_W > box.l && c.y < box.b && c.y + CARD_H > box.t;
  const bubbleClash = (c: { x: number; y: number }) =>
    obstacles.length > 0 && !rectClears(c.x + CARD_W / 2, c.y + CARD_H / 2, CARD_W, CARD_H, obstacles);

  const candidates = [...order, ...docks];
  for (const c of candidates) if (inArea(c) && !boxClash(c) && !bubbleClash(c)) return c;
  // Nothing fully clear of the ring's bounding box: settle for clearing the
  // bubbles themselves, which is what actually matters visually.
  for (const c of candidates) if (inArea(c) && !bubbleClash(c)) return c;
  if (obstacles.length) {
    const score = (c: { x: number; y: number }) =>
      Math.min(
        ...obstacles.map((o) => {
          const dx = Math.max(Math.abs(o.x - (c.x + CARD_W / 2)) - CARD_W / 2, 0);
          const dy = Math.max(Math.abs(o.y - (c.y + CARD_H / 2)) - CARD_H / 2, 0);
          return Math.hypot(dx, dy) - o.r;
        }),
      );
    const usable = candidates.filter(inArea);
    if (usable.length) return usable.reduce((best, c) => (score(c) > score(best) ? c : best));
  }
  return {
    x: clamp(order[0].x, area.left, area.right - CARD_W),
    y: clamp(order[0].y, area.top, area.bottom - CARD_H),
  };
}

export interface RingLayoutInput {
  /** Tile centre, in the same coordinate space as `area`. */
  x: number;
  y: number;
  /** Where the RING may go — shrunk to keep clear of the HUD panels. */
  area: Rect;
  /** Where the CARD may go — deliberately roomier than `area`, see RingMenu.vue. */
  cardArea: Rect;
  /** Slots on the inner lane (root actions, or categories plus the back slot). */
  lane1Count: number;
  /** Buildings on the outer lane; 0 when no category is open. */
  lane2Count: number;
  /** Inner-lane slot the open category occupies — its children fan out beside it. */
  parentIndex: number;
  /** Outer-lane index the card belongs to, or null when nothing is hovered. */
  cardAnchor: number | null;
}

export interface RingLayoutResult {
  lane1: Spot[];
  lane2: Spot[];
  /** True when two full lanes didn't fit and the inner lane shrinks to dots. */
  collapsed: boolean;
  showLane1Track: boolean;
  showLane2Track: boolean;
  /** Dashed line from the hub to a lane displaced away from the tile. */
  leader: { x: number; y: number; len: number; deg: number } | null;
  card: { x: number; y: number } | null;
  mode: string;
}

function nearest(px: number, py: number, spots: { x: number; y: number }[]) {
  return spots.reduce<{ d: number; p: { x: number; y: number } | null }>(
    (acc, p) => {
      const d = Math.hypot(p.x - px, p.y - py);
      return d < acc.d ? { d, p } : acc;
    },
    { d: Infinity, p: null },
  );
}

/** Lays out one open ring. Pure: same input, same positions, no DOM. */
export function layoutRing(input: RingLayoutInput): RingLayoutResult {
  const { x, y, area, cardArea, lane1Count, lane2Count, parentIndex, cardAnchor } = input;
  const base = baseAngle(x, y, area);
  const lane1 = lane1Spots(lane1Count, x, y, area);

  const lane1Near = nearest(x, y, lane1);
  const showLane1Track = lane1Near.d <= LANE1 + BUB1;
  // A displaced lane leaves an empty orbit drawn on the hex with the bubbles
  // floating elsewhere, so the track is suppressed and a leader drawn instead.
  const leader =
    showLane1Track || !lane1Near.p
      ? null
      : (() => {
          const p = lane1Near.p;
          const rad = Math.atan2(p.y - y, p.x - x);
          return {
            x: x + Math.cos(rad) * (HUB / 2),
            y: y + Math.sin(rad) * (HUB / 2),
            len: Math.max(0, Math.hypot(p.x - x, p.y - y) - HUB / 2 - BUB1 / 2),
            deg: rad / D2R,
          };
        })();

  let lane2: Spot[] = [];
  let collapsed = false;
  let card: { x: number; y: number } | null = null;
  let showLane2Track = false;

  if (lane2Count > 0 && lane1[parentIndex]) {
    const hub: Circle = { x, y, r: HUB / 2 };
    const parentAngle = lane1[parentIndex].ang;
    // The reserved back slot is in here too: children must clear it as well.
    const laneCircles = (r: number) => lane1.map((s) => ({ x: s.x, y: s.y, r }));
    const place = (avoid: Circle[]) =>
      arcPlace(lane2Count, parentAngle, x, y, area, BUB2, [LANE2, 140, 162], [90, 68, 50], avoid) ??
      arcPlace(lane2Count, base, x, y, area, BUB2, [LANE2, 140, 162, 184], [120, 90, 68], avoid) ??
      columnPlace(lane2Count, base, x, y, area, BUB2, HUB / 2 + BUB1 + BUB2 / 2 + 22, avoid);

    let spots = place([hub, ...laneCircles(BUB1 / 2)]);
    if (!spots) {
      // Nowhere for two full lanes (a tile deep under a HUD panel): collapse
      // the inner lane to dots rather than drawing both lanes on top of each
      // other. The back slot stays full size — see RingMenu.vue.
      collapsed = true;
      spots = place([hub, ...laneCircles(DOT / 2)]);
    }
    if (!spots) {
      spots = columnPlace(
        lane2Count,
        base,
        x,
        y,
        area,
        BUB2,
        HUB / 2 + BUB2 / 2 + 14,
        [hub, ...laneCircles(DOT / 2)],
        true,
      )!;
    }
    lane2 = spots;
    showLane2Track = nearest(x, y, lane2).d <= LANE2 + BUB2;

    if (cardAnchor !== null && lane2[cardAnchor]) {
      const obstacles: Circle[] = [
        hub,
        ...lane1.map((s) => ({ x: s.x, y: s.y, r: BUB1 / 2 })),
        ...lane2.map((s) => ({ x: s.x, y: s.y, r: BUB2 / 2 })),
      ];
      card = cardSpot(x, y, lane2[cardAnchor].ang, cardArea, obstacles);
    }
  }

  return {
    lane1,
    lane2,
    collapsed,
    showLane1Track,
    showLane2Track,
    leader,
    card,
    mode: placementMode(x, y, area),
  };
}
