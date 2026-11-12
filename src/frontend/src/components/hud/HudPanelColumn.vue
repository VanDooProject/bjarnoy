<script setup lang="ts">
// Desktop settlement view: the vertical icon column at the map's bottom left. Top to bottom: the building info switch, then
// one icon per dockable panel (Construction, Garrison, Armies, Quests) that has something to show right now (Construction is
// the exception: its icon is always there, dimmed and disabled while nothing is being built). A panel icon
// collapses its panel to just the icon and opens it again (pressed = open), and a collapsed icon carries a count badge for
// what waits in its panel; the panels themselves are HudPanelDock's.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useHudPanelContent, useHudPanelCounts } from '../../composables/useHudPanelContent';
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
const counts = useHudPanelCounts();
const { shown, heldOpen } = useHudPanelShown();
const { hasNew } = useQuests();

const label = (id: HudPanelId) => t(HUD_PANEL_LABEL_KEYS[id] as 'hud.buildQueue.title');

// Construction is always in the column; the others only while their panel has something to show.
const icons = computed(() => HUD_PANEL_IDS.filter((id) => id === 'construction' || content[id].value));
const isEmpty = (id: HudPanelId) => id === 'construction' && !content.construction.value;
// The badge: only on a collapsed icon (panel closed, not held open) and only for a count above zero.
const badge = (id: HudPanelId) => (!prefs.panels[id].open && !shown[id].value && counts[id].value > 0 ? counts[id].value : 0);
const ariaLabel = (id: HudPanelId) => (badge(id) ? t('hud.panelColumn.withCount', { panel: label(id), count: badge(id) }) : label(id));

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
      :class="{ 'hud-panel-column__button--empty': isEmpty(id) }"
      :disabled="heldOpen[id].value || isEmpty(id)"
      :aria-label="ariaLabel(id)"
      :title="isEmpty(id) ? t('hud.panelColumn.constructionEmpty') : t('hud.panelColumn.toggle', { panel: label(id) })"
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
      <span v-if="badge(id)" class="hud-panel-column__badge" :data-testid="`hud-panel-badge-${id}`" aria-hidden="true">{{ badge(id) }}</span>
      <!-- A collapsed tray cannot show its "new" dot itself; the quest count badge wins over it. -->
      <span v-else-if="id === 'quests' && hasNew && !prefs.panels.quests.open" class="hud-panel-column__dot" data-testid="quest-ready-dot" aria-hidden="true" />
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
.hud-panel-column__button--empty {
  opacity: 0.4;
}
.hud-panel-column__badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 8px;
  background: var(--gold, #ffc55c);
  color: #1a1408;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 2px var(--panel-bg);
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
