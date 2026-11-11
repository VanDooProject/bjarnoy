<script setup lang="ts">
// The chevron at the right end of a docked panel's header (HudPanelDock.vue places it): collapses the panel to its header
// and expands it again. One component for all four panels, so none of them carries collapse code of its own.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { HUD_PANEL_LABEL_KEYS, type HudPanelId } from '../../lib/hud/hudPanelDock';

const props = defineProps<{ panel: HudPanelId; collapsed: boolean }>();
defineEmits<{ toggle: [] }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const name = computed(() => t(HUD_PANEL_LABEL_KEYS[props.panel] as 'hud.buildQueue.title'));
const label = computed(() => t(props.collapsed ? 'hud.panelColumn.expand' : 'hud.panelColumn.collapse', { panel: name.value }));
</script>

<template>
  <button
    type="button"
    class="hud-panel-collapse"
    :class="{ 'is-collapsed': collapsed }"
    :aria-expanded="!collapsed"
    :aria-label="label"
    :title="label"
    :data-testid="`hud-panel-collapse-${panel}`"
    @click="$emit('toggle')"
  >
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6 15 12 9 18 15" />
    </svg>
  </button>
</template>

<style scoped>
.hud-panel-collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: var(--muted);
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}
.hud-panel-collapse:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.08);
}
.hud-panel-collapse:focus-visible {
  outline: 2px solid var(--gold, #ffc55c);
  outline-offset: 1px;
}
.hud-panel-collapse svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 160ms ease-out;
}
.hud-panel-collapse.is-collapsed svg {
  transform: rotate(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .hud-panel-collapse svg {
    transition: none;
  }
}
</style>
