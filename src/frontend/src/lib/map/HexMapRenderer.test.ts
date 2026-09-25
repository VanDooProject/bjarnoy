import { describe, expect, it } from 'vitest';
import {
  attentionPulseFrame,
  hoverSubjectFor,
  landfallBurstFrames,
  plotRippleFrames,
  previewFitZoom,
  previewIslandBounds,
  terrainTitleFor,
  worldLayerOrder,
} from './HexMapRenderer';
import { PREVIEW_ISLAND_RADIUS } from './WorldModel';
import type { RiverTile, Tile } from './types';
import { hexesInRadius, type AxialCoord } from '../hex/coords';

// Regression coverage for a reported bug: a river mouth's hover tooltip
// read "Shore" (its underlying sand terrain) instead of naming the river
// actually drawn there — terrainTitleFor is the tooltip's title logic,
// extracted out of HexMapRenderer.hoverInfoFor (which is otherwise
// untestable without a real canvas/Pixi renderer) so this one rule can be
// checked directly.

function tileOf(terrain: Tile['terrain']): Tile {
  return { q: 0, r: 0, terrain };
}

const river: RiverTile = { q: 0, r: 0, shape: 'mouth', inDirections: ['NE'], outDirection: null };

describe('terrainTitleFor', () => {
  it('names the underlying terrain when there is no river', () => {
    expect(terrainTitleFor(tileOf('sand'), undefined)).toEqual({ terrain: 'sand', isRiver: false, wasted: false });
    expect(terrainTitleFor(tileOf('grass'), undefined)).toEqual({ terrain: 'grass', isRiver: false, wasted: false });
  });

  it('flags the river instead of the underlying terrain when one is present — even on sand (the reported case)', () => {
    expect(terrainTitleFor(tileOf('sand'), river)).toEqual({ terrain: 'sand', isRiver: true, wasted: false });
  });

  it('flags the river regardless of which terrain it sits on', () => {
    for (const terrain of ['sea', 'sand', 'grass', 'forest', 'mountain'] as const) {
      expect(terrainTitleFor(tileOf(terrain), river)).toEqual({ terrain, isRiver: true, wasted: false });
    }
  });
});

// The regression test for the whole of docs/design/water-shader.md §3.
// Layering is the hard part of the water feature and getting it wrong fails
// silently — water over the tall art, or under the islands it is supposed to
// lap against, both just look like a bad shader rather than a bug. Asserted on
// the pure ordering function rather than a mounted renderer for the same reason
// terrainTitleFor is extracted: `world`'s real children need a canvas and a
// Pixi Application, and this is our stack, not a third-party library.
describe('worldLayerOrder', () => {
  const indexIn = (mode: 'world' | 'settlement', name: string) => worldLayerOrder(mode).indexOf(name as never);

  it('puts the water mesh under the island polygons in world mode', () => {
    // §3.2: there is no water in the world-map canvas at all today (the sea is
    // a CSS gradient behind it), so the mesh fills an empty canvas and the
    // opaque terrainFlat hexes cover it wherever there is land.
    expect(worldLayerOrder('world')[0]).toBe('water');
    expect(indexIn('world', 'water')).toBeLessThan(indexIn('world', 'terrainFlat'));
  });

  it('puts the water mesh above the ground art and below the tall art in settlement mode', () => {
    // §3.3. The second half is what keeps a magictower's spire out of the
    // water: anything routed to terrainTop draws above the mesh by
    // construction, whatever the art's height (see legacyTileSplit.ts).
    expect(indexIn('settlement', 'terrainBase')).toBeLessThan(indexIn('settlement', 'water'));
    expect(indexIn('settlement', 'water')).toBeLessThan(indexIn('settlement', 'terrainTop'));
  });

  it('keeps the foam’s inward bleed clipped by real land geometry', () => {
    // §3.5: the foam band is allowed to run slightly onto land (the mask's G
    // channel), and in *both* views the land art draws above the mesh, so that
    // bleed is clipped for free rather than needing shader work.
    for (const mode of ['world', 'settlement'] as const) {
      const land = mode === 'world' ? 'terrainFlat' : 'terrainTop';
      expect(indexIn(mode, 'water')).toBeLessThan(indexIn(mode, land));
    }
  });

  it('never splits terrainBase into sea and land halves', () => {
    // The wrong answer an earlier draft of the plan reached, kept as an
    // assertion because it is not obviously wrong: every tile in the pack,
    // water included, has a 68px skirt, and a land tile's skirt reaches into
    // the top face of the water hex diagonally in front of it. Grouping all
    // the sea before all the land breaks that occlusion along every shore —
    // which is exactly where the foam is.
    for (const mode of ['world', 'settlement'] as const) {
      const order = worldLayerOrder(mode);
      expect(order.filter((name) => name === 'terrainBase')).toHaveLength(1);
    }
  });

  it('contains every layer exactly once in both modes', () => {
    // World mode gets one extra layer, 'rivers' (the vector-line river
    // strokes) — settlement mode draws rivers as sprite tile art baked into
    // terrainBase/terrainTop instead (riverTexturesFor), so it never adds
    // 'rivers' to its own order.
    const expectedLength = { world: 10, settlement: 9 } as const;
    for (const mode of ['world', 'settlement'] as const) {
      const order = worldLayerOrder(mode);
      expect(new Set(order).size).toBe(order.length);
      expect(order).toHaveLength(expectedLength[mode]);
    }
  });

  it('draws rivers above the terrain fill and below realm borders in world mode', () => {
    expect(indexIn('world', 'terrainFlat')).toBeLessThan(indexIn('world', 'rivers'));
    expect(indexIn('world', 'rivers')).toBeLessThan(indexIn('world', 'borders'));
  });
});

