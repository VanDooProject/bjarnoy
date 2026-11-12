/**
 * Why a world refuses new players, as the landing page and the world list tell it. `reason` is the wire value of
 * `JoinableReason` (lowercased by the backend: `notstartedyet`, `joinsclosed`, ...) or the world store's own
 * `NoWorldYet` when there is no world at all.
 */
export type JoinBlockedKey = 'opensAt' | 'joinsClosed' | 'noWorldYet' | 'notAcceptingPlayers';

export function joinBlockedKey(reason: string, startsAt: string | null): JoinBlockedKey {
  const normalized = reason.toLowerCase();
  if (normalized === 'notstartedyet' && startsAt) return 'opensAt';
  if (normalized === 'joinsclosed') return 'joinsClosed';
  if (normalized === 'noworldyet') return 'noWorldYet';
  return 'notAcceptingPlayers';
}
