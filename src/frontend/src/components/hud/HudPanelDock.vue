<script setup lang="ts">
// Desktop settlement view: the four HUD panels dock to the four corners of the map area. Four corner regions (geometry in
// lib/hud/hudPanelDock.ts) hold the panels that sit in them, stacked in the fixed order Construction, Garrison, Armies,
// Quests (top corners downward, bottom corners upward), never past the map's vertical midline. A panel is shown when it is
// open (stores/hudPrefs.ts, toggled from HudPanelColumn) and has something to show (composables/useHudPanelContent.ts).
// Every panel enters and leaves through the one transition here, and a drag on a panel's header moves it to another corner
// (composables/useHudPanelDock.ts). The world view keeps ArmyPanel undocked and does not use this.
import { ref, type Component } from 'vue';
import { useHudPanelShown } from '../../composables/useHudPanelShown';
import { useHudPanelDock } from '../../composables/useHudPanelDock';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { DOCK_CORNERS, cornerStyle, panelsInCorner, type HudPanelId } from '../../lib/hud/hudPanelDock';
import ArmyPanel from './ArmyPanel.vue';
import BuildQueuePanel from './BuildQueuePanel.vue';
import TrainingQueuePanel from './TrainingQueuePanel.vue';
import QuestTray from '../onboarding/QuestTray.vue';

const emit = defineEmits<{ select: [coord: { q: number; r: number }]; 'focus-army': [armyId: string] }>();

const prefs = useHudPrefsStore();
const { shown: panelShown } = useHudPanelShown();
const root = ref<HTMLElement | null>(null);
const { dragging, onPointerDown, onEnter, onLeave } = useHudPanelDock(root);

const panelComponents: Record<HudPanelId, Component> = {
  construction: BuildQueuePanel,
  garrison: TrainingQueuePanel,
  armies: ArmyPanel,
  quests: QuestTray,
};

// Each panel's own events, passed up; a panel only gets the listeners it declares (an undeclared `select` would land on its
// root element as the browser's text-selection event).
const listeners: Record<HudPanelId, Record<string, unknown>> = {
  construction: { onSelect: (coord: { q: number; r: number }) => emit('select', coord) },
  garrison: {},
  armies: { onFocusArmy: (armyId: string) => emit('focus-army', armyId) },
  quests: {},
};

const shown = (id: HudPanelId) => panelShown[id].value;
const inCorner = (corner: (typeof DOCK_CORNERS)[number]) => panelsInCorner(prefs.panels, corner, shown);
</script>

<template>
  <div ref="root" class="hud-dock" data-testid="hud-dock" @pointerdown="onPointerDown">
    <TransitionGroup
      v-for="corner in DOCK_CORNERS"
      :key="corner"
      tag="div"
      :css="false"
      class="hud-dock__corner"
      :class="`hud-dock__corner--${corner}`"
      :style="cornerStyle(corner)"
      :data-testid="`hud-dock-${corner}`"
      @enter="onEnter"
      @leave="onLeave"
    >
      <div
        v-for="id in inCorner(corner)"
        :key="id"
        class="hud-dock__slot"
        :class="{ 'is-dragging': dragging === id }"
        :data-hud-panel="id"
        :data-corner="corner"
      >
        <component :is="panelComponents[id]" v-bind="listeners[id]" />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/* Covers the map area; only the panels take the pointer. One stacking context, so a dragged panel passes over the others. */
.hud-dock {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: none;
}
.hud-dock__corner {
  position: absolute;
  display: flex;
  gap: 8px;
  pointer-events: none;
}
.hud-dock__corner--top-left,
.hud-dock__corner--top-right {
  flex-direction: column;
}
/* Bottom corners stack upward: the panel nearest the corner comes first in the order. */
.hud-dock__corner--bottom-left,
.hud-dock__corner--bottom-right {
  flex-direction: column-reverse;
}
.hud-dock__corner--top-left,
.hud-dock__corner--bottom-left {
  align-items: flex-start;
}
.hud-dock__corner--top-right,
.hud-dock__corner--bottom-right {
  align-items: flex-end;
}
.hud-dock__slot {
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;
  min-height: 0;
  pointer-events: none;
}
/* The panels position themselves absolutely in the world view and on phones; docked, the corner region places them, and
   they shrink with their own scrolling when a stack gets tall. */
.hud-dock .hud-dock__slot > :deep(*) {
  position: static;
  inset: auto;
  z-index: auto;
  flex: 0 1 auto;
  min-height: 0;
  max-height: none;
  overflow-y: auto;
  pointer-events: auto;
}
.hud-dock :deep([data-dock-handle]) {
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.hud-dock__slot.is-dragging,
.hud-dock__slot.is-dragging :deep([data-dock-handle]) {
  cursor: grabbing;
}
.hud-dock__slot.is-dragging {
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.45));
}
</style>