// hoverSubjectFor resolves which HoverSubject a tile shows, from the tile's
// own fields alone — the giant-tile precedence (its opaque art fully covers
// the ground terrain, so `tile.giant` must win over both `buildingType` and
// the plain terrain title) is the part worth locking down, since a giant
// currently never carries a `buildingType` but nothing stops that changing.
describe('hoverSubjectFor', () => {
  const giant = { family: 'giantmountain' as const, anchor: { q: 0, r: 0 }, part: 'C' as const, orientation: 'SE' as const };

  it('returns the giant subject, with its family, for a tile that belongs to a giant', () => {
    const tile = { ...tileOf('grass'), giant };
    expect(hoverSubjectFor(tile, undefined)).toEqual({ kind: 'giant', family: 'giantmountain' });
  });

  it('names the giant even over a building type, since a giant tile fully covers whatever is under it', () => {
    const tile = { ...tileOf('grass'), giant, buildingType: 'hut' as const, buildingLevel: 3 };
    expect(hoverSubjectFor(tile, undefined)).toEqual({ kind: 'giant', family: 'giantmountain' });
  });

  it('falls back to building, then terrain, when there is no giant', () => {
    const building = { ...tileOf('grass'), buildingType: 'hut' as const, buildingLevel: 2 };
    expect(hoverSubjectFor(building, undefined)).toEqual({ kind: 'building', buildingType: 'hut', level: 2 });
    expect(hoverSubjectFor(tileOf('sand'), undefined)).toEqual({ kind: 'terrain', terrain: 'sand', isRiver: false, wasted: false });
    expect(hoverSubjectFor(tileOf('sand'), river)).toEqual({ kind: 'terrain', terrain: 'sand', isRiver: true, wasted: false });
  });
});

