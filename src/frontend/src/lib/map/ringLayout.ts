/**
 * Placement maths for the two-lane, edge-aware ring menu (RingMenu.vue).
 *
 * Kept out of the component so the placement *contract* can be asserted
 * directly in unit tests rather than only being visible on screen:
 *
 *   1. every bubble sits inside the area it was given, and
 *   2. no bubble overlaps the hub, another bubble, or the detail card.
 *
 * The ring is always circles round its tile, whatever the screen: where the
 * tile is too near an edge for that, the caller moves the tile (the map pans -
 * `ringRoomFor` finds where to, `ringPlacement.ts` does it) and only where no
 * spot has room at all does the whole ring shrink, keeping its shape. The
 * searches below return `null` instead of an unvalidated guess so that
 * decision stays with `ringRoomFor`.
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
/**
 * Measured, not nominal: with the build-slots row and a status footer the
 * rendered card is ~180-240px tall (230 for a locked building with one line
 * of reasons); a lower figure here makes every clearance test optimistic.
 */
export const CARD_H = 240;
/**
 * The ring's error note (a rejected build's message)
 * — a short muted explanation, not the full building-detail card, so it
 * gets its own (much smaller) footprint rather than reusing CARD_W/CARD_H:
 * a 200x222 clearance box around a ~186x60 note would push it needlessly
 * far from the ring, and on a cramped layout could fail to place at all
 * where the real note would have fit easily.
 */
