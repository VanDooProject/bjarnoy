// Shared guest-army rows behind TrainingQueuePanel.vue's Guests section and
// QueueDrawer's — the host's view of who is stationed at this settlement
// (issue #40 phase 4) plus its "Send home" action, so desktop and the mobile
// drawer don't each re-derive the rows or the pending/error handling.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError } from '../api/client';
import { useWorldStore } from '../stores/world';
import { unitName } from '../i18n/catalogueNames';
import type { MessageSchema } from '../i18n/schema';

export interface GuestRow {
  key: string;
  ownerName: string;
  composition: string;
}

export function useGuestRows() {
  const world = useWorldStore();
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

  const guests = computed<GuestRow[]>(() =>
    world.guestArmies.map((g) => ({
      key: g.armyId,
      ownerName: world.model.getSettlement(g.ownerSettlementId)?.name ?? t('hud.trainingQueue.unknownSettlement'),
      composition: g.stacks
        .filter((s) => s.count > 0)
        .map((s) => t('hud.trainingQueue.orderName', { count: s.count, unit: unitName(s.unit) }))
        .join(', ') || '—',
    })),
  );

  const sendingId = ref<string | null>(null);
  const error = ref<string | null>(null);

  async function sendHome(armyId: string) {
    sendingId.value = armyId;
    error.value = null;
    try {
      await world.sendGuestHomeLive(armyId);
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : t('hud.trainingQueue.sendHomeError');
    } finally {
      sendingId.value = null;
    }
  }

  return { guests, sendingId, error, sendHome };
}
