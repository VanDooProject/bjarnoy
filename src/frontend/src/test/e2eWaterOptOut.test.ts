// Guards the e2e water opt-out (`mapLayers` in e2e/fixtures.ts, issue #416):
// a spec that switches the water shader off must not be one whose result
// could depend on it. Checked statically, so a later edit that adds an image
// comparison to an opted-out spec fails here rather than silently testing a
// map players never see.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const E2E_DIR = join(__dirname, '../../e2e');
const OPT_OUT = /mapLayers:\s*\{\s*water:\s*false/;

/** Specs that must always render every layer: they are about water, fog, shore or motion timing. */
const FULL_RENDERING_SPECS = ['water-shader.spec.ts', 'fog-drift.spec.ts', 'ring-motion.spec.ts', 'onboarding-happy-path.spec.ts', 'zoom-transition.spec.ts'];

/**
 * Pixel checks an opted-out spec may not make: a golden image, or a saved
 * screenshot someone looks at. A before/after `Buffer.compare` ("the map
 * moved") stays allowed - with water off it is only stricter.
 */
const IMAGE_CHECKS = [/toHaveScreenshot\s*\(/, /toMatchSnapshot\s*\(/, /screenshot\(\s*\{[^}]*\bpath\s*:/s];

const specs = readdirSync(E2E_DIR).filter((name) => name.endsWith('.spec.ts'));
const optedOut = specs.filter((name) => OPT_OUT.test(readFileSync(join(E2E_DIR, name), 'utf8')));

describe('e2e water opt-out', () => {
  it('is used by at least one spec (the pattern below still matches the fixture syntax)', () => {
    expect(optedOut.length).toBeGreaterThan(0);
  });

  it('is never used by a spec about water, fog, shore or motion', () => {
    expect(optedOut.filter((name) => FULL_RENDERING_SPECS.includes(name))).toEqual([]);
  });

  it.each(optedOut)('%s makes no golden-image or saved-screenshot check', (name) => {
    const source = readFileSync(join(E2E_DIR, name), 'utf8');
    expect(IMAGE_CHECKS.filter((check) => check.test(source)).map(String)).toEqual([]);
  });
});
