// Per-test time budgets for the specs that render a real PixiJS map.
//
// AGENTS.MD is right that raising an e2e timeout is usually not the fix, and
// that a broken selector is the usual culprit. This file is the exception it
// warns you to be sure about, so here is the evidence rather than an assertion.
//
// --- What changed -----------------------------------------------------------
//
// The water shader (docs/design/water-shader.md) draws one full-viewport,
// alpha-blended pass over the settlement view. CI runs these specs on GitHub's
// 2-vCPU hosted runner with no GPU, so Chromium rasterises that pass in software
// — and a full-screen blended quad is the one thing a software rasteriser is
// worst at. Measured on the production build under the same renderer, at
// 1280x800 with water filling the frame (§4.2d):
//
//   water layer off ................................. 141 ms/frame
//   whole layer on .................................. 247 ms/frame
//   every effect off, mesh still drawn .............. 240 ms/frame
//   constant colour, no mask fetch, no maths ........ 226 ms/frame
//
// So ~84 ms of the ~99 ms is rasterising and blending the quad, before the
// fragment shader computes anything at all; the shader's own maths is ~14 ms of
// it, and has already been cut about as far as it usefully goes. On any GPU the
// same pass is a fraction of a millisecond, so this is a property of the test
// environment's renderer and not of what ships.
//
// --- Why this is a budget change and not a bug ------------------------------
//
// The tell is that the failures move. Across three runs of the same branch the
// failing shard was g2, then g1+g3, then g1+g2+g3, and the failing *test* inside
// ring-menu.spec.ts changed from :144 to :28. One of those runs was on a
// documentation-only commit, where the built application is byte-identical to
// the run before it. Nothing about a selector or a wait condition behaves that
// way; a suite whose specs all sit just inside their budget does exactly that,
// with whichever test lands on a slow patch tipping over.
//
// These specs were already close to the edge before this — c92f291 had to rescue
// the same ring-menu test from main-thread starvation once already — so a 1.75x
// frame cost was always going to spill them.
//
// --- Where the numbers come from --------------------------------------------
//
// 247/141 = 1.75, applied to the two budgets already in use (90s and 120s) and
// rounded. That is deliberately the measured ratio rather than a comfortable
// round number: it keeps these tests failing loudly if something makes the map
// genuinely slower again, which is the property AGENTS.MD actually cares about.
// A passing test costs nothing extra — only a failing one now takes longer to
// say so.
//
// If the water layer is ever made cheap on a software rasteriser (it would take
// drawing fewer fragments; see §4.2d for two approaches and why the obvious one
// does not pay on islands this size), these come back down.

/** A spec that founds a settlement and drives its map. Was 90s. */
export const MAP_SPEC_TIMEOUT_MS = 160_000;

/**
 * A spec that also pans, zooms or screenshots that map repeatedly — army
 * overlays, fog drift, world-map interaction. Was 120s.
 */
export const HEAVY_MAP_SPEC_TIMEOUT_MS = 210_000;
