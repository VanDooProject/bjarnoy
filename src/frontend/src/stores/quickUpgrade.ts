import { defineStore } from 'pinia';
import { useAuthStore } from './auth';

/**
 * Quick upgrade (premium): while it applies, a click or tap on one of the player's own upgradable buildings orders its next
 * level at once, without the ring menu. Two ways in, one rule: the quick upgrade MODE (`on`, turned on by holding the Upgrade
 * bubble; every tap on an own building then upgrades it) and a held Shift key (`shiftHeld`, desktop, no mode). Free accounts
 * get neither: `available` is false for them, so nothing here ever applies. See MapView.vue for what happens on a click and
 * composables/useQuickUpgradeInput.ts for how the mode is turned off again.
 */
export const useQuickUpgradeStore = defineStore('quickUpgrade', {
  state: () => ({
    /** The mode: turned on by `start`, off by `stop`. */
    on: false,
    /** Shift is held right now. */
    shiftHeld: false,
  }),
  getters: {
    /** The account may use quick upgrade at all (premium). */
    available: () => useAuthStore().isPremium,
    /** The mode is on (and the account may use it). */
    active(): boolean {
      return this.on && this.available;
    },
    /** A click on an own building upgrades it: the mode is on, or Shift is held. */
    applies(): boolean {
      return this.available && (this.on || this.shiftHeld);
    },
  },
  actions: {
    /** Turns the mode on; nothing for an account without premium. */
    start() {
      if (this.available) this.on = true;
    },
    stop() {
      this.on = false;
    },
    setShift(held: boolean) {
      this.shiftHeld = held;
    },
  },
});
