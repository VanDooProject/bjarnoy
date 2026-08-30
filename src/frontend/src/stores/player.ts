import { defineStore } from 'pinia';
import { DEMO_MODE } from '../config';

// Now also sent as the `X-Owner-Id` header proving ownership of an
// anonymously-founded settlement (see SettlementOwnershipEndpointFilter on
// the backend and api/client.ts's `ownerHeader`) — so this needs to be an
// unguessable bearer id, not just a display-stable one. `crypto.randomUUID`
// (122 bits, CSPRNG-backed) is what every supported browser offers today;
// `Math.random`, used previously, is neither cryptographically random nor
// wide enough (~41 bits) to serve as a credential, only as a display id.
function newPlayerId(): string {
  return `player_${crypto.randomUUID()}`;
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

// zip 6a: has this player already finished the guided landing-page
// onboarding (longhouse + 2 more buildings)? Only a router-guard latch — the
// live "how many buildings so far" count itself always comes straight from
// WorldModel.countBuildings (see stores/world.ts's hud.buildingsPlaced), so
// this flag can't drift from what's actually built. Demo mode resets every
// reload, same as persistedSettlementId above.
const persistedOnboardingComplete = DEMO_MODE ? false : localStorage.getItem('bjarnoy.onboardingComplete') === '1';

// Deferred onboarding (zip 4): a stable local id is generated for free so
// the world can attribute the settlement the player is about to found; a
// display name / real account is only asked for after that first real move.
export const usePlayerStore = defineStore('player', {
  state: () => ({
    id: stablePlayerId(),
    nickname: localStorage.getItem('bjarnoy.nickname') as string | null,
    hasFoundedSettlement: persistedSettlementId !== null,
    settlementId: persistedSettlementId,
    onboardingComplete: persistedOnboardingComplete,
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
    completeOnboarding() {
      this.onboardingComplete = true;
      if (!DEMO_MODE) localStorage.setItem('bjarnoy.onboardingComplete', '1');
    },
  },
});
