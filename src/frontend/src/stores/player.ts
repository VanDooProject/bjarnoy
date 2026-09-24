import { defineStore } from 'pinia';
import { DEMO_MODE } from '../config';
import { randomUuid } from '../lib/uuid';

// Now also sent as the `X-Owner-Id` header proving ownership of an
// anonymously-founded settlement (see SettlementOwnershipEndpointFilter on
// the backend and api/client.ts's `ownerHeader`) — so this needs to be an
// unguessable bearer id, not just a display-stable one. 122 bits from a
// CSPRNG; `Math.random`, used previously, is neither cryptographically random
// nor wide enough (~41 bits) to serve as a credential, only as a display id.
// Not `crypto.randomUUID` directly: it does not exist outside a secure
// context, and this runs during store creation, so on a plain-HTTP deployment
// it took the whole app down before it mounted — see `lib/uuid.ts`.
function newPlayerId(): string {
  return `player_${randomUuid()}`;
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

// "Join another world": worldId -> settlementId for every world this player
// has already founded a realm in, so `enterWorld` can restore the right
// settlement without a backend round trip once the membership check has
// already told it a realm exists. Same demo-mode guard as
// `persistedSettlementId` above — demo mode has only the one local world and
// nothing here would ever be read back anyway.
function stableSettlementsByWorld(): Record<string, string> {
  const raw = localStorage.getItem('bjarnoy.settlementsByWorld');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
const persistedSettlementsByWorld = DEMO_MODE ? {} : stableSettlementsByWorld();

// zip 6a: has this player already finished the guided landing-page
// onboarding (longhouse + 2 more buildings)? Only a router-guard latch — the
// live "how many buildings so far" count itself always comes straight from
// WorldModel.countBuildings (see stores/world.ts's hud.buildingsPlaced), so
// this flag can't drift from what's actually built. Demo mode resets every
// reload, same as persistedSettlementId above.
const persistedOnboardingComplete = DEMO_MODE ? false : localStorage.getItem('bjarnoy.onboardingComplete') === '1';

// Design handoff "2a": has the player already dismissed ("Later") the
// profile-mark nudge that replaces the old forced nickname modal? Same
// persistence shape as persistedOnboardingComplete just above — demo mode
// resets every reload (nothing there survives a reload anyway), live mode
// remembers it so "Later" actually means later, not "ask again on every
// visit".
const persistedProfileNudgeDismissed = DEMO_MODE
  ? false
  : localStorage.getItem('bjarnoy.profileNudgeDismissed') === '1';

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
    profileNudgeDismissed: persistedProfileNudgeDismissed,
    settlementsByWorld: persistedSettlementsByWorld,
    // Player logout/login gate: which account (if any) last logged out on
    // this device. Read straight from localStorage at store creation (same
    // as the fields above) rather than only kept in Pinia state, so a fresh
    // store instance — e.g. after the logout flow's own full page reload
    // (composables/useLogout.ts) — sees it without anything re-hydrating it.
    lastAccount: localStorage.getItem('bjarnoy.lastAccount') as string | null,
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
    // `worldId` is optional (and, before "join another world", every call
    // site omits it) so this keeps working exactly as before wherever it's
    // not passed — only when it is does founding also record the realm
    // under `settlementsByWorld`, for `enterWorld` to find later.
    foundSettlement(settlementId: string, worldId?: string) {
      this.hasFoundedSettlement = true;
      this.settlementId = settlementId;
      if (!DEMO_MODE) localStorage.setItem('bjarnoy.settlementId', settlementId);
      if (worldId) {
        this.settlementsByWorld[worldId] = settlementId;
        if (!DEMO_MODE) {
          localStorage.setItem('bjarnoy.settlementsByWorld', JSON.stringify(this.settlementsByWorld));
        }
      }
    },
    // Settlement switcher (issue #55): a player who founded a second
    // settlement via a settler convoy points the persisted "current
    // settlement" at a different one they own — same persistence shape as
    // foundSettlement, just without also setting hasFoundedSettlement (it is
    // already true). The caller is still responsible for reloading the
    // WorldModel for the new id — see world.restoreLiveSettlement.
    switchSettlement(settlementId: string) {
      this.settlementId = settlementId;
      if (!DEMO_MODE) localStorage.setItem('bjarnoy.settlementId', settlementId);
    },
    // "Join another world" (store half — UI comes later): called once
    // `world.joinWorld`'s membership check has come back, so this is the one
    // place `hasFoundedSettlement`/`onboardingComplete` switch to match
    // whichever world was just entered rather than the one left behind. A
    // world where this owner already has a realm (`settlementId` non-null)
    // skips straight past onboarding, same as a reload restoring an existing
    // settlement does today; a brand-new world (`settlementId: null`)
    // re-runs the founding/onboarding flow from scratch. Does not touch
    // `profileNudgeDismissed` — that's a one-time account-level nudge, not
    // per-world state.
    enterWorld(worldId: string, settlementId: string | null) {
      this.settlementId = settlementId;
      this.hasFoundedSettlement = settlementId !== null;
      this.onboardingComplete = settlementId !== null;
      if (!DEMO_MODE) {
        if (settlementId !== null) {
          localStorage.setItem('bjarnoy.settlementId', settlementId);
        } else {
          localStorage.removeItem('bjarnoy.settlementId');
        }
        localStorage.setItem('bjarnoy.onboardingComplete', this.onboardingComplete ? '1' : '0');
      }
      if (settlementId !== null) {
        this.settlementsByWorld[worldId] = settlementId;
        if (!DEMO_MODE) {
          localStorage.setItem('bjarnoy.settlementsByWorld', JSON.stringify(this.settlementsByWorld));
        }
      }
    },
    completeOnboarding() {
      this.onboardingComplete = true;
      if (!DEMO_MODE) localStorage.setItem('bjarnoy.onboardingComplete', '1');
    },
    // Design handoff "2a": "Later" on the profile-mark nudge (ProfileNudge.vue)
    // — same persistence shape as completeOnboarding above.
    dismissProfileNudge() {
      this.profileNudgeDismissed = true;
      if (!DEMO_MODE) localStorage.setItem('bjarnoy.profileNudgeDismissed', '1');
    },
    // Player logout/login gate: the local-identity half of logging out (see
    // composables/useLogout.ts for the full flow, which also drops the
    // in-memory auth session and reloads the page). Removes every key that
    // ties this browser to the account that's logging out, so the founding
    // gate, onboarding progress and nickname don't leak into whatever
    // session comes next — but keeps `bjarnoy.worldId`/`bjarnoy.locale`,
    // which describe this device's context rather than an identity, and
    // records `lastAccount` so the landing page can offer a "log back in"
    // gate (ReturningLoginPanel.vue) instead of silently starting a brand
    // new anonymous founding flow for someone who still has a real account.
    forgetLocalIdentity(lastAccountName: string) {
      localStorage.removeItem('bjarnoy.playerId');
      localStorage.removeItem('bjarnoy.settlementId');
      localStorage.removeItem('bjarnoy.settlementsByWorld');
      localStorage.removeItem('bjarnoy.onboardingComplete');
      localStorage.removeItem('bjarnoy.profileNudgeDismissed');
      localStorage.removeItem('bjarnoy.nickname');
      localStorage.setItem('bjarnoy.lastAccount', lastAccountName);
      this.lastAccount = lastAccountName;
    },
    // "Start a new realm instead" on ReturningLoginPanel.vue: the visitor
    // declines to log back in, so the gate should stop showing and the
    // normal founding hero should return.
    forgetLastAccount() {
      this.lastAccount = null;
      localStorage.removeItem('bjarnoy.lastAccount');
    },
  },
});
