import { describe, expect, it } from 'vitest';
import { arrowPieces, ringBubbleAim } from './guidanceArrowGeometry';
import { placeChip, type Box } from './guidanceChipPlacement';
import { BUB1, BUB2, HUB, layoutRing, ringRoomFor, ringShapes, type RingShape } from './ringLayout';

// The onboarding ring's guide chip must never cover a ring bubble - not the one the arrow names, not its
// neighbours - on any screen, at any of the three steps (Build, a category, a building).
describe('placeChip beside the onboarding ring', () => {
  const SCREENS = [
    { w: 320, h: 568, compact: true },
    { w: 390, h: 844, compact: true },
    { w: 1280, h: 800, compact: false },
  ];
  // The longest label of the three steps, at the phone chip's size.
  const CHIP_SIZE = { width: 200, height: 26 };
  const STEPS: { name: string; shape: RingShape; target: 'lane1' | 'lane2' }[] = [
    { name: 'Open Build', shape: { lane1Count: 1, lane2Count: 0, parentIndex: -1 }, target: 'lane1' },
    { name: 'Open Resource', shape: { lane1Count: 4, lane2Count: 0, parentIndex: -1 }, target: 'lane1' },
    { name: 'Build the Reindeer Herder', shape: { lane1Count: 4, lane2Count: 3, parentIndex: 0 }, target: 'lane2' },
  ];

  for (const screen of SCREENS) {
    for (const step of STEPS) {
      it(`covers no bubble at "${step.name}" on ${screen.w}x${screen.h}`, () => {
        const area = { left: 16, top: 12, right: screen.w - 16, bottom: screen.compact ? screen.h - 236 - 8 : screen.h - 16 };
        const shapes = ringShapes(1, [3, 3, 3]);
        const safe: Box = { left: 8, top: 8, right: screen.w - 8, bottom: screen.h - 8 };
        const bad: string[] = [];
        for (const fx of [0.2, 0.5, 0.8]) {
          for (const fy of [0.2, 0.5, 0.8]) {
            const room = ringRoomFor(screen.w * fx, screen.h * fy, () => area, shapes);
            const layout = layoutRing({ ...room, area, cardArea: area, ...step.shape, cardAnchor: null });
            const hub = { x: room.x, y: room.y };
            const circles = [
              { id: 'hub', ...hub, r: (HUB / 2) * room.scale },
              ...layout.lane1.map((s, i) => ({ id: `l1-${i}`, x: s.x, y: s.y, r: (BUB1 / 2) * room.scale })),
              ...layout.lane2.map((s, i) => ({ id: `l2-${i}`, x: s.x, y: s.y, r: (BUB2 / 2) * room.scale })),
            ];
            const target = circles.find((c) => c.id === (step.target === 'lane1' ? 'l1-0' : 'l2-0'))!;
            const aim = ringBubbleAim(hub, target, circles.filter((c) => c !== target), area);
            const rad = (aim.angle * Math.PI) / 180;
            const tail = { x: Math.sin(rad), y: -Math.cos(rad) };
            const reach = aim.targetRadius + aim.gap;
            const tip = { x: target.x + tail.x * reach, y: target.y + tail.y * reach };
            const pts = arrowPieces(tip, tail, aim.scale).flat();
            const arrow: Box = {
              left: Math.min(...pts.map((p) => p.x)),
              top: Math.min(...pts.map((p) => p.y)),
              right: Math.max(...pts.map((p) => p.x)),
              bottom: Math.max(...pts.map((p) => p.y)),
            };
            const placed = placeChip(arrow, CHIP_SIZE, safe, screen.compact ? 'above' : 'left', undefined, circles);
            const rect = { left: placed.x, top: placed.y, right: placed.x + CHIP_SIZE.width, bottom: placed.y + CHIP_SIZE.height };
            const where = `tile ${Math.round(room.x)},${Math.round(room.y)}`;
            for (const c of circles) {
              const nx = Math.min(Math.max(c.x, rect.left), rect.right);
              const ny = Math.min(Math.max(c.y, rect.top), rect.bottom);
              if (Math.hypot(c.x - nx, c.y - ny) < c.r) bad.push(`${where}: chip covers ${c.id}`);
            }
            if (rect.left < safe.left || rect.right > safe.right || rect.top < safe.top || rect.bottom > safe.bottom) {
              bad.push(`${where}: off screen`);
            }
          }
        }
        expect(bad).toEqual([]);
      });
    }
  }

  it('keeps its usual side when no avoid circle is in the way', () => {
    const arrow: Box = { left: 400, top: 400, right: 460, bottom: 460 };
    const safe: Box = { left: 0, top: 0, right: 1000, bottom: 1000 };
    const size = { width: 100, height: 30 };
    expect(placeChip(arrow, size, safe, 'above', 4, [{ x: 100, y: 100, r: 26 }])).toEqual(placeChip(arrow, size, safe, 'above', 4));
  });
});
