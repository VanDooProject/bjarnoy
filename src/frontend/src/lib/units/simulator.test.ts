import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import { buildSimulatorRequest, isPremiumRequiredError } from './simulator';

describe('buildSimulatorRequest', () => {
  it('returns null when there are no attacker units', () => {
    expect(buildSimulatorRequest({}, {}, {}, 0, 'attack')).toBeNull();
    expect(buildSimulatorRequest({ spearman: 0 }, {}, {}, 0, 'attack')).toBeNull();
  });

  it('builds the minimal request for an undefended settlement with no options', () => {
    const request = buildSimulatorRequest({ spearman: 10 }, {}, {}, 0, 'attack');
    expect(request).toEqual({
      attackerStacks: [{ unit: 'spearman', count: 10 }],
      mission: 'attack',
    });
  });

  it('drops zero/blank counts from every stack list', () => {
    const request = buildSimulatorRequest(
      { spearman: 10, huscarl: 0 },
      { thrall: 0 },
      { archer: 0 },
      0,
      'attack',
    );
    expect(request).toEqual({
      attackerStacks: [{ unit: 'spearman', count: 10 }],
      mission: 'attack',
    });
  });

  it('includes defender/guest stacks, tower level, and seed only when set', () => {
    const request = buildSimulatorRequest(
      { spearman: 10 },
      { thrall: 5 },
      { archer: 2 },
      3,
      'raid',
      42,
    );
    expect(request).toEqual({
      attackerStacks: [{ unit: 'spearman', count: 10 }],
      defenderStacks: [{ unit: 'thrall', count: 5 }],
      guestDefenderStacks: [{ unit: 'archer', count: 2 }],
      towerLevel: 3,
      mission: 'raid',
      seed: 42,
    });
  });

  it('omits seed when null/undefined', () => {
    expect(buildSimulatorRequest({ spearman: 1 }, {}, {}, 0, 'attack', null)).toEqual({
      attackerStacks: [{ unit: 'spearman', count: 1 }],
      mission: 'attack',
    });
    expect(buildSimulatorRequest({ spearman: 1 }, {}, {}, 0, 'attack', undefined)).toEqual({
      attackerStacks: [{ unit: 'spearman', count: 1 }],
      mission: 'attack',
    });
  });
});

describe('isPremiumRequiredError', () => {
  it('is true for a 403 ApiError carrying { error: "premium_required" }', () => {
    const err = new ApiError(403, { error: 'premium_required' } as never);
    expect(isPremiumRequiredError(err)).toBe(true);
  });

  it('is false for a 403 with a different error code', () => {
    const err = new ApiError(403, { error: 'user_locked' } as never);
    expect(isPremiumRequiredError(err)).toBe(false);
  });

  it('is false for a 401 (not authenticated at all)', () => {
    const err = new ApiError(401, { error: 'authentication_required' } as never);
    expect(isPremiumRequiredError(err)).toBe(false);
  });

  it('is false for a non-ApiError', () => {
    expect(isPremiumRequiredError(new Error('boom'))).toBe(false);
    expect(isPremiumRequiredError('nope')).toBe(false);
  });
});
