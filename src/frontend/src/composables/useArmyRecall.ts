// The "Recall" action of an army row, shared by ArmyPanel (desktop) and
// QueueDrawer (mobile): the pending state while the request runs and the
// refusal text shown on the row the player clicked when the API says no.
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../stores/world';
import { apiErrorMessage } from '../i18n/apiErrors';
import type { ArmyResponse } from '../api/types';
import type { MessageSchema } from '../i18n/schema';

/** What a refusal was about: once the army's movement changes (a poll, a field order), the refusal is out of date. */
function armyState(army: ArmyResponse | undefined): string | null {
  if (!army) return null;
  const m = army.movement;
  return [army.atHome, army.supporting, m?.isReturning ?? null, m?.arrivesAt ?? null].join('|');
}

export function useArmyRecall() {
  const world = useWorldStore();
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

  const pending = ref<string[]>([]);
  const refusals = ref<Record<string, { message: string; state: string | null }>>({});

  const stateOf = (armyId: string) => armyState(world.armies.find((a) => a.id === armyId));

  async function recall(armyId: string) {
    if (pending.value.includes(armyId)) return;
    pending.value = [...pending.value, armyId];
    delete refusals.value[armyId];
    try {
      await world.recallArmyLive(armyId);
    } catch (err) {
      refusals.value[armyId] = {
        message: apiErrorMessage(err, t('hud.armyPanel.recallFailed')),
        state: stateOf(armyId),
      };
    } finally {
      pending.value = pending.value.filter((id) => id !== armyId);
    }
  }

  function isRecalling(armyId: string): boolean {
    return pending.value.includes(armyId);
  }

  /** The refusal text for this army's row, or null when its last recall wasn't refused or the army has moved on since. */
  function refusalFor(armyId: string): string | null {
    const refusal = refusals.value[armyId];
    return refusal && refusal.state === stateOf(armyId) ? refusal.message : null;
  }

  return { isRecalling, recall, refusalFor };
}
