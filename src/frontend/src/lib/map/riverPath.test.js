import { describe, expect, it } from 'vitest';
import { isoGridPosition, isoTopPoints } from '../hex/geometry';
import { bogCreekPathFor, riverPathFor } from './riverPath';
const W = 200;
const H = 150;
const ORIGIN = { q: 0, r: 0 };
// Direction E's neighbour — shares ORIGIN's edge on that side.
const EAST_NEIGHBOR = { q: 1, r: 0 };
function riverTile(overrides) {
    return { q: 0, r: 0, shape: 'straight', inDirections: [], outDirection: null, ...overrides };
}
function approxEqual(a, b) {
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
}
describe('riverPathFor', () => {
    it('meets a neighbouring tile at the same point on their shared edge', () => {
        // ORIGIN flows out E; EAST_NEIGHBOR flows in from W (its own edge facing ORIGIN).
        const originTile = riverTile({ shape: 'straight', inDirections: ['W'], outDirection: 'E' });
        const neighborTile = riverTile({ q: 1, r: 0, shape: 'straight', inDirections: ['W'], outDirection: 'E' });
        const originDrawing = riverPathFor(ORIGIN, originTile, null, W, H);
        const neighborDrawing = riverPathFor(EAST_NEIGHBOR, neighborTile, null, W, H);
        const originExit = originDrawing.segments[0].to;
        const neighborEntry = neighborDrawing.segments[0].from;
        approxEqual(originExit, neighborEntry);
    });
    it('spring has no inflow segment, a pond dot at centre, and one outflow leg', () => {
        const tile = riverTile({ shape: 'spring', inDirections: [], outDirection: 'SE' });
        const drawing = riverPathFor(ORIGIN, tile, null, W, H);
        expect(drawing.segments).toHaveLength(1);
        expect(drawing.springDot).toBeDefined();
        const grid = isoGridPosition(ORIGIN, W, H);
        const center = { x: grid.x + W / 2, y: grid.y + H / 2 };
        approxEqual(drawing.springDot, center);
        approxEqual(drawing.segments[0].from, center);
        approxEqual(drawing.segments[0].control, center);
    });
    it('straight produces one segment from its inflow edge to its outflow edge', () => {
        const tile = riverTile({ shape: 'straight', inDirections: ['W'], outDirection: 'E' });
        const drawing = riverPathFor(ORIGIN, tile, null, W, H);
        expect(drawing.segments).toHaveLength(1);
        expect(drawing.springDot).toBeUndefined();
    });
    it('bend produces one segment between two non-opposite edges', () => {
        const tile = riverTile({ shape: 'bend', inDirections: ['NW'], outDirection: 'SE' });
        const drawing = riverPathFor(ORIGIN, tile, null, W, H);
        expect(drawing.segments).toHaveLength(1);
        const { from, to } = drawing.segments[0];
        expect(from).not.toEqual(to);
    });
    it('confluence produces one segment per inflow, all sharing the same outflow point', () => {
        const tile = riverTile({ shape: 'confluence', inDirections: ['NW', 'W'], outDirection: 'SE' });
        const drawing = riverPathFor(ORIGIN, tile, null, W, H);
        expect(drawing.segments).toHaveLength(2);
        approxEqual(drawing.segments[0].to, drawing.segments[1].to);
    });
    it('mouth with no out direction falls back to the resolved sea direction', () => {
        const tile = riverTile({ shape: 'mouth', inDirections: ['W'], outDirection: null });
        const drawing = riverPathFor(ORIGIN, tile, 'E', W, H);
        expect(drawing.segments).toHaveLength(1);
        const grid = isoGridPosition(ORIGIN, W, H);
        const top = isoTopPoints(W, H).map((p) => ({ x: grid.x + p.x, y: grid.y + p.y }));
        // E is edge index (3-0)%6 = 3.
        const expectedExit = { x: (top[3].x + top[4].x) / 2, y: (top[3].y + top[4].y) / 2 };
        approxEqual(drawing.segments[0].to, expectedExit);
    });
    it('mouth with no resolvable sea direction stops at the hex centre', () => {
        const tile = riverTile({ shape: 'mouth', inDirections: ['W'], outDirection: null });
        const drawing = riverPathFor(ORIGIN, tile, null, W, H);
        expect(drawing.segments).toHaveLength(1);
        const grid = isoGridPosition(ORIGIN, W, H);
        const center = { x: grid.x + W / 2, y: grid.y + H / 2 };
        approxEqual(drawing.segments[0].to, center);
    });
});
describe('bogCreekPathFor', () => {
    function bogTile(overrides) {
        return { q: 0, r: 0, kind: 'creek', inDirections: [], outDirection: null, waterEdges: [], ...overrides };
    }
    it('carries a river on into the bog: the creek meets the river tile before it on their shared edge', () => {
        // The river ends on ORIGIN flowing out E; the bog's first creek tile is EAST_NEIGHBOR, flowing in from W.
        const river = riverPathFor(ORIGIN, riverTile({ inDirections: ['W'], outDirection: 'E' }), null, W, H);
        const creek = bogCreekPathFor(EAST_NEIGHBOR, bogTile({ q: 1, r: 0, inDirections: ['W'], outDirection: 'E' }), W, H);
        expect(creek).not.toBeNull();
        approxEqual(river.segments[0].to, creek.segments[0].from);
    });
    it('draws a lake mouth from its inflow to its outflow edge', () => {
        const mouth = bogTile({ kind: 'mouth', inDirections: ['E'], outDirection: 'W', waterEdges: ['W'] });
        const drawing = bogCreekPathFor(ORIGIN, mouth, W, H);
        const asRiver = riverPathFor(ORIGIN, riverTile({ inDirections: ['E'], outDirection: 'W' }), null, W, H);
        expect(drawing.segments).toEqual(asRiver.segments);
        expect(drawing.springDot).toBeUndefined();
    });
    it('draws a creek spring as a pond dot with one outflow leg', () => {
        const drawing = bogCreekPathFor(ORIGIN, bogTile({ kind: 'creekspring', outDirection: 'SE' }), W, H);
        expect(drawing.segments).toHaveLength(1);
        expect(drawing.springDot).toBeDefined();
    });
    it.each(['bog', 'lake', 'inlet', 'shore', 'half'])('draws nothing on a %s tile', (kind) => {
        expect(bogCreekPathFor(ORIGIN, bogTile({ kind, waterEdges: kind === 'bog' || kind === 'lake' ? [] : ['W'] }), W, H)).toBeNull();
    });
});
