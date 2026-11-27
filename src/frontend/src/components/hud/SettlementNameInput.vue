<script setup lang="ts">
// The name field of a settlement rename, on the desktop card and in the phone bubble alike: focuses itself with the text
// selected, Enter saves, Esc cancels, and it locks while the save runs.
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SettlementRename } from '../../composables/useSettlementRename';
import type { MessageSchema } from '../../i18n/schema';

const props = defineProps<{ rename: SettlementRename }>();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const inputEl = ref<HTMLInputElement | null>(null);
onMounted(() => {
  inputEl.value?.focus({ preventScroll: true });
  inputEl.value?.select();
});

function onInput(e: Event) {
  props.rename.setDraft((e.target as HTMLInputElement).value);
}
</script>

<template>
  <input
    ref="inputEl"
    class="name-input"
    type="text"
    autocomplete="off"
    autocapitalize="words"
    spellcheck="false"
    :value="rename.draft"
    :disabled="rename.saving"
    :aria-label="t('hud.settlementRename.label')"
    :aria-invalid="rename.error ? 'true' : undefined"
    @input="onInput"
    @keydown.enter.prevent="rename.save()"
    @keydown.esc.stop.prevent="rename.cancel()"
  />
</template>

<style scoped>
.name-input {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: rgba(0, 0, 0, 0.35);
  color: var(--text);
  font-family: inherit;
  /* 16px: anything smaller makes iOS zoom the page when the field takes focus. */
  font-size: 16px;
  font-weight: 600;
  pointer-events: auto;
}
.name-input:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 0;
}
.name-input:disabled {
  opacity: 0.6;
}
.name-input[aria-invalid='true'] {
  border-color: var(--rival);
}
</style>