// Regression coverage for landing-page-defects.md L4: the preview camera
// must centre on the drawn island's own bounding box, not on `previewCenter`
// (the suggested plot) — a scored interior grass hex, not the landmass's
// centroid. Asserted on the pure function (no worldModel/canvas needed) for
// the same reason as terrainTitleFor/worldLayerOrder above.
describe('previewIslandBounds', () => {
  it('is null for an empty tile list (nothing to frame)', () => {
    expect(previewIslandBounds([])).toBeNull();
  });

  it('is exactly that one tile\'s own centre for a single-tile list', () => {
    const bounds = previewIslandBounds([{ q: 3, r: -2 }])!;
    expect(bounds.minX).toBeCloseTo(bounds.maxX);
    expect(bounds.minY).toBeCloseTo(bounds.maxY);
    expect(bounds.centerX).toBeCloseTo(bounds.minX);
    expect(bounds.centerY).toBeCloseTo(bounds.minY);
  });

  it('centres on its own bounding box\'s midpoint, not on any single tile inside it', () => {
    // A lopsided run of tiles — nothing here is at the box's own midpoint.
    const tiles: AxialCoord[] = [];
    for (let q = -1; q <= 9; q++) tiles.push({ q, r: 0 });
    const bounds = previewIslandBounds(tiles)!;
    // Symmetric about its own centre by construction — this is exactly the
    // property that fixes L4: fitting around *this* box (rather than around
    // an arbitrary point inside it, like the suggested plot) can't help but
    // give equal margins on both sides.
    expect(bounds.maxX - bounds.centerX).toBeCloseTo(bounds.centerX - bounds.minX);
    expect(bounds.maxY - bounds.centerY).toBeCloseTo(bounds.centerY - bounds.minY);
  });
});

