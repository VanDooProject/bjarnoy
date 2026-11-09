// The giants territory rule's anti-drift guard (frontend half) —
// `src/shared/territory-giants-golden.json` is read by this suite and by
// `Bjarnoy.Domain.Tests.TerritoryGoldenTests` (backend) — each side computes
// against the same discs/giants/bounds using its OWN production
// implementation of the rule (`claimsWithGiants` here, `Territory.Claims`
// there), then asserts the fixture's frozen claimed sets. Either side's
// territory logic drifting from the other turns its own suite red instead of
// the client's map painting a giant claimed (or not) differently from what
// the server actually enforces. Mirrors `hexPath.golden.test.ts`'s own
// pattern for loading a `src/shared/*.json` fixture.
import { describe, expect, it } from 'vitest';
import goldenFixtureJson from '../../../../shared/territory-giants-golden.json';
import { coordKey, hexesInRadius } from '../hex/coords';
import { giantCoverage } from './giantTiles';
import { claimsWithGiants } from './territory';
const fixture = goldenFixtureJson;
describe('territory-giants golden fixture (giants territory rule parity)', () => {
    it.each(fixture.scenarios)('$name: matches the shared golden fixture', (scenario) => {
        // A plain coord -> anchor map, covering every one of each giant's 7
        // footprint hexes (not just its anchor hex) — the same shape
        // `WorldModel.giantAnchorAt` answers from its own `giantAnchorByHex`, but
        // with no `WorldModel`/`Tile` machinery involved at all, so this only
        // ever exercises `claimsWithGiants` itself.
        const anchorByHex = new Map();
        for (const anchor of scenario.giants) {
            for (const { coord } of giantCoverage(anchor)) {
                anchorByHex.set(coordKey(coord), anchor);
            }
        }
        const giantAt = (coord) => anchorByHex.get(coordKey(coord)) ?? null;
        const actual = hexesInRadius({ q: scenario.bounds.q, r: scenario.bounds.r }, scenario.bounds.radius)
            .filter((coord) => claimsWithGiants(scenario.discs, coord, giantAt))
            .map((c) => [c.q, c.r])
            .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
        const expected = [...scenario.claimed].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
        expect(actual).toEqual(expected);
    });
});
