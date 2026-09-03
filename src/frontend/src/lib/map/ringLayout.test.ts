import { describe, expect, it } from 'vitest';
import {
  BUB1,
  BUB2,
  CARD_H,
  CARD_W,
  DOT,
  HUB,
  layoutRing,
  placementMode,
  type Rect,
  type RingLayoutResult,
} from './ringLayout';

/**
 * The ring menu's placement contract, which the design iterated on precisely
 * because it kept being broken in ways only visible on screen:
 *
 *   1. every bubble is inside the area it was given, and
 *   2. nothing overlaps — not the hub, not another bubble, not the card.
 *
 * The cases below are the seven edge frames from `Tile Menu 2a`'s own gallery
 * plus the anchors reported as broken during that design pass (a tile deep in
 * a corner, and one under a HUD panel — where both lanes used to clamp to the
 * same screen edge and land on top of each other).
 */

interface Circle {
  x: number;
  y: number;
  r: number;
}

function circlesOf(layout: RingLayoutResult, x: number, y: number): Circle[] {
  return [
    { x, y, r: HUB / 2 },
    ...layout.lane1.map((s) => ({ x: s.x, y: s.y, r: (layout.collapsed ? DOT : BUB1) / 2 })),
    ...layout.lane2.map((s) => ({ x: s.x, y: s.y, r: BUB2 / 2 })),
  ];
}

/** Smallest signed gap between any two placed bubbles; negative means they overlap. */
function smallestGap(circles: Circle[]): number {
  let min = Infinity;
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      min = Math.min(min, Math.hypot(circles[i].x - circles[j].x, circles[i].y - circles[j].y) - circles[i].r - circles[j].r);
    }
  }
  return min;
}

/** Signed gap between the card rect and the nearest bubble; negative means it covers one. */
function cardGap(card: { x: number; y: number }, circles: Circle[]): number {
  return Math.min(
    ...circles.map((o) => {
      const dx = Math.max(Math.abs(o.x - (card.x + CARD_W / 2)) - CARD_W / 2, 0);
      const dy = Math.max(Math.abs(o.y - (card.y + CARD_H / 2)) - CARD_H / 2, 0);
      return Math.hypot(dx, dy) - o.r;
    }),
  );
}

function outOfArea(circles: Circle[], area: Rect): Circle[] {
  return circles
    .slice(1) // the hub sits on the tile itself, which may be outside a panel-shrunk area
    .filter((c) => c.x - c.r < area.left || c.x + c.r > area.right || c.y - c.r < area.top || c.y + c.r > area.bottom);
}

/** Gallery frame geometry from `Tile Menu 2a.dc.html`'s own edge-case tab. */
const FRAME: Rect = { left: 16, top: 52, right: 744, bottom: 454 };
const FRAME_CARD: Rect = { left: 8, top: 44, right: 752, bottom: 462 };

const GALLERY: { name: string; x: number; y: number; area?: Rect }[] = [
  { name: 'tile in the open', x: 330, y: 240 },
  { name: 'right screen edge', x: 710, y: 240 },
  { name: 'left screen edge', x: 50, y: 240 },
  { name: 'under the top bar', x: 330, y: 96 },
  { name: 'bottom edge', x: 330, y: 418 },
  { name: 'bottom-right corner', x: 706, y: 414 },
  { name: 'beside the Construction panel', x: 320, y: 240, area: { left: 248, top: 52, right: 744, bottom: 454 } },
];

// Bounds a 1280x720 settlement view actually passes, with every HUD panel
// reserved: 16 + 240 + 12 on the left, 16 + 320 + 12 on the right, TopBar + 12
// on top. See SettlementView's `ringBounds`.
const HUD_BOUNDS: Rect = { left: 268, top: 76, right: 932, bottom: 704 };
const HUD_CARD_BOUNDS: Rect = { left: 16, top: 76, right: 1264, bottom: 704 };

const REPORTED: { name: string; x: number; y: number }[] = [
  // "bottom right corner overlaps resource buildings over resource blob"
  { name: 'deep in the bottom-right corner', x: 926, y: 698 },
  // "i had a similar issue when i clicked really close to the right edge"
  { name: 'hard against the right edge', x: 930, y: 300 },
  // A tile under the right-hand panel strip: the anchor is outside `bounds`
  // entirely, which is what used to clamp both lanes onto the same edge.
  { name: 'under the right-hand panel strip', x: 1100, y: 300 },
  // ...and the same on the left, under the Construction column.
  { name: 'under the Construction column', x: 120, y: 300 },
];

