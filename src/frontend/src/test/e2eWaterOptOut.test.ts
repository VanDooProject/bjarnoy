// Guards the e2e water/fog opt-out (`mapLayers` in e2e/fixtures.ts, issue #416):
// a spec that switches the water shader or the fog off must not be one whose result
// could depend on it. Checked statically, so a later edit that adds an image
// comparison to an opted-out spec fails here rather than silently testing a
// map players never see.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const E2E_DIR = join(__dirname, '../../e2e');
const OPT_OUT = /mapLayers:\s*\{[^}]*\b(water|fog):\s*false/;

/** Specs that must always render every layer: they are about water, fog, shore or the map's own transitions. */
const FULL_RENDERING_SPECS = ['water-shader.spec.ts', 'fog-drift.spec.ts', 'onboarding-happy-path.spec.ts', 'zoom-transition.spec.ts'];

/**
 * Specs that play real motion (`reducedMotion: 'no-preference'`) and may still
 * opt out, each only with the user's explicit approval and the reason it is
 * safe. Motion specs were on the full-rendering side until one was approved
 * here; any other motion spec that opts out fails below until it is added.
 */
const APPROVED_MOTION_OPT_OUTS: Record<string, string> = {
  // User-approved 2026-10-27 (VanDooProject/bjarnoy#420, against #416's original
  // "ring-motion should not opt out"): every assertion is on DOM Web Animations
  // and game state, which water and fog pixels cannot change. With motion on,
  // those passes starved it first: water on, 8 of 10 runs timed out at
  // --workers=4; water off, 1 of 10 still did, until fog went off as well
  // (also user-approved in #420).
  'ring-motion.spec.ts': 'DOM Web Animations and game state only; water and fog opt-out user-approved in #420',
};

const PLAYS_MOTION = /reducedMotion:\s*'no-preference'/;

/**
 * Pixel checks an opted-out spec may not make: a golden image, or a saved
 * screenshot someone looks at. A before/after `Buffer.compare` ("the map
 * moved") stays allowed - with water off it is only stricter.
 */
const IMAGE_CHECKS = [/toHaveScreenshot\s*\(/, /toMatchSnapshot\s*\(/, /screenshot\(\s*\{[^}]*\bpath\s*:/s];

const specs = readdirSync(E2E_DIR).filter((name) => name.endsWith('.spec.ts'));
const optedOut = specs.filter((name) => OPT_OUT.test(readFileSync(join(E2E_DIR, name), 'utf8')));

describe('e2e water/fog opt-out', () => {
  it('is used by at least one spec (the pattern below still matches the fixture syntax)', () => {
    expect(optedOut.length).toBeGreaterThan(0);
  });

  it("is never used by a spec about water, fog, shore or the map's transitions", () => {
    expect(optedOut.filter((name) => FULL_RENDERING_SPECS.includes(name))).toEqual([]);
  });

  it('lets a spec that plays real motion opt out only with recorded user approval', () => {
    const motion = optedOut.filter((name) => PLAYS_MOTION.test(readFileSync(join(E2E_DIR, name), 'utf8')));
    expect(motion.filter((name) => !(name in APPROVED_MOTION_OPT_OUTS))).toEqual([]);
  });

  it.each(optedOut)('%s makes no golden-image or saved-screenshot check', (name) => {
    const source = readFileSync(join(E2E_DIR, name), 'utf8');
    expect(IMAGE_CHECKS.filter((check) => check.test(source)).map(String)).toEqual([]);
  });
});
