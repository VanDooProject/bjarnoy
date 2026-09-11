import { describe, expect, it } from 'vitest';
import { deriveOnboardingGuidance, nextGuidedType } from './onboardingGuidance';

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
