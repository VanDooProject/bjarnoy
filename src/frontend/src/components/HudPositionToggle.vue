<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { useHudPositionPreference, type HudPosition } from '../composables/useHudPosition';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const { preference, setPreference } = useHudPositionPreference();

const POSITIONS: HudPosition[] = ['top', 'bottom'];

function label(position: HudPosition): string {
  return t(`hud.positionToggle.${position}`);
}
</script>

<template>
  <div class="hud-position-toggle" role="group" :aria-label="t('hud.positionToggle.label')">
    <button
      v-for="position in POSITIONS"
      :key="position"
      type="button"
      class="option"
      :class="{ active: preference === position }"
      :aria-pressed="preference === position"
      :title="label(position)"
      @click="setPreference(position)"
    >
      {{ label(position) }}
    </button>
  </div>
</template>

<style scoped>
.hud-position-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
}
.option {
  background: transparent;
  border: none;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
}
.option:hover {
  color: var(--text);
}
.option.active {
  background: var(--gold);
  color: #1a1208;
}
</style>
