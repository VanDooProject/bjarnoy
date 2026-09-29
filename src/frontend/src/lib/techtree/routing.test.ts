// The routing's three promises — one trunk per fan-out, a private lane per
// source, and no line over a card — are invariants of the picture rather than
// of any one link, so most of these assert over the whole real graph.
import { describe, expect, it } from 'vitest';
import catalogue from '../../data/building-catalogue.json';
import type { BuildingDefinitionResponse } from '../../api/types';
import { buildGraph, edgeKey } from './graph';
import { prerequisitesOf } from './nodes';
import { routeEdges, crossesCard, pathD, type RoutedSegment } from './routing';
import {
  BYPASS_Y,
  CARD_H,
  CARD_W,
  COL_PITCH,
  LANE_OFFSET,
  LANE_STEP,
  ROW_PITCH,
  TECH_TREE_LAYOUT,
  columnX,
  rowMid,
  rowY,
} from './layout';

const byType: Record<string, BuildingDefinitionResponse[]> = {};
for (const definition of catalogue.data as BuildingDefinitionResponse[]) {
  (byType[definition.type] ??= []).push(definition);
}
for (const list of Object.values(byType)) list.sort((a, b) => a.level - b.level);

const types = Object.keys(TECH_TREE_LAYOUT);
const graph = buildGraph(types, (type) => prerequisitesOf(byType, type));
const segments = routeEdges(TECH_TREE_LAYOUT, graph);

const isVertical = (s: RoutedSegment) =>
  s.points.length === 2 && s.points[0]![0] === s.points[1]![0] && s.points[0]![1] !== s.points[1]![1];

