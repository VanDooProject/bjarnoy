// Renaming the selected settlement from the top bar. The state, the validation and the save live here once;
// the desktop popover and the phone bubble's edit mode are two shapes over the same instance.
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../stores/world';
import { apiErrorMessage } from '../i18n/apiErrors';
import type { MessageSchema } from '../i18n/schema';

/** Same bounds as founding's `Name` (`SettlementContracts.cs`), counted after trimming. */
export const SETTLEMENT_NAME_MIN = 2;
export const SETTLEMENT_NAME_MAX = 100;

export function useSettlementRename() {
  const world = useWorldStore();
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

  const editing = ref(false);
  const draft = ref('');
  const saving = ref(false);
  /** The server's refusal of the last save, shown until the player edits again. */
  const serverError = ref<string | null>(null);

  const trimmed = computed(() => draft.value.trim());
  const tooShort = computed(() => trimmed.value.length < SETTLEMENT_NAME_MIN);
  const tooLong = computed(() => trimmed.value.length > SETTLEMENT_NAME_MAX);
  /** The counter line: the typed length against the maximum. */
  const counter = computed(() => `${draft.value.length} / ${SETTLEMENT_NAME_MAX}`);
  const error = computed(() => {
    if (serverError.value) return serverError.value;
    if (tooShort.value) return t('hud.settlementRename.tooShort', { min: SETTLEMENT_NAME_MIN });
    if (tooLong.value) return t('hud.settlementRename.tooLong', { max: SETTLEMENT_NAME_MAX });
    return null;
  });
  const canSave = computed(() => !saving.value && !tooShort.value && !tooLong.value);

  function begin() {
    draft.value = world.hud.settlementName;
    serverError.value = null;
    editing.value = true;
  }

  function cancel() {
    if (saving.value) return;
    editing.value = false;
    serverError.value = null;
  }

  function setDraft(value: string) {
    draft.value = value;
    serverError.value = null;
  }

  /** Saves the trimmed name; the field closes on success and stays open, with the refusal shown, on failure. */
  async function save(): Promise<boolean> {
    if (!canSave.value) return false;
    saving.value = true;
    serverError.value = null;
    try {
      await world.renameSettlement(trimmed.value);
      editing.value = false;
      return true;
    } catch (err) {
      serverError.value = apiErrorMessage(err, t('hud.settlementRename.failed'));
      return false;
    } finally {
      saving.value = false;
    }
  }

  // Reactive, so a component handed this object reads `rename.draft` in its template without `.value`.
  return reactive({ editing, draft, saving, trimmed, counter, error, canSave, begin, cancel, setDraft, save });
}

export type SettlementRename = ReturnType<typeof useSettlementRename>;
