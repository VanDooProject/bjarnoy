import { defineStore } from 'pinia';

function newPlayerId(): string {
  return `player_${Math.random().toString(36).slice(2, 10)}`;
}

// Deferred onboarding (zip 4): a stable local id is generated for free so
// the world can attribute the settlement the player is about to found; a
// display name / real account is only asked for after that first real move.
export const usePlayerStore = defineStore('player', {
  state: () => ({
    id: localStorage.getItem('bjarnoy.playerId') ?? newPlayerId(),
    nickname: localStorage.getItem('bjarnoy.nickname') as string | null,
    hasFoundedSettlement: false,
    settlementId: null as string | null,
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
    persistId() {
      localStorage.setItem('bjarnoy.playerId', this.id);
    },
    setNickname(name: string) {
      this.nickname = name;
      localStorage.setItem('bjarnoy.nickname', name);
    },
    foundSettlement(settlementId: string) {
      this.hasFoundedSettlement = true;
      this.settlementId = settlementId;
    },
  },
});