export const NOTE_W = 186;
export const NOTE_H = 60;
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
  maxRadius = Infinity,
): Spot[] | null {
  const pitch = size + 6;
  for (const arc of arcs) {
    // `spread` seats neighbours `arc / n` apart (capped the way spread caps it), so the radius
    // has to give that angle a chord of one pitch. Sizing it for `n - 1` gaps instead left
    // neighbours only (n-1)/n of a pitch apart: the `need` radius always failed minSep, so on a
    // phone-narrow area (where the fixed radii are too small for any arc) every arc failed.
    const step = (Math.min(arc, n * 52) / n) * D2R;
    const need = n > 1 ? pitch / (2 * Math.sin(step / 2)) : 0;
    // A lone bubble has no neighbours to space, so no `need` radius: 0 would seat it on the hub.
    const candidates = [...radii, ...(n > 1 ? [need] : [])].filter((r) => r >= need - 0.5 && r <= maxRadius).sort((a, b) => a - b);
    for (const r of candidates) {
      for (const offset of [0, 18, -18, 36, -36]) {
        // Built one bubble at a time so a spot off the area rejects the candidate at once: ringRoomFor
        // tries this at hundreds of tile spots per tap.
        const spots: Spot[] = [];
        for (const a of spread(n, base + offset, arc)) {
          const [x, y] = pt(px, py, a, r);
          if (!fits(x, y, size / 2 + 4, area)) break;
          spots.push({ x, y, ang: a });
        }
        if (
          spots.length === n &&
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

/** Farthest the inner lane may orbit the tile: past this it stops reading as the tile's own ring. */
export const LANE1_MAX = 140;

/** `n` bubbles evenly round the whole tile, the first straight up. */
function fullCircle(n: number, px: number, py: number, r: number): Spot[] {
  return Array.from({ length: n }, (_, i) => {
    const ang = -90 + (360 * i) / n;
    const [x, y] = pt(px, py, ang, r);
    return { x, y, ang };
  });
}

/**
 * The inner lane on a circle round the tile, or null when no circle or arc of it fits `area` here.
 *
 * An even circle when there's room; near an edge an arc opening toward the free space, widest
 * first, then narrower ones further out; and when even the narrowest wedge would need a radius
 * past LANE1_MAX (a phone-narrow area), wider arcs reaching round the tile, up to the full circle.
 * Always an arc of one circle centred on the tile - never a row or a column.
 */
export function lane1Arc(n: number, px: number, py: number, area: Rect): Spot[] | null {
  if (!isCramped(px, py, area)) return fullCircle(n, px, py, LANE1);
  const base = baseAngle(px, py, area);
  return arcPlace(
    n,
    base,
    px,
    py,
    area,
    BUB1,
    [LANE1, 84, 100, 118, LANE1_MAX],
    [210, 170, 130, 100, 80, 64, 50, 240, 270, 300, 330, 360],
    [],
    LANE1_MAX,
  );
}

/**
 * Docks a rect (the detail card, or the onboarding ring's smaller "why it's
 * dim" note — see NOTE_W/NOTE_H) clear of the ring, ordered by how close it
 * is to the direction the cursor is already travelling in.
 *
 * `obstacles` is the bubbles actually on screen, not a fixed box around the
 * hub: near an edge a lane can be displaced well outside that box, and a card
 * tested only against the box then lands on the menu. `w`/`h` default to the
 * detail card's own size so every existing caller is unaffected.
 */
export function cardSpot(
  px: number,
  py: number,
  ang: number,
  area: Rect,
  obstacles: Circle[],
  w = CARD_W,
  h = CARD_H,
): { x: number; y: number } {
  const clear = LANE2 + 42;
  const box = { l: px - clear, t: py - clear, r: px + clear, b: py + clear };
  const right = { x: px + clear, y: py - h / 2 };
  const left = { x: px - clear - w, y: py - h / 2 };
  const down = { x: px - w / 2, y: py + clear };
  const up = { x: px - w / 2, y: py - clear - h };
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
  // what a tall card needs when the tile sits near the top or bottom.
  const midY = Math.max(area.top + 8, Math.min(py - h / 2, area.bottom - h - 8));
  const docks = [
    { x: area.left + 8, y: area.top + 8 },
    { x: area.right - w - 8, y: area.top + 8 },
    { x: area.left + 8, y: area.bottom - h - 8 },
    { x: area.right - w - 8, y: area.bottom - h - 8 },
    { x: area.left + 8, y: midY },
    { x: area.right - w - 8, y: midY },
  ].sort(
    (p, q) =>
      Math.hypot(q.x + w / 2 - px, q.y + h / 2 - py) - Math.hypot(p.x + w / 2 - px, p.y + h / 2 - py),
  );
  const inArea = (c: { x: number; y: number }) =>
    c.x >= area.left && c.x + w <= area.right && c.y >= area.top && c.y + h <= area.bottom;
  const boxClash = (c: { x: number; y: number }) =>
    c.x < box.r && c.x + w > box.l && c.y < box.b && c.y + h > box.t;
  const bubbleClash = (c: { x: number; y: number }) =>
    obstacles.length > 0 && !rectClears(c.x + w / 2, c.y + h / 2, w, h, obstacles);

  const candidates = [...order, ...docks];
  for (const c of candidates) if (inArea(c) && !boxClash(c) && !bubbleClash(c)) return c;
  // Nothing fully clear of the ring's bounding box: settle for clearing the
  // bubbles themselves, which is what actually matters visually.
  for (const c of candidates) if (inArea(c) && !bubbleClash(c)) return c;
  if (obstacles.length) {
    const score = (c: { x: number; y: number }) =>
      Math.min(
        ...obstacles.map((o) => {
          const dx = Math.max(Math.abs(o.x - (c.x + w / 2)) - w / 2, 0);
          const dy = Math.max(Math.abs(o.y - (c.y + h / 2)) - h / 2, 0);
          return Math.hypot(dx, dy) - o.r;
        }),
      );
    const usable = candidates.filter(inArea);
    if (usable.length) return usable.reduce((best, c) => (score(c) > score(best) ? c : best));
  }
  return {
    x: clamp(order[0].x, area.left, area.right - w),
    y: clamp(order[0].y, area.top, area.bottom - h),
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
  /**
   * Inner-lane index whose card is up (the root Upgrade / Details bubbles show
   * one while hovered), or null/undefined. Only used while no outer-lane
   * building owns the card.
   */
  lane1CardAnchor?: number | null;
  /**
   * The onboarding ring's flat case (lane2Count === 0) has no category to
   * drill into and so never anchors the usual detail card — but it still
   * wants a persistent explanation card (RingMenu.vue's `note` prop). Only
   * meaningful when lane2Count is 0; ignored otherwise (a drilled-in ring
   * always shows its own detail card instead once something is hovered).
   */
  wantsNote?: boolean;
  /**
   * Size of the whole ring (hub, both lanes, bubbles) as a fraction of full size, 1 by default.
   * Below 1 only where no spot on screen has room for the ring at full size (`ringRoomFor`):
   * the ring gets smaller, never a different shape.
   */
  scale?: number;
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
  /** The error note's position, or null when not requested/applicable. */
  note: { x: number; y: number } | null;
  mode: string;
  /**
   * Both lanes sit on arcs round the tile, at the ring's size, inside `area`: false when the
   * inner lane is an unchecked circle, the buildings an unchecked arc or the inner lane collapsed
   * to dots. `ringRoomFor` finds where the tile has to be, and how big the ring can be, for this
   * to hold.
   */
  fits: boolean;
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

/**
 * `area` as the ring sees it when the whole ring is drawn at `scale`: the same screen area, but
 * measured in ring-sized units round the tile, so a ring shrunk to half size has twice the room.
 */
export function scaledArea(area: Rect, x: number, y: number, scale: number): Rect {
  if (scale === 1) return area;
  return {
    left: x - (x - area.left) / scale,
    top: y - (y - area.top) / scale,
    right: x + (area.right - x) / scale,
    bottom: y + (area.bottom - y) / scale,
  };
}

/**
 * `n` bubbles on an arc of one circle round the tile, with no check against any area: the last
 * resort when not even a shrunk ring has room, so the shape stays a circle however little there is.
 */
function arcAnywhere(n: number, base: number, px: number, py: number, size: number, minRadius: number, arc: number): Spot[] {
  const step = (Math.min(arc, n * 52) / n) * D2R;
  const need = n > 1 ? (size + 6) / (2 * Math.sin(step / 2)) : 0;
  return spread(n, base, arc).map((ang) => {
    const [x, y] = pt(px, py, ang, Math.max(minRadius, need));
    return { x, y, ang };
  });
}

/**
 * Lays out one open ring: always circles round the tile - the inner lane on a circle or an arc
 * of one, the buildings on an arc of a second. Pure: same input, same positions, no DOM.
 *
 * The spots are searched for in `area` as is (`scale` 1) or, for a ring drawn at `scale`, in the
 * area measured in ring units (`scaledArea`) and then moved in towards the tile by `scale`. A
 * ring that does not fit anywhere at its size is the caller's cue to pan the map or to shrink it
 * (`ringRoomFor`); this never changes the ring's shape to make it fit.
 */
export function layoutRing(input: RingLayoutInput): RingLayoutResult {
  const { x, y, area, cardArea, lane1Count, lane2Count, parentIndex, cardAnchor, lane1CardAnchor, wantsNote } = input;
  const scale = input.scale ?? 1;
  const base = baseAngle(x, y, area);
  const ringArea = scaledArea(area, x, y, scale);
  const arc1 = lane1Arc(lane1Count, x, y, ringArea);
  const lane1Raw = arc1 ?? fullCircle(lane1Count, x, y, LANE1);
  const toScreen = (spots: Spot[]): Spot[] =>
    scale === 1 ? spots : spots.map((s) => ({ x: x + (s.x - x) * scale, y: y + (s.y - y) * scale, ang: s.ang }));
  let lane2Full = true;

  let lane2Raw: Spot[] = [];
  let collapsed = false;
  if (lane2Count > 0 && lane1Raw[parentIndex]) {
    const hub: Circle = { x, y, r: HUB / 2 };
    const parentAngle = lane1Raw[parentIndex].ang;
    // The reserved back slot is in here too: children must clear it as well.
    const laneCircles = (r: number) => lane1Raw.map((s) => ({ x: s.x, y: s.y, r }));
    const arcs = (avoid: Circle[]) =>
      arcPlace(lane2Count, parentAngle, x, y, ringArea, BUB2, [LANE2, 140, 162], [90, 68, 50], avoid) ??
      arcPlace(lane2Count, base, x, y, ringArea, BUB2, [LANE2, 140, 162, 184], [120, 90, 68], avoid);

    let spots = arcs([hub, ...laneCircles(BUB1 / 2)]);
    if (!spots) {
      lane2Full = false;
      // Nowhere for two full lanes (a tile deep under a HUD panel): collapse the inner lane to
      // dots rather than drawing both lanes on top of each other. The back slot stays full size -
      // see RingMenu.vue.
      spots = arcs([hub, ...laneCircles(DOT / 2)]);
      collapsed = spots !== null;
    }
    lane2Raw = spots ?? arcAnywhere(lane2Count, parentAngle, x, y, BUB2, LANE2, 90);
  }

  // From here on everything is in screen units: the ring at `scale`.
  const hubR = (HUB / 2) * scale;
  const r1 = (BUB1 / 2) * scale;
  const r2 = (BUB2 / 2) * scale;
  const lane1 = toScreen(lane1Raw);
  const lane2 = toScreen(lane2Raw);

  const lane1Near = nearest(x, y, lane1);
  const showLane1Track = lane1Near.d <= (LANE1 + BUB1) * scale;
  // A displaced lane leaves an empty orbit drawn on the hex with the bubbles
  // floating elsewhere, so the track is suppressed and a leader drawn instead.
  const leader =
    showLane1Track || !lane1Near.p
      ? null
      : (() => {
          const p = lane1Near.p;
          const rad = Math.atan2(p.y - y, p.x - x);
          return {
            x: x + Math.cos(rad) * hubR,
            y: y + Math.sin(rad) * hubR,
            len: Math.max(0, Math.hypot(p.x - x, p.y - y) - hubR - r1),
            deg: rad / D2R,
          };
        })();
  const showLane2Track = lane2.length > 0 && nearest(x, y, lane2).d <= (LANE2 + BUB2) * scale;

  const hubCircle: Circle = { x, y, r: hubR };
  const everything = (): Circle[] => [
    hubCircle,
    ...lane1.map((s) => ({ x: s.x, y: s.y, r: r1 })),
    ...lane2.map((s) => ({ x: s.x, y: s.y, r: r2 })),
  ];
  let card: { x: number; y: number } | null = null;
  let note: { x: number; y: number } | null = null;
  if (lane2.length > 0 && cardAnchor !== null && lane2[cardAnchor]) {
    card = cardSpot(x, y, lane2[cardAnchor].ang, cardArea, everything());
  }
  // A root bubble's own card (Upgrade, Details) docks the way a building's
  // does, in the direction that bubble sits.
  if (!card && lane1CardAnchor !== null && lane1CardAnchor !== undefined && lane1[lane1CardAnchor]) {
    card = cardSpot(x, y, lane1[lane1CardAnchor].ang, cardArea, everything());
  }
  // The note (a rejected
  // build's message) has no bubble to anchor on, so it docks clear of the
  // ring wherever there's room — unless a card is already up.
  if (wantsNote && !card) note = cardSpot(x, y, base, cardArea, everything(), NOTE_W, NOTE_H);

  return {
    lane1,
    lane2,
    collapsed,
    showLane1Track,
    showLane2Track,
    leader,
    card,
    note,
    mode: placementMode(x, y, area),
    fits: arc1 !== null && lane2Full && !collapsed,
  };
}

/** One state a tile's ring can be in: its root actions, or the categories with one of them open. */
export interface RingShape {
  lane1Count: number;
  lane2Count: number;
  parentIndex: number;
}

/**
 * The shapes a tile's ring can take: the root actions, the categories (plus ‹ BACK) with nothing
 * open, and each category open - so a tile moved to fit them stays fit however deep the player drills.
 */
export function ringShapes(rootCount: number, categoryBuildingCounts: number[]): RingShape[] {
  const shapes: RingShape[] = [{ lane1Count: rootCount, lane2Count: 0, parentIndex: -1 }];
  if (categoryBuildingCounts.length) {
    const lane1Count = categoryBuildingCounts.length + 1;
    shapes.push({ lane1Count, lane2Count: 0, parentIndex: -1 });
    categoryBuildingCounts.forEach((count, i) => {
      if (count > 0) shapes.push({ lane1Count, lane2Count: count, parentIndex: i });
    });
  }
  return shapes;
}

/**
 * Smallest ring `ringRoomFor` will draw. Below it the ring would be too small to read or tap;
 * a screen with no room even for that has no use for a ring menu anyway.
 */
export const RING_MIN_SCALE = 0.5;

/**
 * Where the tile has to sit on screen, and how big the ring is, for every one of its ring's
 * `shapes` to fit as arcs round it (`layoutRing(...).fits`): the tile's own spot at full size
 * when it already does, otherwise the nearest spot on a `stepPx` grid over the area that does -
 * so the caller can pan the map that far instead of the ring changing shape. Only when no spot
 * of the area has room for the ring at full size does the whole ring shrink (in steps down to
 * `RING_MIN_SCALE`), keeping its shape. `areaAt` gives the ring's area with the tile at a given
 * x (a landscape phone docks the card on the side away from the tile).
 */
export function ringRoomFor(
  x: number,
  y: number,
  areaAt: (x: number, y: number) => Rect,
  shapes: RingShape[],
  stepPx = 12,
): { x: number; y: number; scale: number } {
  for (let scale = 1; scale >= RING_MIN_SCALE - 1e-9; scale -= 0.1) {
    const room = roomAtScale(x, y, areaAt, shapes, Math.round(scale * 10) / 10, stepPx);
    if (room) return { ...room, scale: Math.round(scale * 10) / 10 };
  }
  return { x, y, scale: RING_MIN_SCALE };
}

function roomAtScale(
  x: number,
  y: number,
  areaAt: (x: number, y: number) => Rect,
  shapes: RingShape[],
  scale: number,
  stepPx: number,
): { x: number; y: number } | null {
  // The inner lane is what rules most spots out, and checking it alone is cheap: those shapes first.
  const ordered = [...shapes].sort((p, q) => p.lane2Count - q.lane2Count || q.lane1Count - p.lane1Count);
  const fitsAt = (px: number, py: number) => {
    const area = areaAt(px, py);
    if (px < area.left || px > area.right || py < area.top || py > area.bottom) return false;
    return ordered.every((s) =>
      s.lane2Count === 0
        ? lane1Arc(s.lane1Count, px, py, scaledArea(area, px, py, scale)) !== null
        : layoutRing({ x: px, y: py, area, cardArea: area, ...s, cardAnchor: null, scale }).fits,
    );
  };
  if (fitsAt(x, y)) return { x, y };
  const a = areaAt(x, y);
  const nearestFirst = (spots: { x: number; y: number }[]) => {
    const seen = new Set<string>();
    return spots
      .filter((s) => !seen.has(`${s.x},${s.y}`) && !!seen.add(`${s.x},${s.y}`))
      .map((s) => ({ ...s, d: Math.hypot(s.x - x, s.y - y) }))
      .sort((p, q) => p.d - q.d);
  };
  // Where a ring fits is, near enough, the area shrunk by some margin on each axis (a full circle
  // needs about LANE1 + BUB1 clear all round; an arc less toward its open side). So first the
  // tile clamped into the area shrunk by each pair of margins - a couple of hundred spots at most,
  // nearest first - and only if none of those fits, every spot of the area on a `stepPx` grid.
  const halfW = (a.right - a.left) / 2;
  const halfH = (a.bottom - a.top) / 2;
  const clamped: { x: number; y: number }[] = [];
  for (let mx = 0; mx <= halfW; mx += stepPx) {
    for (let my = 0; my <= halfH; my += stepPx) {
      clamped.push({ x: clamp(x, a.left + mx, a.right - mx), y: clamp(y, a.top + my, a.bottom - my) });
    }
  }
  for (const s of nearestFirst(clamped)) if (fitsAt(s.x, s.y)) return { x: s.x, y: s.y };
  const grid: { x: number; y: number }[] = [];
  for (let px = a.left; px <= a.right; px += stepPx) {
    for (let py = a.top; py <= a.bottom; py += stepPx) grid.push({ x: px, y: py });
  }
  for (const s of nearestFirst(grid)) if (fitsAt(s.x, s.y)) return { x: s.x, y: s.y };
  return null;
}

/** Width of `word` in em (at a 1px font size), letter spacing not included. */
export type WordEmWidth = (word: string) => number;

/**
 * Rough per-glyph estimate for the UI font's semibold weight (uppercase is
 * wider) — only for environments with no canvas to measure with (unit
 * tests); the browser passes `measureWordEm` below instead.
 */
export const estimateWordEm: WordEmWidth = (word) =>
  [...word].reduce((sum, ch) => sum + (ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? 0.7 : 0.56), 0);

/**
 * Font size for a single-line label inside a round shape of `diameter` px (the ring's hub; the bubbles' labels use
 * `fitBubbleLabel`, which may break long words at hyphens): `basePx`,
 * shrunk just enough that the label's longest word fits on one line.
 * Without it a single long word ("Watchtower", "GRASSLAND", German
 * "Holzfällerhütte") either overflowed the circle or — with
 * `overflow-wrap: anywhere` as the fallback — split mid-word
 * ("Watchtowe"/"r").
 */
export function bubbleLabelFontPx(
  label: string,
  diameter: number,
  basePx: number,
  {
    uppercase = false,
    letterSpacingEm = 0.02,
    minPx = 6,
    // The bubble's own 2px side padding, plus a little for the round edge.
    availablePx = diameter - 6,
    wordEm = estimateWordEm,
  }: { uppercase?: boolean; letterSpacingEm?: number; minPx?: number; availablePx?: number; wordEm?: WordEmWidth } = {},
): number {
  const words = (uppercase ? label.toUpperCase() : label).split(/\s+/).filter(Boolean);
  if (words.length === 0) return basePx;
  const widestEm = Math.max(...words.map((word) => wordEm(word) + [...word].length * letterSpacingEm));
  const fitting = availablePx / widestEm;
  return Math.floor(Math.max(minPx, Math.min(basePx, fitting)) * 10) / 10;
}

/**
 * Shrinks `startPx` until the widest of `words` fits `availablePx`, using `widthAt(word, px)` - the real width of
 * that word at that font size, however the caller measures it (the DOM at the bubble's own font in RingMenu). The
 * estimate in `bubbleLabelFontPx` is only a first guess; a font that is wider than the guess (a fallback face, a web
 * font that loaded late, another browser's hinting) is caught here, so no word ever splits mid-word. Glyph widths
 * scale with the size, so a few proportional steps settle it; it stops at `minPx`.
 */
export function shrinkToFit(
  words: readonly string[],
  availablePx: number,
  startPx: number,
  widthAt: (word: string, px: number) => number,
  minPx = 5,
): number {
  let px = startPx;
  for (let step = 0; step < 6 && px > minPx; step++) {
    const widest = Math.max(0, ...words.map((word) => widthAt(word, px)));
    if (widest <= availablePx) break;
    // Strictly smaller each time (the 0.1 floor-rounding), so it always ends.
    px = Math.max(minPx, Math.min(px - 0.1, Math.floor(((px * availablePx) / widest) * 10) / 10));
  }
  return px;
}

/** Smallest font a ring bubble's label is ever set in; below it a name is not readable on a phone. */
export const BUBBLE_LABEL_MIN_PX = 7;

export interface BubbleLabelFit {
  /** The font size to set. */
  px: number;
  /** The label to render: words that do not fit a line alone carry soft hyphens, the rest are untouched. */
  text: string;
  /** False when even `minPx` leaves the label too tall or a piece wider than the bubble. */
  fits: boolean;
}

/**
 * Font size and text for a label in a round bubble. A label stays at `startPx` when it fits on up to two lines
 * (three when the name has spaces, e.g. "Schrein der Freyja") with its too-wide words broken at hyphenation
 * points ("Waffen-" / "schmiede"); only when that does not fit is the font shrunk, never below `minPx`. A word
 * is only hyphenated when it is wider than a line by itself, so "Great Storehouse" never becomes "Great Sto-".
 * The browser is asked through the two callbacks (the DOM at the bubble's own font in RingMenu):
 * `widthAt(word, px)` is a word's width on one line, `linesAt(text, px)` the number of lines the text takes in
 * the bubble's width, or Infinity when a piece (no break point) is wider than the bubble.
 */
export function fitBubbleLabel(
  label: string,
  startPx: number,
  {
    widthAt,
    linesAt,
    availablePx,
    hyphenate,
    minPx = BUBBLE_LABEL_MIN_PX,
  }: {
    widthAt: (word: string, px: number) => number;
    linesAt: (text: string, px: number) => number;
    availablePx: number;
    hyphenate: (word: string) => string;
    minPx?: number;
  },
): BubbleLabelFit {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { px: startPx, text: label, fits: true };
  const maxLines = words.length > 1 ? 3 : 2;
  const evaluate = (px: number): BubbleLabelFit => {
    const text = words.map((word) => (widthAt(word, px) > availablePx ? hyphenate(word) : word)).join(' ');
    return { px, text, fits: linesAt(text, px) <= maxLines };
  };
  const atStart = evaluate(startPx);
  if (atStart.fits || startPx <= minPx) return atStart;
  const atFloor = evaluate(minPx);
  if (!atFloor.fits) return atFloor;
  // Largest size on a 0.1px grid that fits (smaller is never wider, so bisect); the floor always does.
  let best = atFloor;
  let low = Math.round(minPx * 10) + 1;
  let high = Math.round(startPx * 10) - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const tried = evaluate(mid / 10);
    if (tried.fits) {
      best = tried;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}