// Regression coverage for the landing page's locked static preview
// (docs/design/zoom-transition.md §6, landing-page-defects.md L4): the whole
// island must fit on screen at any viewport size/aspect, biased or not.
// Asserted on the pure function (no worldModel/canvas needed) for the same
// reason as terrainTitleFor/worldLayerOrder above.
//
// Signature note: this used to take `center` + `radius` + an `isSea`
// predicate and fit a symmetric box around `center` (see git history) —
// L4's own root cause was exactly that shape, fitting symmetrically around
// a point that is rarely a landmass's own centroid. It now takes the tile
// list directly (the same one `WorldModel.previewIslandTiles`/L5 hands
// `rebuildTerrain`) and fits against `previewIslandBounds` of *that*, so the
// contract change here is the fix, not incidental — the tests below were
// updated to match rather than left calling a signature that no longer
// exists.
describe('previewFitZoom', () => {
  // A regular hexagonal blob of tile centres, all land — stands in for "some
  // symmetric island of the given radius" wherever a test only cares about
  // that, not any particular shape.
  const symmetricIsland = (radius: number) => hexesInRadius({ q: 0, r: 0 }, radius);

  it('falls back before the viewport is known', () => {
    expect(
      previewFitZoom({
        tiles: symmetricIsland(7),
        screenBiasX: 0,
        viewport: { width: 0, height: 0 },
        fallbackZoom: 0.6,
        minZoom: 0.05,
        maxZoom: 4,
      }),
    ).toBe(0.6);
  });

  it('falls back when there are no tiles to fit (e.g. the whole radius was sea)', () => {
    expect(
      previewFitZoom({
        tiles: [],
        screenBiasX: 0,
        viewport: { width: 1200, height: 800 },
        fallbackZoom: 0.6,
        minZoom: 0.05,
        maxZoom: 4,
      }),
    ).toBe(0.6);
  });

  it('zooms out further for a wider spread of land, all else equal', () => {
    const zoomFor = (radius: number) =>
      previewFitZoom({
        tiles: symmetricIsland(radius),
        screenBiasX: 0,
        viewport: { width: 1200, height: 800 },
        fallbackZoom: 0.6,
        minZoom: 0.05,
        maxZoom: 4,
      });
    expect(zoomFor(7)).toBeLessThan(zoomFor(2));
  });

  it('zooms out further when a screen bias narrows the usable half-width', () => {
    const zoomFor = (screenBiasX: number) =>
      previewFitZoom({
        tiles: symmetricIsland(7),
        screenBiasX,
        viewport: { width: 1200, height: 800 },
        fallbackZoom: 0.6,
        minZoom: 0.05,
        maxZoom: 4,
      });
    expect(zoomFor(0.16)).toBeLessThan(zoomFor(0));
  });

  it('clamps to the given min/max bounds', () => {
    const tiny = previewFitZoom({
      tiles: symmetricIsland(7),
      screenBiasX: 0,
      viewport: { width: 20, height: 20 },
      fallbackZoom: 0.6,
      minZoom: 0.3,
      maxZoom: 4,
    });
    expect(tiny).toBe(0.3);

    const huge = previewFitZoom({
      tiles: symmetricIsland(1),
      screenBiasX: 0,
      viewport: { width: 20000, height: 20000 },
      fallbackZoom: 0.6,
      minZoom: 0.05,
      maxZoom: 1.5,
    });
    expect(huge).toBe(1.5);
  });

  // landing-page-defects.md L4's own regression test: an island whose land
  // is asymmetric about the suggested plot must still frame with equal
  // margins on both sides, with nothing past the viewport edge — because
  // the camera now fits (and centres) on the island's own bounding box
  // rather than on the plot. The final assertion recreates the *old*
  // plot-centred fit inline (not by calling the exported function, whose
  // contract L4 legitimately changed — see the describe block's own note)
  // to show this case genuinely used to bleed past the frame, so this is a
  // real regression check rather than only a description of the new code.
  it('frames an island asymmetric about the plot with equal margins and nothing past the viewport edge', () => {
    const plot: AxialCoord = { q: 0, r: 0 };
    // The island runs q = -1..9 along r = 0 — the plot sits one column from
    // one end and ten from the other, exactly the "scored interior grass
    // hex, not a centroid" case L4 describes.
    const islandTiles: AxialCoord[] = [];
    for (let q = -1; q <= 9; q++) islandTiles.push({ q, r: 0 });
    const viewport = { width: 1200, height: 800 };
    const screenBiasX = 0;
    // previewIslandBounds of a single tile is exactly that tile's own pixel
    // centre — reused here instead of duplicating isoGridPosition/TILE_W in
    // this test file.
    const pixelCenterOf = (c: AxialCoord) => previewIslandBounds([c])!;

    const bounds = previewIslandBounds(islandTiles)!;
    const plotPx = pixelCenterOf(plot);
    // The premise the L4 bug depended on: the plot is nowhere near this
    // island's own bounding-box centre, so a fit centred on the plot cannot
    // also be one centred on (and thus symmetric around) this box.
    expect(Math.abs(plotPx.centerX - bounds.centerX)).toBeGreaterThan(1);

    const zoom = previewFitZoom({
      tiles: islandTiles,
      screenBiasX,
      viewport,
      fallbackZoom: 0.6,
      minZoom: 0.05,
      maxZoom: 4,
    });

    // New (L4) behaviour: every tile's own screen projection, once the
    // camera sits at `bounds`'s centre and `zoom` (the same
    // biasedCenterX/applyCameraTransform maths HexMapRenderer itself uses
    // to place `this.world`), lands inside the viewport.
    for (const c of islandTiles) {
      const p = pixelCenterOf(c);
      const screenX = viewport.width / 2 + (p.centerX - bounds.centerX) * zoom + screenBiasX * viewport.width;
      expect(screenX).toBeGreaterThan(0);
      expect(screenX).toBeLessThan(viewport.width);
    }

    // Old (pre-L4) behaviour: fit + centre symmetrically around the *plot*
    // instead of the box (previewFitZoom's own removed `center`/`radius`
    // parameters, before this fix — see git history). With the plot this
    // far off the box's own centre, that leaves at least one tile's screen
    // projection outside the viewport: the very bleed L4 reports.
    let oldMaxDx = 0;
    for (const c of islandTiles) {
      oldMaxDx = Math.max(oldMaxDx, Math.abs(pixelCenterOf(c).centerX - plotPx.centerX));
    }
    const usableHalfWidth = (0.5 - Math.abs(screenBiasX)) * viewport.width;
    const oldZoom = Math.min(4, Math.max(0.05, usableHalfWidth / oldMaxDx));
    const oldScreenXs = islandTiles.map((c) => {
      const p = pixelCenterOf(c);
      return viewport.width / 2 + (p.centerX - plotPx.centerX) * oldZoom + screenBiasX * viewport.width;
    });
    expect(oldScreenXs.some((x) => x <= 0 || x >= viewport.width)).toBe(true);
  });

  // Regression test for the coordinator-caught follow-up: an earlier draft
  // of the L4/L5 fix dropped PREVIEW_ISLAND_RADIUS entirely and culled
  // purely by landmass membership, so a real (larger-than-7-hex) island
  // rendered whole. previewFitZoom's own `minZoom` clamp then rescued an
  // under-sized natural zoom back up to `minZoom` — which is *bigger* than
  // the zoom the fit says is safe, reintroducing overflow past the
  // viewport, under the hero column, and under the onboarding tray (see
  // WorldModel.PREVIEW_ISLAND_RADIUS's doc comment for the full story).
  // `WorldModel.previewCropTiles` fixes this by intersecting membership
  // with a `PREVIEW_ISLAND_RADIUS`-hex disc, so a full disc of that radius
  // (the largest crop it can ever produce — any real island's crop is a
  // subset of this, never a superset) is the actual worst case to check
  // the fit against, at the exact viewport/bias LandingView really uses.
  it('the largest possible crop (PREVIEW_ISLAND_RADIUS, all land) fits at the real viewport/bias without needing the minZoom clamp', () => {
    const worstCaseCrop = hexesInRadius({ q: 0, r: 0 }, PREVIEW_ISLAND_RADIUS);
    // Mirrors LandingView.vue's own LANDING_PREVIEW_SCREEN_BIAS_X formula —
    // (HERO_RIGHT_EDGE_PX + HERO_MIN_GUTTER_PX) / (2 * HERO_REFERENCE_VIEWPORT_WIDTH_PX),
    // with that reference now 1440 (this exact test viewport) rather than a
    // wider guess — see that constant's own doc comment for why a reference
    // wider than the viewport being framed under-shoots real pixel
    // clearance. Duplicated here rather than imported: a <script setup>
    // const isn't an importable export of a .vue SFC.
    const screenBiasX = (56 + 520 + 40) / (2 * 1440);
    // scripts/screenshot-helpers/flow.mjs's own capture size — the same
    // viewport the coordinator's screenshot review measured against.
    const viewport = { width: 1440, height: 900 };
    const minZoom = 0.05;
    const maxZoom = 4;

    const zoom = previewFitZoom({ tiles: worstCaseCrop, screenBiasX, viewport, fallbackZoom: 0.6, minZoom, maxZoom });
    // The fit must be natural, not rescued by the minZoom clamp — a
    // clamped zoom is bigger than the fit says is safe, which is exactly
    // how the island ended up bleeding off the right edge in the reported
    // regression (Math.max(minZoom, zoom) only ever *enlarges* an
    // undersized zoom, it never shrinks an oversized one).
    expect(zoom).toBeGreaterThan(minZoom);

    const bounds = previewIslandBounds(worstCaseCrop)!;
    const pixelCenterOf = (c: AxialCoord) => previewIslandBounds([c])!;
    for (const c of worstCaseCrop) {
      const p = pixelCenterOf(c);
      const screenX = viewport.width / 2 + (p.centerX - bounds.centerX) * zoom + screenBiasX * viewport.width;
      // No island pixel past either viewport edge...
      expect(screenX).toBeGreaterThan(0);
      expect(screenX).toBeLessThan(viewport.width);
      // ...and, specifically, none left of x=600 — the coordinator's own
      // acceptance bound for "the hero column must be completely clear".
      expect(screenX).toBeGreaterThan(600);
    }
  });
});