describe('ring layout placement contract', () => {
  for (const frame of [
    ...GALLERY.map((f) => ({ ...f, area: f.area ?? FRAME, cardArea: FRAME_CARD })),
    ...REPORTED.map((f) => ({ ...f, area: HUD_BOUNDS, cardArea: HUD_CARD_BOUNDS })),
  ]) {
    it(`keeps every bubble in bounds and clear of each other: ${frame.name}`, () => {
      // Four categories plus the reserved ‹ BACK slot, with a two-building
      // category open and its first building hovered — the deepest, busiest
      // state the ring ever reaches.
      const layout = layoutRing({
        x: frame.x,
        y: frame.y,
        area: frame.area,
        cardArea: frame.cardArea,
        lane1Count: 5,
        lane2Count: 2,
        parentIndex: 1,
        cardAnchor: 0,
      });

      expect(layout.lane1).toHaveLength(5);
      expect(layout.lane2).toHaveLength(2);
      const circles = circlesOf(layout, frame.x, frame.y);
      expect(outOfArea(circles, frame.area)).toEqual([]);
      expect(smallestGap(circles)).toBeGreaterThanOrEqual(0);
    });

    it(`docks the detail card clear of the ring: ${frame.name}`, () => {
      const layout = layoutRing({
        x: frame.x,
        y: frame.y,
        area: frame.area,
        cardArea: frame.cardArea,
        lane1Count: 5,
        lane2Count: 2,
        parentIndex: 1,
        cardAnchor: 0,
      });

      expect(layout.card).not.toBeNull();
      const card = layout.card!;
      expect(card.x).toBeGreaterThanOrEqual(frame.cardArea.left);
      expect(card.y).toBeGreaterThanOrEqual(frame.cardArea.top);
      expect(card.x + CARD_W).toBeLessThanOrEqual(frame.cardArea.right);
      expect(card.y + CARD_H).toBeLessThanOrEqual(frame.cardArea.bottom);
      expect(cardGap(card, circlesOf(layout, frame.x, frame.y))).toBeGreaterThanOrEqual(0);
    });
  }
});

describe('ring layout behaviour', () => {
  const open = { x: 330, y: 240, area: FRAME, cardArea: FRAME_CARD };

  it('shows no card until a building is actually hovered', () => {
    const layout = layoutRing({ ...open, lane1Count: 5, lane2Count: 2, parentIndex: 1, cardAnchor: null });
    expect(layout.card).toBeNull();
  });

  it('keeps the categories in identical slots when the back slot hands over to lane 2', () => {
    // The inner lane permanently reserves the 5th slot, so drilling into a
    // category must not shuffle the other four out from under the cursor.
    const closed = layoutRing({ ...open, lane1Count: 5, lane2Count: 0, parentIndex: -1, cardAnchor: null });
    const drilled = layoutRing({ ...open, lane1Count: 5, lane2Count: 2, parentIndex: 1, cardAnchor: 0 });
    expect(drilled.lane1).toEqual(closed.lane1);
  });

  it('fans a category’s buildings out beside that category, not around the whole ring', () => {
    const first = layoutRing({ ...open, lane1Count: 5, lane2Count: 2, parentIndex: 0, cardAnchor: null });
    const last = layoutRing({ ...open, lane1Count: 5, lane2Count: 2, parentIndex: 3, cardAnchor: null });
    const near = (children: { x: number; y: number }[], parent: { x: number; y: number }) =>
      Math.max(...children.map((c) => Math.hypot(c.x - parent.x, c.y - parent.y)));
    // Each child is closer to its own parent than to the tile's far side.
    expect(near(first.lane2, first.lane1[0])).toBeLessThan(BUB2 * 3);
    expect(near(last.lane2, last.lane1[3])).toBeLessThan(BUB2 * 3);
    expect(first.lane2).not.toEqual(last.lane2);
  });

  it('draws the orbit tracks around the tile when the ring is not displaced', () => {
    const layout = layoutRing({ ...open, lane1Count: 5, lane2Count: 2, parentIndex: 1, cardAnchor: null });
    expect(layout.showLane1Track).toBe(true);
    expect(layout.leader).toBeNull();
  });

  it('replaces the inner track with a leader when the lane is displaced off the tile', () => {
    // A tile under the right-hand panel strip: the lane cannot orbit the hex,
    // so an orbit drawn there would be an empty ring with the bubbles
    // floating elsewhere.
    const layout = layoutRing({
      x: 1100,
      y: 300,
      area: HUD_BOUNDS,
      cardArea: HUD_CARD_BOUNDS,
      lane1Count: 5,
      lane2Count: 2,
      parentIndex: 1,
      cardAnchor: null,
    });
    expect(layout.showLane1Track).toBe(false);
    expect(layout.leader).not.toBeNull();
  });

  it('opens into the half of the screen that has room', () => {
    expect(placementMode(330, 240, FRAME)).toBe('FULL RING');
    expect(placementMode(710, 240, FRAME)).toBe('OPENS LEFT');
    expect(placementMode(50, 240, FRAME)).toBe('OPENS RIGHT');
    expect(placementMode(330, 96, FRAME)).toBe('OPENS DOWN');
    expect(placementMode(330, 418, FRAME)).toBe('OPENS UP');
  });
});
