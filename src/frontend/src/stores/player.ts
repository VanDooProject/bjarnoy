import { defineStore } from 'pinia';
import { DEMO_MODE } from '../config';

function newPlayerId(): string {
  return `player_${Math.random().toString(36).slice(2, 10)}`;
}

// Stable id survives reloads: generated once and written back immediately
// so a fresh id isn't minted (and the founding gate below silently reset)
// on every page load.
function stablePlayerId(): string {
  const existing = localStorage.getItem('bjarnoy.playerId');
  if (existing) return existing;
  const id = newPlayerId();
  localStorage.setItem('bjarnoy.playerId', id);
  return id;
}

// "Already founded a settlement" only survives a reload in live mode, where
// the backend is the actual source of truth and can restore it (see
// `stores/world.ts`'s `restoreLiveSettlement`). Demo mode's `WorldModel` is
// pure in-memory simulation with nothing to restore, so every reload there
// intentionally starts a fresh session — persisting the flag would just
// strand the router's `/settlement` guard on a settlement that no longer
// exists anywhere.
const persistedSettlementId = DEMO_MODE ? null : localStorage.getItem('bjarnoy.settlementId');

// Deferred onboarding (zip 4): a stable local id is generated for free so
// the world can attribute the settlement the player is about to found; a
// display name / real account is only asked for after that first real move.
export const usePlayerStore = defineStore('player', {
  state: () => ({
    id: stablePlayerId(),
    nickname: localStorage.getItem('bjarnoy.nickname') as string | null,
    hasFoundedSettlement: persistedSettlementId !== null,
    settlementId: persistedSettlementId,
  }),
  getters: {
    // Live mode needs an owner name (2-100 chars) at the moment a settlement
    // is founded, before the nickname prompt zip 4 defers to afterwards ever
    // runs. Falls back to a name derived from the stable local id so
    // founding never blocks on a form.
    ownerName(state): string {
      return state.nickname ?? `Jarl-${state.id.slice(-4)}`;
    },
  },
  actions: {
    setNickname(name: string) {
      this.nickname = name;
      localStorage.setItem('bjarnoy.nickname', name);
    },
    // Persisted (live mode only, see `persistedSettlementId` above) so a
    // page reload keeps remembering "I already founded a settlement" —
    // otherwise the founding gate (`hasFoundedSettlement`) would reset and
    // a live-mode player could try to found a second one, only to be
    // rejected by the backend (`FoundingRejection.AlreadyFounded`).
    foundSettlement(settlementId: string) {
      this.hasFoundedSettlement = true;
      this.settlementId = settlementId;
      if (!DEMO_MODE) localStorage.setItem('bjarnoy.settlementId', settlementId);
    },
  },
});
