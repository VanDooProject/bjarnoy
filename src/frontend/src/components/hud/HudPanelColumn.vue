<script setup lang="ts">
// Desktop settlement view: the vertical icon column at the map's bottom left. Top to bottom: the building info switch, then
// one icon per dockable panel (Construction, Garrison, Armies, Quests) that has something to show right now. A panel icon
// collapses its panel to just the icon and opens it again (pressed = open); the panels themselves are HudPanelDock's.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useHudPanelContent } from '../../composables/useHudPanelContent';
import { useHudPanelShown } from '../../composables/useHudPanelShown';
import { useHudRail } from '../../composables/useHudRail';
import { animate, motionEnabled } from '../../lib/motion';
import { useQuests } from '../../composables/useQuests';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { COLUMN_BUTTON_GAP, HUD_PANEL_IDS, HUD_PANEL_LABEL_KEYS, type HudPanelId } from '../../lib/hud/hudPanelDock';
import QuestIcon from '../onboarding/QuestIcon.vue';
import BuildingInfoToggle from './BuildingInfoToggle.vue';
import HudIconButton from './HudIconButton.vue';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const prefs = useHudPrefsStore();
const content = useHudPanelContent();
const { shown, heldOpen } = useHudPanelShown();
const { hasNew } = useQuests();

const label = (id: HudPanelId) => t(HUD_PANEL_LABEL_KEYS[id] as 'hud.buildQueue.title');

const icons = computed(() => HUD_PANEL_IDS.filter((id) => content[id].value));

// The x comes from the dock (it moves right of the left panel columns that reach down to it); the rail reports its height back.
const { railHeight, railLeft } = useHudRail();
const columnStyle = computed(() => ({ left: `${railLeft.value}px`, gap: `${COLUMN_BUTTON_GAP}px` }));
const el = ref<HTMLElement | null>(null);
const SLIDE_MS = 180;

// A new x slides the rail from where it was (FLIP): the new left applies first, the transform animates back to it.
watch(railLeft, async (now, old) => {
  await nextTick();
  if (el.value && motionEnabled() && now !== old) {
    void animate(el.value, [{ transform: `translateX(${old - now}px)` }, { transform: 'translateX(0)' }], { duration: SLIDE_MS, easing: 'ease-out' });
  }
});

let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!el.value) return;
  railHeight.value = el.value.offsetHeight;
  if (typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(() => {
    if (el.value) railHeight.value = el.value.offsetHeight;
  });
  observer.observe(el.value);
});
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <div ref="el" class="hud-panel-column" data-testid="hud-panel-column" :style="columnStyle">
    <BuildingInfoToggle />
    <HudIconButton
      v-for="id in icons"
      :key="id"
      class="hud-panel-column__button"
      :data-testid="`hud-panel-toggle-${id}`"
      :pressed="shown[id].value"
      :disabled="heldOpen[id].value"
      :aria-label="label(id)"
      :title="t('hud.panelColumn.toggle', { panel: label(id) })"
      @click="prefs.togglePanel(id)"
    >
      <!-- Construction: a hammer. -->
      <svg v-if="id === 'construction'" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <path d="M14.5 4.5 19.5 9.5 17 12 12 7Z" />
        <path d="M13 8.5 5 16.5a1.8 1.8 0 0 0 2.5 2.5l8-8" />
      </svg>
      <!-- Garrison: a shield. -->
      <svg v-else-if="id === 'garrison'" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <path d="M12 3 19 5.8V11.5C19 16 16 19.4 12 21 8 19.4 5 16 5 11.5V5.8Z" />
        <path d="M12 3V21" />
      </svg>
      <!-- Armies: two crossed swords. -->
      <svg v-else-if="id === 'armies'" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <path d="M5 5 17.5 17.5M5 5V8.5M5 5H8.5" />
        <path d="M19 5 6.5 17.5M19 5V8.5M19 5H15.5" />
        <path d="M15.5 15.5 18.5 18.5M8.5 15.5 5.5 18.5" />
      </svg>
      <QuestIcon v-else />
      <!-- A collapsed tray cannot show its "new" dot itself. -->
      <span v-if="id === 'quests' && hasNew && !prefs.panels.quests.open" class="hud-panel-column__dot" data-testid="quest-ready-dot" aria-hidden="true" />
    </HudIconButton>
  </div>
</template>

<style scoped>
/* Bottom left, 16px from the bottom (a bottom-docked mobile bar's height is cleared through --hud-inset-bottom); the left
   edge is 16px unless the dock's left columns reach down to it (useHudRail). */
.hud-panel-column {
  position: absolute;
  bottom: calc(16px + var(--hud-inset-bottom, 0px));
  z-index: 10;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}
.hud-panel-column__button {
  position: relative;
}
.hud-panel-column__dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #e5533d;
  box-shadow: 0 0 0 2px var(--panel-bg);
}
</style>
