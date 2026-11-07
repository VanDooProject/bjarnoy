import { describe, expect, it } from 'vitest';
import { isoTopPoints } from '../hex/geometry';
import { splitBorderEdges } from './realmBorderEdges';
const ALL_EDGES = [0, 1, 2, 3, 4, 5].map((i) => [i, (i + 1) % 6]);
describe('splitBorderEdges', () => {
    it('puts the upper-left, top and upper-right edges at the back', () => {
        expect(splitBorderEdges(ALL_EDGES).back).toEqual([
            [0, 1],
            [1, 2],
            [2, 3],
        ]);
    });
    it('puts the lower-right, bottom and lower-left edges at the front', () => {
        expect(splitBorderEdges(ALL_EDGES).front).toEqual([
            [3, 4],
            [4, 5],
            [5, 0],
        ]);
    });
    it('agrees with the geometry: every front edge lies below every back edge', () => {
        const pts = isoTopPoints(200, 100);
        const midY = ([a, b]) => (pts[a].y + pts[b].y) / 2;
        const { back, front } = splitBorderEdges(ALL_EDGES);
        expect(Math.max(...back.map(midY))).toBeLessThan(Math.min(...front.map(midY)));
    });
    it('keeps a partial realm outline intact and loses no edge', () => {
        const partial = [
            [1, 2],
            [4, 5],
        ];
        const { back, front } = splitBorderEdges(partial);
        expect(back).toEqual([[1, 2]]);
        expect(front).toEqual([[4, 5]]);
    });
});