describe('routeEdges', () => {
  it('routes every edge in the graph', () => {
    const routed = new Set(segments.flatMap((s) => s.keys));

    for (const { from, to } of graph.edges) {
      expect(routed.has(edgeKey(from, to)), `${from} -> ${to} was not routed`).toBe(true);
    }
  });

  it('never draws a line over a card', () => {
    for (const segment of segments) {
      for (let i = 0; i < segment.points.length - 1; i++) {
        const [x0, y0] = segment.points[i]!;
        const [x1, y1] = segment.points[i + 1]!;
        if (y0 !== y1) continue; // verticals live in the gutters, checked below
        expect(
          crossesCard(TECH_TREE_LAYOUT, y0, x0, x1),
          `segment ${JSON.stringify(segment.points)} crosses a card`,
        ).toBe(false);
      }
    }
  });

  it('keeps every vertical inside a column gutter, never over a column of cards', () => {
    for (const segment of segments.filter(isVertical)) {
      const x = segment.points[0]![0];
      const col = Math.floor(x / COL_PITCH);
      expect(x).toBeGreaterThanOrEqual(columnX(col) + CARD_W);
      expect(x).toBeLessThan(columnX(col + 1));
    }
  });

  it('gives each source its own lane, so unrelated branches never share an x', () => {
    const owners = new Map<number, Set<string>>();
    for (const segment of segments.filter(isVertical)) {
      const x = segment.points[0]![0];
      const sources = new Set(segment.keys.map((k) => k.split('>')[0]!));
      const seen = owners.get(x) ?? new Set<string>();
      for (const source of sources) seen.add(source);
      owners.set(x, seen);
    }

    for (const [x, sources] of owners) {
      expect([...sources], `lane ${x} is shared`).toHaveLength(1);
    }
  });

  it('places lanes on the documented pitch', () => {
    for (const segment of segments.filter(isVertical)) {
      const x = segment.points[0]![0];
      const col = Math.floor(x / COL_PITCH);
      const offset = x - (columnX(col) + CARD_W + LANE_OFFSET);
      expect(offset % LANE_STEP).toBe(0);
      expect(offset).toBeGreaterThanOrEqual(0);
    }
  });

  it('emits one trunk for a fan-out, not one line per target', () => {
    // The longhouse feeds every root; it should still leave its card once.
    const longhouseX = columnX(0) + CARD_W;
    const stubs = segments.filter(
      (s) =>
        s.points.length === 2 &&
        s.points[0]![0] === longhouseX &&
        s.keys.every((k) => k.startsWith('longhouse>')),
    );

    expect(stubs).toHaveLength(1);
    expect(stubs[0]!.keys.length).toBeGreaterThan(1);
  });

  it('tags each trunk gap with only the branches travelling through it', () => {
    // Lumberjack is the topmost thing the longhouse chain reaches, so the gap
    // just below the longhouse's own row must not claim it.
    const trunk = segments.filter(
      (s) => isVertical(s) && s.keys.every((k) => k.startsWith('longhouse>')),
    );

    expect(trunk.length).toBeGreaterThan(1);
    for (const segment of trunk) {
      const [, y0] = segment.points[0]!;
      const [, y1] = segment.points[1]!;
      const top = Math.min(y0, y1);
      const bottom = Math.max(y0, y1);
      for (const key of segment.keys) {
        const target = key.split('>')[1]!;
        const targetY = rowY(TECH_TREE_LAYOUT[target]![1]) + CARD_H / 2;
        const sourceY = rowY(TECH_TREE_LAYOUT.longhouse![1]) + CARD_H / 2;
        expect(Math.min(sourceY, targetY)).toBeLessThanOrEqual(top);
        expect(Math.max(sourceY, targetY)).toBeGreaterThanOrEqual(bottom);
      }
    }
  });

  it('runs a lone level target straight across with no trunk at all', () => {
    // Tower's only target is Barracks, on its own row, so their link is one segment.
    const [towerCol, towerRow] = TECH_TREE_LAYOUT.tower!;
    const y = rowY(towerRow) + CARD_H / 2;
    const straight = segments.find((s) => s.keys.includes(edgeKey('tower', 'barracks')));

    expect(straight!.points).toEqual([
      [columnX(towerCol) + CARD_W, y],
      [columnX(towerCol + 1), y],
    ]);
  });

  it('gives a source with a second target one trunk: stub, a vertical in its gutter, a branch each', () => {
    // Barracks feeds Archery Range on its own row and the Weaponsmith one row down.
    const branch = (target: string) =>
      segments.find(
        (s) =>
          s.keys.length === 1 &&
          s.keys[0] === edgeKey('barracks', target) &&
          s.points.length === 2 &&
          s.points[0]![1] === s.points[1]![1],
      );
    const toArchery = branch('archeryrange');
    const toSmithy = branch('smithy');
    const [, smithyRow] = TECH_TREE_LAYOUT.smithy!;

    expect(toArchery).toBeDefined();
    expect(toSmithy).toBeDefined();
    // The Weaponsmith's branch ends level with the Weaponsmith, on its left edge.
    expect(toSmithy!.points.at(-1)).toEqual([columnX(TECH_TREE_LAYOUT.smithy![0]), rowMid(smithyRow)]);
    for (const segment of segments.filter((s) => s.keys.includes(edgeKey('barracks', 'smithy')))) {
      for (const [, y] of segment.points) expect(y).not.toBe(BYPASS_Y);
    }
  });

  it("reuses a chain on the same row instead of routing a far parent separately", () => {
    // A synthetic row rather than a live catalogue chain (every real building
    // has a single feeder now, so no live edge spans more than one column):
    // gamma needs both alpha and beta, and beta already sits between them on
    // the row, with alpha -> beta its own real edge. The alpha -> gamma link
    // should reuse those two hops instead of drawing a third line.
    const rowLayout = { alpha: [0, 0], beta: [1, 0], gamma: [2, 0] } as const;
    const rowGraph = buildGraph(['alpha', 'beta', 'gamma'], (type) =>
      type === 'beta' ? [{ type: 'alpha', level: 1 }]
        : type === 'gamma' ? [{ type: 'alpha', level: 1 }, { type: 'beta', level: 1 }]
          : [],
    );
    const rowSegments = routeEdges(rowLayout, rowGraph);
    const farKey = edgeKey('alpha', 'gamma');

    // Exactly the two hops carry it — alpha -> beta and beta -> gamma — and
    // nothing was drawn just for it.
    const carrying = rowSegments.filter((s) => s.keys.includes(farKey));
    expect(carrying).toHaveLength(2);
    expect(carrying.some((s) => s.keys.includes(edgeKey('alpha', 'beta')))).toBe(true);
    expect(carrying.some((s) => s.keys.includes(edgeKey('beta', 'gamma')))).toBe(true);
  });

  it('is stable across calls, so the picture never reshuffles', () => {
    expect(routeEdges(TECH_TREE_LAYOUT, graph)).toEqual(segments);
  });

  it("routes a distant edge blocked in its source's row as a short dogleg, not a detour under the whole grid", () => {
    // A synthetic layout (no live edge spans more than one column any more):
    // src -> target is two columns and one row down, and a blocker sits in
    // src's own row between them, so the direct same-row approach lane would
    // cross it. Regression coverage for a routing bug where this fell all the
    // way through to the BYPASS_Y fallback (down below every row, across, and
    // back up) instead of the much shorter "drop into src's own gutter
    // immediately" path.
    const dogLayout = { src: [0, 0], blocker: [1, 0], target: [2, 1] } as const;
    const dogGraph = buildGraph(['src', 'blocker', 'target'], (type) =>
      type === 'target' ? [{ type: 'src', level: 1 }] : [],
    );
    const dogSegments = routeEdges(dogLayout, dogGraph);

    const segment = dogSegments.find((s) => s.keys.includes(edgeKey('src', 'target')));
    expect(segment).toBeDefined();
    for (const [, y] of segment!.points) {
      expect(y).not.toBe(BYPASS_Y);
    }
    expect(segment!.points.length).toBeLessThanOrEqual(4);
  });

  it('routes a same-row edge blocked by a card in its own row as a small dip between rows, not a loop under everything', () => {
    // A synthetic three-card row rather than a live catalogue pair, so this
    // regression stays pinned even as the real layout moves cards around:
    // alpha -> omega share a row with an unrelated blocker sitting directly
    // between them — no lane choice makes the direct same-row approach
    // work, since the row itself is the obstacle, and blocker isn't part of
    // any chain alpha -> omega could reuse. Regression coverage for a
    // routing bug where this fell through to the BYPASS_Y fallback: a loop
    // from the row down past every row to the very bottom of the grid and
    // back up, rather than a small kink confined to the gap just past it.
    const miniLayout = { alpha: [0, 0], blocker: [1, 0], omega: [2, 0] } as const;
    const miniGraph = buildGraph(['alpha', 'blocker', 'omega'], (type) =>
      type === 'omega' ? [{ type: 'alpha', level: 1 }] : [],
    );
    const miniSegments = routeEdges(miniLayout, miniGraph);

    const segment = miniSegments.find((s) => s.keys.includes(edgeKey('alpha', 'omega')));
    expect(segment).toBeDefined();
    // Six points: stub right, down into the row gap, across, up into the
    // target's approach lane, right into the target.
    expect(segment!.points).toHaveLength(6);
    const rowMidY = rowMid(miniLayout.alpha[1]);
    for (const [, y] of segment!.points) {
      expect(y).not.toBe(BYPASS_Y);
      // Never more than one row's pitch away from alpha's own row — a small
      // local dip, not a detour spanning the rest of the grid.
      expect(Math.abs(y - rowMidY)).toBeLessThan(ROW_PITCH);
    }
  });
});

describe('crossesCard', () => {
  it('sees a run passing over a card in its own row', () => {
    const [col, row] = TECH_TREE_LAYOUT.pumpkinfarm!;
    const y = rowY(row) + CARD_H / 2;

    expect(crossesCard(TECH_TREE_LAYOUT, y, columnX(col) - 40, columnX(col) + CARD_W + 40)).toBe(true);
  });

  it('lets a run pass between rows, and through an empty cell', () => {
    const [, row] = TECH_TREE_LAYOUT.pumpkinfarm!;

    // The gap below the row's cards.
    expect(crossesCard(TECH_TREE_LAYOUT, rowY(row) + CARD_H + 4, 0, 2000)).toBe(false);
    // Clay Brickworks (row 3, column 1) has nothing behind it: columns 2-4 of
    // its row are empty cells a run can pass straight through.
    const [, clayRow] = TECH_TREE_LAYOUT.claybrickworks!;
    expect(crossesCard(TECH_TREE_LAYOUT, rowMid(clayRow), columnX(2), columnX(4) + CARD_W)).toBe(false);
  });
});

describe('pathD', () => {
  it('writes an SVG polyline', () => {
    expect(pathD([[0, 1], [2, 3]])).toBe('M 0 1 L 2 3');
  });
});
