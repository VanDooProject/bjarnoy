import { describe, expect, it } from 'vitest';
import { isHostileWallTile } from './siegeRules';

const wall = { buildingType: 'palisade', buildingLevel: 2, ownerId: 's-enemy' };
const none = new Set<string>();

describe('isHostileWallTile', () => {
  it('is true for a standing palisade or gate of another player', () => {
    expect(isHostileWallTile(wall, 'enemy', 'me', none)).toBe(true);
    expect(isHostileWallTile({ ...wall, buildingType: 'palisadegate' }, 'enemy', 'me', none)).toBe(true);
  });

  it('is false for the player\'s own wall', () => {
    expect(isHostileWallTile(wall, 'me', 'me', none)).toBe(false);
  });

  it('is false for a friend\'s wall (same guild or a guild at peace)', () => {
    expect(isHostileWallTile(wall, 'enemy', 'me', new Set(['enemy']))).toBe(false);
  });

  it('is false for every other building and for a wall that is only a foundation', () => {
    expect(isHostileWallTile({ ...wall, buildingType: 'tower' }, 'enemy', 'me', none)).toBe(false);
    expect(isHostileWallTile({ ...wall, buildingLevel: 0 }, 'enemy', 'me', none)).toBe(false);
    expect(isHostileWallTile({ ...wall, buildingLevel: undefined }, 'enemy', 'me', none)).toBe(false);
  });

  it('is false without a known owner', () => {
    expect(isHostileWallTile({ ...wall, ownerId: undefined }, 'enemy', 'me', none)).toBe(false);
    expect(isHostileWallTile(wall, undefined, 'me', none)).toBe(false);
  });
});