// Design handoff "2a": the plot-pulse "look here" ripple (frames 1/1b) and
// the one-shot landfall burst (frame 2) — extracted as pure functions of
// wall-clock time so the animation's own maths is testable without a Pixi
// app, same reasoning as previewFitZoom/terrainTitleFor above.
describe('plotRippleFrames', () => {
  it('scale grows and alpha fades monotonically over one ring\'s cycle', () => {
    const start = plotRippleFrames(0)[0];
    const mid = plotRippleFrames(450)[0]; // a quarter into the 1800ms cycle
    const late = plotRippleFrames(1350)[0]; // three quarters in
    expect(start.scale).toBeCloseTo(0.45);
    expect(mid.scale).toBeGreaterThan(start.scale);
    expect(late.scale).toBeGreaterThan(mid.scale);
    expect(late.scale).toBeLessThanOrEqual(2.1);
    expect(start.alpha).toBeGreaterThan(mid.alpha);
    expect(mid.alpha).toBeGreaterThan(late.alpha);
  });

  it('loops back to the start of the cycle rather than growing forever', () => {
    const cycleStart = plotRippleFrames(0)[0];
    const oneCycleLater = plotRippleFrames(1800)[0];
    expect(oneCycleLater.scale).toBeCloseTo(cycleStart.scale);
    expect(oneCycleLater.alpha).toBeCloseTo(cycleStart.alpha);
  });

  it('offsets the second ring by half a cycle, so the two are never in phase', () => {
    const [ring0, ring1] = plotRippleFrames(0);
    expect(ring1.scale).not.toBeCloseTo(ring0.scale);
  });

  it('alpha never goes negative, even right at the end of a cycle', () => {
    for (const t of [0, 300, 900, 1799]) {
      for (const ring of plotRippleFrames(t)) {
        expect(ring.alpha).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('landfallBurstFrames', () => {
  it('is empty before the burst starts', () => {
    expect(landfallBurstFrames(999, 1000)).toEqual([]);
  });

  it('is empty once the whole moment has played out', () => {
    expect(landfallBurstFrames(1000 + 1900 + 550 + 1, 1000)).toEqual([]);
  });

  it('peaks partway through — scale up, alpha down — then is gone', () => {
    const startedAt = 1000;
    const atStart = landfallBurstFrames(startedAt, startedAt)[0];
    const midway = landfallBurstFrames(startedAt + 950, startedAt)[0];
    expect(atStart.scale).toBeCloseTo(0.25);
    expect(midway.scale).toBeGreaterThan(atStart.scale);
    expect(midway.scale).toBeLessThanOrEqual(3);
    expect(midway.alpha).toBeLessThan(atStart.alpha);
  });

  it('the second ring trails the first by its own offset, both self-clearing on schedule', () => {
    const startedAt = 1000;
    // Just past the first ring's own 1900ms window, but still inside the
    // second ring's (offset 550ms later) — exactly one frame should remain.
    const frames = landfallBurstFrames(startedAt + 1901, startedAt);
    expect(frames).toHaveLength(1);
  });
});

// L6a (docs/plans/landing-page-defects.md): the miss-click flash layered on
// top of the plots' own looping pulse — see `attentionPulseFrame`'s own
// comment for why this is a separate one-shot rather than a tweak to
// plotRippleFrames' constants.
describe('attentionPulseFrame', () => {
  it('is 0 before the pulse starts', () => {
    expect(attentionPulseFrame(999, 1000)).toBe(0);
  });

  it('is 0 once the flash has fully played out', () => {
    expect(attentionPulseFrame(1000 + 700, 1000)).toBe(0);
  });

  it('rises then falls — a flash, not a fade-in — peaking mid-way', () => {
    const startedAt = 1000;
    const start = attentionPulseFrame(startedAt, startedAt);
    const quarter = attentionPulseFrame(startedAt + 175, startedAt);
    const mid = attentionPulseFrame(startedAt + 350, startedAt);
    const threeQuarters = attentionPulseFrame(startedAt + 525, startedAt);
    expect(start).toBeCloseTo(0);
    expect(quarter).toBeGreaterThan(start);
    expect(mid).toBeGreaterThan(quarter);
    expect(mid).toBeCloseTo(1);
    expect(threeQuarters).toBeLessThan(mid);
  });
});
