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

  it('is true for a rival anonymous settlement\'s wall (no account, so nobody\'s friend)', () => {
    expect(isHostileWallTile(wall, null, 'me', new Set(['enemy']))).toBe(true);
  });

  it('compares the wall owner\'s user id (not a settlement id) with the guild friends', () => {
    // The friend's wall sits on tile.ownerId 's-friend' (a settlement id); only the account id 'friend' is in the guild set.
    const friendsWall = { ...wall, ownerId: 's-friend' };
    expect(isHostileWallTile(friendsWall, 'friend', 'me', new Set(['friend']))).toBe(false);
    expect(isHostileWallTile(friendsWall, 'friend', 'me', none)).toBe(true);
  });

  it('is false without a known owner', () => {
    expect(isHostileWallTile({ ...wall, ownerId: undefined }, 'enemy', 'me', none)).toBe(false);
    expect(isHostileWallTile(wall, undefined, 'me', none)).toBe(false);
  });
});
