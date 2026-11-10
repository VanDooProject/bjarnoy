// The "Recall" action of an army row, shared by ArmyPanel (desktop) and
// QueueDrawer (mobile): the pending state while the request runs and the
// refusal text shown on the row the player clicked when the API says no.
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../stores/world';
import { apiErrorMessage } from '../i18n/apiErrors';
import type { MessageSchema } from '../i18n/schema';

export function useArmyRecall() {
  const world = useWorldStore();
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

  const recallingId = ref<string | null>(null);
  const refusal = ref<{ armyId: string; message: string } | null>(null);

  async function recall(armyId: string) {
    recallingId.value = armyId;
    refusal.value = null;
    try {
      await world.recallArmyLive(armyId);
    } catch (err) {
      refusal.value = { armyId, message: apiErrorMessage(err, t('hud.armyPanel.recallFailed')) };
    } finally {
      recallingId.value = null;
    }
  }

  /** The refusal text for this army's row, or null when its last recall wasn't refused. */
  function refusalFor(armyId: string): string | null {
    return refusal.value?.armyId === armyId ? refusal.value.message : null;
  }

  return { recallingId, recall, refusalFor };
}
