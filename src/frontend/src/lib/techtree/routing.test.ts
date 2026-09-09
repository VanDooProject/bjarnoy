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
  CARD_H,
  CARD_W,
  COL_PITCH,
  LANE_OFFSET,
  LANE_STEP,
  TECH_TREE_LAYOUT,
  columnX,
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
    // Sawmill is the topmost thing the longhouse chain reaches, so the gap
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

  it('runs a level target straight across with no trunk at all', () => {
    // Barracks and archery range share a row, so their link is one segment.
    const [barracksCol, barracksRow] = TECH_TREE_LAYOUT.barracks!;
    const y = rowY(barracksRow) + CARD_H / 2;
    const straight = segments.find((s) => s.keys.includes(edgeKey('barracks', 'archeryrange')));

    expect(straight!.points).toEqual([
      [columnX(barracksCol) + CARD_W, y],
      [columnX(barracksCol + 1), y],
    ]);
  });

  it("reuses a multi-parent capstone's own row instead of routing its far parent separately", () => {
    // Shrine of Thor needs both Barracks and Archery Range, which already sit
    // adjacent on Shrine of Thor's own row (Barracks -> Archery Range is its
    // own real edge) — the Barracks -> Shrine of Thor link should reuse that
    // exact run and the Archery Range -> Shrine of Thor leaf, rather than
    // drawing a third line of its own.
    const barracksToShrine = edgeKey('barracks', 'shrineofthor');
    const barracksToArchery = segments.find((s) => s.keys.includes(edgeKey('barracks', 'archeryrange')));
    const archeryToShrine = segments.find((s) => s.keys.includes(edgeKey('archeryrange', 'shrineofthor')));

    expect(barracksToArchery!.keys).toContain(barracksToShrine);
    expect(archeryToShrine!.keys).toContain(barracksToShrine);
    // No separate line was drawn just for it.
    expect(segments.filter((s) => s.keys.includes(barracksToShrine))).toHaveLength(2);
  });

  it('is stable across calls, so the picture never reshuffles', () => {
    expect(routeEdges(TECH_TREE_LAYOUT, graph)).toEqual(segments);
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
    // Column 2, row 0 is empty by design — the lane Lumberjack -> Sawmill
    // (column 1 to column 3) runs through, since Sawmill sits a column
    // further out than its one real hop from Lumberjack would suggest.
    const [sawmillCol, sawmillRow] = TECH_TREE_LAYOUT.sawmill!;
    expect(
      crossesCard(TECH_TREE_LAYOUT, rowY(sawmillRow) + CARD_H / 2, columnX(sawmillCol - 1), columnX(sawmillCol)),
    ).toBe(false);
  });
});

describe('pathD', () => {
  it('writes an SVG polyline', () => {
    expect(pathD([[0, 1], [2, 3]])).toBe('M 0 1 L 2 3');
  });
});
