// Guards the reduced-motion rule (AGENTS.MD "# reduced motion"): the device's
// reduce-motion flag only counts while the player's graphics setting for that
// kind of motion is on Auto, so every check goes through the resolved setting
// (motionPreferences.*Enabled, animationPreference.effective / .clipsEnabled,
// or the `html[data-hud-motion]` attribute in CSS) - never a direct
// `prefers-reduced-motion` media query, which would ignore an explicit On/Off.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');

/** The places that own the device flag itself and resolve it into the settings. */
const ALLOWED = [/^lib\/perf\//, /^lib\/motion\.ts$/];

const DIRECT_QUERY = [/@media[^{]*prefers-reduced-motion/, /matchMedia\(\s*['"`]\(prefers-reduced-motion/, /REDUCED_QUERY\b/];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|vue|css)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe('reduced-motion checks', () => {
  it('never query prefers-reduced-motion directly outside the settings that resolve it', () => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(SRC, path).split('\\').join('/'))
      .filter((rel) => !rel.startsWith('test/') && !ALLOWED.some((allowed) => allowed.test(rel)))
      .filter((rel) => DIRECT_QUERY.some((query) => query.test(readFileSync(join(SRC, rel), 'utf8'))));
    expect(offenders).toEqual([]);
  });
});
