<script setup lang="ts">
// Desktop settlement view: the vertical icon column at the map's bottom left. Top to bottom: the building info switch, then
// one icon per dockable panel (Construction, Garrison, Armies, Quests) that has something to show right now. A panel icon
// collapses its panel to just the icon and opens it again (pressed = open); the panels themselves are HudPanelDock's.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useHudPanelContent } from '../../composables/useHudPanelContent';
import { useQuests } from '../../composables/useQuests';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { COLUMN_BUTTON_GAP, DOCK_GUTTER, HUD_PANEL_IDS, type HudPanelId } from '../../lib/hud/hudPanelDock';
import QuestIcon from '../onboarding/QuestIcon.vue';
import BuildingInfoToggle from './BuildingInfoToggle.vue';
import HudIconButton from './HudIconButton.vue';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const prefs = useHudPrefsStore();
const content = useHudPanelContent();
const { hasNew } = useQuests();

const labelKey: Record<HudPanelId, string> = {
  construction: 'hud.buildQueue.title',
  garrison: 'hud.trainingQueue.garrison',
  armies: 'hud.armyPanel.title',
  quests: 'quests.title',
};
const label = (id: HudPanelId) => t(labelKey[id] as 'hud.buildQueue.title');

const icons = computed(() => HUD_PANEL_IDS.filter((id) => content[id].value));
const columnStyle = { left: `${DOCK_GUTTER}px`, gap: `${COLUMN_BUTTON_GAP}px` };
</script>

<template>
  <div class="hud-panel-column" data-testid="hud-panel-column" :style="columnStyle">
    <BuildingInfoToggle />
    <HudIconButton
      v-for="id in icons"
      :key="id"
      class="hud-panel-column__button"
      :data-testid="`hud-panel-toggle-${id}`"
      :pressed="prefs.panels[id].open"
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
/* Bottom left, 16px from the edges (a bottom-docked mobile bar's height is cleared through --hud-inset-bottom). */
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
