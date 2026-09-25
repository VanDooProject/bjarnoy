import { defineStore } from 'pinia';
import { randomUuid } from '../lib/uuid';

export interface GameNotification {
  id: string;
  message: string;
}

// In-game error/status toasts (bottom-left, see NotificationStack.vue):
// replaces the old pattern of piggybacking an action's error message onto
// whichever modal happened to still be open, which forced e.g. BuildingModal
// to pop open just to have somewhere to render a ring-menu upgrade failure.
// Multiple can stack; each is dismissed independently, either by the player
// or after its own timeout.
export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    items: [] as GameNotification[],
  }),
  actions: {
    push(message: string): string {
      const id = randomUuid();
      this.items.push({ id, message });
      return id;
    },
    dismiss(id: string) {
      this.items = this.items.filter((item) => item.id !== id);
    },
  },
});
