<script setup lang="ts">
// The chevron at the right end of a docked panel's header (HudPanelDock.vue places it): collapses the panel to its header
// and expands it again. One component for all four panels, so none of them carries collapse code of its own.
import { computed, ref, watch } from 'vue';
import { animate } from '../../lib/motion';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { HUD_PANEL_LABEL_KEYS, type HudPanelId } from '../../lib/hud/hudPanelDock';

/** Same length as the panel's roll (HudPanelDock's COLLAPSE_MS). */
const TURN_MS = 200;

const props = defineProps<{ panel: HudPanelId; collapsed: boolean }>();
defineEmits<{ toggle: [] }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const name = computed(() => t(HUD_PANEL_LABEL_KEYS[props.panel] as 'hud.buildQueue.title'));
// The chevron turns with the panel (points up while open, down while collapsed). The turn goes through lib/motion like every
// HUD animation, so the player's motion setting decides; the resting angle is the class's.
const icon = ref<SVGSVGElement | null>(null);
watch(
  () => props.collapsed,
  (collapsed) => {
    if (!icon.value) return;
    void animate(icon.value, [{ transform: `rotate(${collapsed ? 0 : 180}deg)` }, { transform: `rotate(${collapsed ? 180 : 0}deg)` }], {
      duration: TURN_MS,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    });
  },
);
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
    <svg ref="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d="M5 15.5 12 8.5 19 15.5" />
    </svg>
  </button>
</template>

<style scoped>
.hud-panel-collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
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
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.hud-panel-collapse.is-collapsed svg {
  transform: rotate(180deg);
}
</style>
