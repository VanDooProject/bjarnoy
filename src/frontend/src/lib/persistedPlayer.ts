import { DEMO_MODE } from '../config';

// "Already founded a settlement" only survives a reload in live mode, where
// the backend is the actual source of truth and can restore it (see
// `stores/world.ts`'s `restoreLiveSettlement`). Demo mode's `WorldModel` is
// pure in-memory simulation with nothing to restore, so every reload there
// intentionally starts a fresh session — persisting the flag would just
// strand the router's `/settlement` guard on a settlement that no longer
// exists anywhere.
export function readPersistedSettlementId(): string | null {
  return DEMO_MODE ? null : localStorage.getItem('bjarnoy.settlementId');
}
