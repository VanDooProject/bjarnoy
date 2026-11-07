// The river flow shader trusts `outDirection` as "downstream" (docs/design/water-shader.md §4.4e). This pins the data: on the
// generated islands of the shared golden fixture every tile's out direction leads into a tile that takes the water in.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/bog-generation-golden.json';
import { coordKey, neighbors } from '../hex/coords';
import { TILE_ORIENTATIONS } from './types';
const fixture = goldenFixtureJson;
const opposite = (i) => TILE_ORIENTATIONS[(i + 3) % 6];
describe('outDirection is downstream on generated islands', () => {
    it.each(fixture.scenarios)('$name: every out direction leads into a tile that takes the water in', (scenario) => {
        const terrain = new Map(scenario.tiles.map(([q, r, t]) => [coordKey({ q, r }), t]));
        const rivers = new Map(scenario.rivers.map((t) => [coordKey(t), t]));
        const bogs = new Map(scenario.bogs.map((t) => [coordKey(t), t]));
        const next = (c, i) => neighbors(c)[i];
        // Rivers and bog creeks join each other, so a tile of either kind can be the one downstream.
        const takesIn = (key, side) => {
            const t = rivers.get(key) ?? bogs.get(key);
            return t !== undefined && ('kind' in t && t.kind === 'lake' ? true : t.inDirections.includes(side));
        };
        const bad = [];
        for (const tile of scenario.rivers) {
            if (!tile.outDirection)
                continue;
            const i = TILE_ORIENTATIONS.indexOf(tile.outDirection);
            const key = coordKey(next(tile, i));
            const sea = (terrain.get(key) ?? 'sea') === 'sea';
            if (!(takesIn(key, opposite(i)) || sea))
                bad.push(`river ${coordKey(tile)} ${tile.shape} out ${tile.outDirection}`);
        }
        for (const tile of scenario.bogs) {
            if (!tile.outDirection)
                continue;
            const i = TILE_ORIENTATIONS.indexOf(tile.outDirection);
            if (!takesIn(coordKey(next(tile, i)), opposite(i)))
                bad.push(`bog ${coordKey(tile)} ${tile.kind} out ${tile.outDirection}`);
        }
        expect(bad).toEqual([]);
    });
    it('covers tiles with an out direction', () => {
        expect(fixture.scenarios.flatMap((s) => s.rivers).filter((t) => t.outDirection).length).toBeGreaterThan(20);
        expect(fixture.scenarios.flatMap((s) => s.bogs).filter((t) => t.outDirection).length).toBeGreaterThan(5);
    });
});
