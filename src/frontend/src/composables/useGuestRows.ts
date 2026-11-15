// Shared guest-army rows behind TrainingQueuePanel.vue's Guests section and
// QueueDrawer's — the host's view of who is stationed at this settlement
// (issue #40 phase 4) plus its "Send home" action, so desktop and the mobile
// drawer don't each re-derive the rows or the pending/error handling.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiErrorMessage } from '../i18n/apiErrors';
import { useWorldStore } from '../stores/world';
import { unitName } from '../i18n/catalogueNames';
import type { MessageSchema } from '../i18n/schema';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { stackUpkeepPerHour, stacksUpkeepPerHour } from '../lib/units/garrisonUpkeep';

export interface GuestUnitRow {
  key: string;
  label: string;
  count: number;
  foodPerHour: number;
}

export interface GuestRow {
  key: string;
  ownerName: string;
  /** What the whole guest army eats per hour. */
  foodPerHour: number;
  units: GuestUnitRow[];
}

export function useGuestRows() {
  const world = useWorldStore();
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
  const catalogue = useUnitCatalogueStore();

  const guests = computed<GuestRow[]>(() =>
    world.guestArmies.map((g) => ({
      key: g.armyId,
      ownerName: world.model.getSettlement(g.ownerSettlementId)?.name ?? t('hud.trainingQueue.unknownSettlement'),
      foodPerHour: stacksUpkeepPerHour(g.stacks, catalogue.byType),
      units: g.stacks
        .filter((s) => s.count > 0)
        .map((s) => ({
          key: s.unit,
          label: unitName(s.unit),
          count: s.count,
          foodPerHour: stackUpkeepPerHour(s, catalogue.byType),
        })),
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
      error.value = apiErrorMessage(err, t('hud.trainingQueue.sendHomeError'));
    } finally {
      sendingId.value = null;
    }
  }

  return { guests, sendingId, error, sendHome };
}
