<script setup lang="ts">
// The desktop rename popover: a small card hanging under the settlement's name (the parent's positioned box) with the
// name field, its counter, and Cancel / Save. Outside click cancels, like Esc. The phone edits in the bubble itself.
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import SettlementNameInput from './SettlementNameInput.vue';
import type { SettlementRename } from '../../composables/useSettlementRename';
import type { MessageSchema } from '../../i18n/schema';

const props = defineProps<{ rename: SettlementRename }>();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const cardEl = ref<HTMLElement | null>(null);
function onOutsidePointerDown(e: Event) {
  if (cardEl.value && !cardEl.value.contains(e.target as Node)) props.rename.cancel();
}
onMounted(() => document.addEventListener('pointerdown', onOutsidePointerDown, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointerDown, true));
</script>

<template>
  <div ref="cardEl" class="rename-card" role="dialog" :aria-label="t('hud.settlementRename.label')">
    <span class="label">{{ t('hud.settlementRename.label') }}</span>
    <SettlementNameInput :rename="rename" />
    <div class="hint-row">
      <span class="error" role="alert">{{ rename.error }}</span>
      <span class="counter">{{ rename.counter }}</span>
    </div>
    <div class="actions">
      <button type="button" class="btn" :disabled="rename.saving" @click="rename.cancel()">
        {{ t('hud.settlementRename.cancel') }}
      </button>
      <button type="button" class="btn btn-primary" :disabled="!rename.canSave" @click="rename.save()">
        <span v-if="rename.saving" class="spinner" aria-hidden="true" />
        {{ t('hud.settlementRename.save') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.rename-card {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  z-index: 50;
  width: 280px;
  max-width: calc(100vw - 32px);
  box-sizing: border-box;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(10, 20, 27, 0.98);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  transform-origin: top left;
  pointer-events: auto;
}
.label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.hint-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  min-height: 16px;
  font-size: 12px;
}
.error {
  color: var(--rival);
}
.counter {
  margin-left: auto;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}
.btn:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 1px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn-primary {
  background: var(--gold);
  border-color: var(--gold);
  color: #20160a;
}
.btn-primary:hover:not(:disabled) {
  background: var(--gold);
  filter: brightness(1.08);
}
.spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(32, 22, 10, 0.35);
  border-top-color: #20160a;
  animation: rename-spin 0.8s linear infinite;
}
@keyframes rename-spin {
  to {
    transform: rotate(360deg);
  }
}
html[data-hud-motion='reduced'] .spinner {
  animation-duration: 2s;
}
</style>
