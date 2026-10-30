import { describe, expect, it } from 'vitest';
import {
  bubbleLabelFontPx,
  BUB1,
  BUB2,
  CARD_H,
  CARD_W,
  DOT,
  HUB,
  LANE1_MAX,
  layoutRing,
  NOTE_H,
  NOTE_W,
  placementMode,
  ringRoomFor,
  ringShapes,
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

// Reported on an Android phone in portrait (~412x915): the six build categories
// plus ‹ BACK opened as ONE straight row across the screen, the last bubble
// clipped by the right edge. The area MapView hands a portrait phone is narrow
// (64px queue handle on the left, the docked card strip at the bottom).
// arcPlace's `need` radius was sized for n-1 gaps while spread seats n, so it
// always failed its own spacing check, and with the fixed radii too small for a
// narrow wedge the lane fell through to a straight row of 7 x 58px = 404px.
// The ring is a circle round its tile, always: an arc of one circle when that
// fits here, and where nothing does, MapView pans the tile to the spot
// `ringRoomFor` finds.
describe('ring layout on a phone', () => {
  // MapView's ringBounds on a portrait phone: left 64, the 64px HUD bar on top (+12), the bottom dock strip (236 + 8) below.
  const PHONES = [
    { name: '360x740', w: 360, h: 740 },
    { name: '390x844', w: 390, h: 844 },
    { name: '412x915', w: 412, h: 915 },
  ].map((p) => ({ ...p, area: { left: 64, top: 76, right: p.w - 16, bottom: p.h - 236 - 8 } }));
  // Root actions, then six categories (+ ‹ BACK) holding 3, 5, 4, 4, 3 and 2 buildings.
  const SHAPES = ringShapes(4, [3, 5, 4, 4, 3, 2]);

  const radiusSpread = (spots: { x: number; y: number }[], x: number, y: number) => {
    const radii = spots.map((s) => Math.hypot(s.x - x, s.y - y));
    return Math.max(...radii) - Math.min(...radii);
  };

  it('lists the root ring, the categories and each category opened as the shapes to make room for', () => {
    expect(ringShapes(3, [2, 0, 4])).toEqual([
      { lane1Count: 3, lane2Count: 0, parentIndex: -1 },
      { lane1Count: 4, lane2Count: 0, parentIndex: -1 },
      { lane1Count: 4, lane2Count: 2, parentIndex: 0 },
      { lane1Count: 4, lane2Count: 4, parentIndex: 2 },
    ]);
    expect(ringShapes(3, [])).toEqual([{ lane1Count: 3, lane2Count: 0, parentIndex: -1 }]);
  });

  it('says it does not fit wherever the inner lane is not an arc of one circle round the tile, so the map moves the tile', () => {
    const { area } = PHONES[2];
    // Includes the reported spot (206, 640: low on the screen, just above the dock) and spots off the area entirely.
    for (let x = 0; x <= 412; x += 24) {
      for (let y = 0; y <= 915; y += 24) {
        const layout = layoutRing({ x, y, area, cardArea: area, lane1Count: 7, lane2Count: 0, parentIndex: -1, cardAnchor: null });
        if (layout.fits) expect(radiusSpread(layout.lane1, x, y), `${x},${y}`).toBeLessThan(0.5);
        if (layout.fits) expect(Math.hypot(layout.lane1[0].x - x, layout.lane1[0].y - y), `${x},${y}`).toBeLessThanOrEqual(LANE1_MAX + 0.5);
      }
    }
    expect(layoutRing({ x: 206, y: 640, area, cardArea: area, lane1Count: 7, lane2Count: 0, parentIndex: -1, cardAnchor: null }).fits).toBe(false);
  });

  it('seats seven bubbles on an arc when the arc only fits at a radius beyond the fixed ones', () => {
    // 412x915, a hex in the upper left of the area: before, the only radius big enough was `need`, which always failed.
    const { area } = PHONES[2];
    const layout = layoutRing({ x: 160, y: 200, area, cardArea: area, lane1Count: 7, lane2Count: 0, parentIndex: -1, cardAnchor: null });
    expect(layout.fits).toBe(true);
    expect(radiusSpread(layout.lane1, 160, 200)).toBeLessThan(0.5);
  });

  it('leaves a tile whose ring already fits where it is', () => {
    const { area } = PHONES[2];
    expect(ringRoomFor(230, 360, () => area, SHAPES)).toEqual({ x: 230, y: 360 });
  });

  it('moves the reported tile (low on the screen, above the dock) up to where its ring fits', () => {
    const { area } = PHONES[2];
    expect(layoutRing({ x: 206, y: 640, area, cardArea: area, lane1Count: 7, lane2Count: 0, parentIndex: -1, cardAnchor: null }).fits).toBe(false);
    const room = ringRoomFor(206, 640, () => area, SHAPES)!;
    expect(room).not.toBeNull();
    expect(room.y).toBeLessThan(640);
    expect(Math.hypot(room.x - 206, room.y - 640)).toBeLessThan(140);
  });

  for (const phone of PHONES) {
    it(`opens every shape of the ring as circles, inside the area and clear of each other, from any tile on a ${phone.name} screen`, () => {
      const bad: string[] = [];
      for (let x = 0; x <= phone.w; x += 56) {
        for (let y = 0; y <= phone.h; y += 56) {
          const room = ringRoomFor(x, y, () => phone.area, SHAPES);
          if (!room) {
            bad.push(`${x},${y}: no room anywhere`);
            continue;
          }
          for (const shape of SHAPES) {
            const layout = layoutRing({ x: room.x, y: room.y, area: phone.area, cardArea: phone.area, ...shape, cardAnchor: null });
            const circles = circlesOf(layout, room.x, room.y);
            const where = `${x},${y} -> ${room.x},${room.y} ${JSON.stringify(shape)}`;
            if (!layout.fits) bad.push(`${where}: does not fit`);
            else if (radiusSpread(layout.lane1, room.x, room.y) >= 0.5) bad.push(`${where}: inner lane not on a circle`);
            else if (layout.lane2.length && radiusSpread(layout.lane2, room.x, room.y) >= 0.5) bad.push(`${where}: buildings not on a circle`);
            else if (outOfArea(circles, phone.area).length) bad.push(`${where}: outside the area`);
            else if (smallestGap(circles) < 0) bad.push(`${where}: overlapping`);
          }
        }
      }
      expect(bad.slice(0, 10), `${bad.length} bad placements`).toEqual([]);
    }, 30_000); // a few hundred tile spots, each searched for room: seconds of pure layout maths, not waiting
  }
});

// A root bubble (Upgrade, Details) shows its own card while hovered: it has no
// lane2 building to anchor on, so the card docks off that bubble's lane1 spot.
describe('ring layout root-bubble card', () => {
  const open = { x: 330, y: 240, area: FRAME, cardArea: FRAME_CARD };
  const input = { ...open, lane1Count: 4, lane2Count: 0, parentIndex: -1, cardAnchor: null };

  it('shows no card unless a root bubble is anchored', () => {
    expect(layoutRing(input).card).toBeNull();
  });

  it('docks a card clear of the ring and inside cardArea for each root bubble', () => {
    for (let i = 0; i < 4; i++) {
      const layout = layoutRing({ ...input, lane1CardAnchor: i });
      expect(layout.card, `bubble ${i}`).not.toBeNull();
      const card = layout.card!;
      expect(card.x).toBeGreaterThanOrEqual(FRAME_CARD.left);
      expect(card.y).toBeGreaterThanOrEqual(FRAME_CARD.top);
      expect(card.x + CARD_W).toBeLessThanOrEqual(FRAME_CARD.right);
      expect(card.y + CARD_H).toBeLessThanOrEqual(FRAME_CARD.bottom);
      expect(cardGap(card, circlesOf(layout, open.x, open.y)), `bubble ${i}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('docks the rejected-build note even though a drilled ring has buildings, when nothing is hovered', () => {
    const layout = layoutRing({ ...input, lane2Count: 2, parentIndex: 1, wantsNote: true });
    expect(layout.card).toBeNull();
    expect(layout.note).not.toBeNull();
  });
});

// The onboarding ring is flat (lane2Count === 0, no category to drill into)
// but still wants a persistent "why it's dim" note docked clear of the ring
// — unlike the detail card above, which only ever appears once a lane2
// building is hovered (lane2Count > 0).
describe('ring layout note (flat onboarding ring)', () => {
  const open = { x: 330, y: 240, area: FRAME, cardArea: FRAME_CARD };

  it('shows no note unless the caller actually wants one', () => {
    const layout = layoutRing({ ...open, lane1Count: 5, lane2Count: 0, parentIndex: -1, cardAnchor: null });
    expect(layout.note).toBeNull();
  });

  it('shows no note for a drilled-in ring even if wantsNote is set — that ring has its own card instead', () => {
    const layout = layoutRing({
      ...open,
      lane1Count: 5,
      lane2Count: 2,
      parentIndex: 1,
      cardAnchor: 0,
      wantsNote: true,
    });
    expect(layout.note).toBeNull();
    expect(layout.card).not.toBeNull();
  });

  for (const frame of [
    ...GALLERY.map((f) => ({ ...f, area: f.area ?? FRAME, cardArea: FRAME_CARD })),
    ...REPORTED.map((f) => ({ ...f, area: HUD_BOUNDS, cardArea: HUD_CARD_BOUNDS })),
  ]) {
    it(`docks the note clear of the ring and inside cardArea: ${frame.name}`, () => {
      const layout = layoutRing({
        x: frame.x,
        y: frame.y,
        area: frame.area,
        cardArea: frame.cardArea,
        lane1Count: 5,
        lane2Count: 0,
        parentIndex: -1,
        cardAnchor: null,
        wantsNote: true,
      });
      expect(layout.note).not.toBeNull();
      const note = layout.note!;
      expect(note.x).toBeGreaterThanOrEqual(frame.cardArea.left);
      expect(note.y).toBeGreaterThanOrEqual(frame.cardArea.top);
      expect(note.x + NOTE_W).toBeLessThanOrEqual(frame.cardArea.right);
      expect(note.y + NOTE_H).toBeLessThanOrEqual(frame.cardArea.bottom);

      const circles = [
        { x: frame.x, y: frame.y, r: HUB / 2 },
        ...layout.lane1.map((s) => ({ x: s.x, y: s.y, r: (layout.collapsed ? DOT : BUB1) / 2 })),
      ];
      const gap = Math.min(
        ...circles.map((o) => {
          const dx = Math.max(Math.abs(o.x - (note.x + NOTE_W / 2)) - NOTE_W / 2, 0);
          const dy = Math.max(Math.abs(o.y - (note.y + NOTE_H / 2)) - NOTE_H / 2, 0);
          return Math.hypot(dx, dy) - o.r;
        }),
      );
      expect(gap).toBeGreaterThanOrEqual(0);
    });
  }
});

describe('bubbleLabelFontPx', () => {
  it('keeps the base size for a label whose words already fit', () => {
    expect(bubbleLabelFontPx('Farm', BUB2, 9.4)).toBe(9.4);
    expect(bubbleLabelFontPx('Send army here', BUB1, 8.2)).toBe(8.2);
  });

  it('shrinks a long single word until it fits the bubble instead of splitting it', () => {
    const size = bubbleLabelFontPx('Watchtower', BUB2, 8.4);
    expect(size).toBeLessThan(8.4);
    expect(size).toBeGreaterThan(6.5);
  });

  it('accounts for uppercase and letter spacing (the hub label)', () => {
    const upper = bubbleLabelFontPx('Longhouse', HUB, 10.5, { uppercase: true, letterSpacingEm: 0.06 });
    const lower = bubbleLabelFontPx('Longhouse', HUB, 10.5);
    expect(upper).toBeLessThan(10.5);
    expect(upper).toBeLessThan(lower);
  });

  it('sizes by the measured width when one is given, not the estimate', () => {
    const wide = bubbleLabelFontPx('Grassland', HUB, 10.5, { wordEm: (w) => w.length * 0.9 });
    const narrow = bubbleLabelFontPx('Grassland', HUB, 10.5, { wordEm: (w) => w.length * 0.5 });
    expect(wide).toBeLessThan(narrow);
    expect(9 * (0.9 + 0.02) * wide).toBeLessThanOrEqual(HUB - 6);
  });

  it('never goes below the readable floor', () => {
    expect(bubbleLabelFontPx('Holzfällerhüttenerweiterung', BUB2, 9)).toBe(6.5);
  });
});
