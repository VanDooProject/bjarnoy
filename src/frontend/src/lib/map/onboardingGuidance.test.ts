import { describe, expect, it } from 'vitest';
import type { AxialCoord } from '../hex/coords';
import type { Terrain } from './types';
import { deriveOnboardingGuidance, findGuidedTarget, nextGuidedType } from './onboardingGuidance';

describe('deriveOnboardingGuidance', () => {
  it('before founding: longhouse is current, both guided rows upcoming, step 1 of 3', () => {
    const g = deriveOnboardingGuidance(false, []);
    expect(g.step).toBe(1);
    expect(g.totalSteps).toBe(3);
    expect(g.progress).toBe(0);
    expect(g.complete).toBe(false);
    expect(g.rows).toEqual([
      { key: 'longhouse', state: 'current' },
      { key: 'farm', state: 'upcoming' },
      { key: 'lumberjack', state: 'upcoming' },
    ]);
  });

  it('just founded, nothing else placed: longhouse done, first guided row current', () => {
    const g = deriveOnboardingGuidance(true, ['longhouse']);
    expect(g.step).toBe(2);
    expect(g.progress).toBeCloseTo(1 / 3);
    expect(g.rows).toEqual([
      { key: 'longhouse', state: 'done' },
      { key: 'farm', state: 'current' },
      { key: 'lumberjack', state: 'upcoming' },
    ]);
  });

  it('lumberjack placed before farm: farm still reads current, not stuck on a fixed order', () => {
    const g = deriveOnboardingGuidance(true, ['longhouse', 'lumberjack']);
    expect(g.step).toBe(3);
    expect(g.rows).toEqual([
      { key: 'longhouse', state: 'done' },
      { key: 'farm', state: 'current' },
      { key: 'lumberjack', state: 'done' },
    ]);
  });

  it('both guided buildings placed: complete, no current row, full progress', () => {
    const g = deriveOnboardingGuidance(true, ['longhouse', 'farm', 'lumberjack']);
    expect(g.step).toBe(3);
    expect(g.progress).toBe(1);
    expect(g.complete).toBe(true);
    expect(g.rows.every((row) => row.state === 'done')).toBe(true);
  });

  it('reloading mid-onboarding (arrived past a step already) reflects the real state, not a stale counter', () => {
    const g = deriveOnboardingGuidance(true, ['longhouse', 'farm']);
    expect(g.rows).toEqual([
      { key: 'longhouse', state: 'done' },
      { key: 'farm', state: 'done' },
      { key: 'lumberjack', state: 'current' },
    ]);
  });
});

describe('nextGuidedType', () => {
  it('is farm when nothing is placed yet', () => {
    expect(nextGuidedType([])).toBe('farm');
  });

  it('skips whichever guided type is already standing, in either order', () => {
    expect(nextGuidedType(['longhouse', 'farm'])).toBe('lumberjack');
    expect(nextGuidedType(['longhouse', 'lumberjack'])).toBe('farm');
  });

  it('is null once both guided buildings are placed', () => {
    expect(nextGuidedType(['longhouse', 'farm', 'lumberjack'])).toBeNull();
  });
});

describe('findGuidedTarget', () => {
  const center: AxialCoord = { q: 0, r: 0 };
  // A tiny hand-built terrain map: origin is grass (the longhouse), one
  // forest hex two rings out, everything else grass — enough to exercise
  // "picks the closest match", not a full world generator.
  const terrainAt = (c: AxialCoord): Terrain => (c.q === 2 && c.r === 0 ? 'forest' : 'grass');
  const owned = new Set(['0,0', '1,0', '2,0', '-1,0', '0,1', '0,-1']);
  const isBuildable = (c: AxialCoord) => owned.has(`${c.q},${c.r}`) && !(c.q === 0 && c.r === 0);

  it('finds the nearest hex matching the guided type\'s required terrain', () => {
    const target = findGuidedTarget(center, 3, 'lumberjack', terrainAt, isBuildable);
    expect(target).toEqual({ q: 2, r: 0 });
  });

  it('picks the closest of several matching hexes to center', () => {
    const target = findGuidedTarget(center, 3, 'farm', terrainAt, isBuildable);
    // Every owned non-origin hex except (2,0) is grass — the closest of
    // those (distance 1) should win over farther ones.
    expect(target).not.toBeNull();
    expect(target!.q === 0 || target!.r === 0).toBe(true);
  });

  it('returns null when nothing in range is both buildable and the right terrain', () => {
    expect(findGuidedTarget(center, 3, 'lumberjack', () => 'grass', isBuildable)).toBeNull();
  });

  it('never returns a hex isBuildable rejects, even if the terrain matches', () => {
    expect(findGuidedTarget(center, 3, 'lumberjack', terrainAt, () => false)).toBeNull();
  });
});
