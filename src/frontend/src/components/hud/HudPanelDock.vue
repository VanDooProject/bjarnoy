<script setup lang="ts">
// Desktop settlement view: the four HUD panels dock into full-height columns on the left and right of the map area (model
// and geometry in lib/hud/hudPanelDock.ts). Each side holds columns, outermost first; a column stacks its top-aligned
// panels from the top and its bottom-aligned ones from the bottom, and they only shrink (their panels scroll) when the two
// groups do not fit together. A panel is shown when it is open (stores/hudPrefs.ts, toggled from HudPanelColumn) and has
// something to show (composables/useHudPanelContent.ts). Every panel enters and leaves through the one transition here,
// a drag on a panel's header moves it to another group (composables/useHudPanelDock.ts), and the dock owns collapsing a
// panel to its header (HudPanelCollapseButton) so the four panels carry no collapse code. The left columns also tell the
// icon rail where to sit (composables/useHudRail.ts). The world view keeps ArmyPanel undocked and does not use this.
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type Component } from 'vue';
import { useHudPanelShown } from '../../composables/useHudPanelShown';
import { useHudPanelDock } from '../../composables/useHudPanelDock';
import { useHudRail } from '../../composables/useHudRail';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { animate, motionEnabled } from '../../lib/motion';
import {
  COLUMN_BUTTON_SIZE,
  DOCK_COLUMN_GAP,
  DOCK_GUTTER,
  HUD_PANEL_IDS,
  columnsOnSide,
  railLeft as computeRailLeft,
  type DockAlign,
  type DockSide,
  type HudPanelId,
} from '../../lib/hud/hudPanelDock';
import ArmyPanel from './ArmyPanel.vue';
import BuildQueuePanel from './BuildQueuePanel.vue';
import HudPanelCollapseButton from './HudPanelCollapseButton.vue';
import TrainingQueuePanel from './TrainingQueuePanel.vue';
import QuestTray from '../onboarding/QuestTray.vue';

const emit = defineEmits<{ select: [coord: { q: number; r: number }]; 'focus-army': [armyId: string] }>();

const SIDES: DockSide[] = ['left', 'right'];
const ALIGNS: DockAlign[] = ['top', 'bottom'];
const COLLAPSE_MS = 160;
const CHEVRON_PX = 24;

const prefs = useHudPrefsStore();
const { shown: panelShown, heldOpen: panelHeld } = useHudPanelShown();
const { railHeight, railLeft } = useHudRail();
const root = ref<HTMLElement | null>(null);
const { dragging, indicator, onPointerDown, onEnter, onLeave } = useHudPanelDock(root);

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
const columns = computed(() => ({
  left: columnsOnSide(prefs.panels, 'left', shown),
  right: columnsOnSide(prefs.panels, 'right', shown),
}));
const isEmpty = (c: { top: HudPanelId[]; bottom: HudPanelId[] }) => c.top.length + c.bottom.length === 0;
const columnStyle = (side: DockSide, c: { top: HudPanelId[]; bottom: HudPanelId[] }) =>
  isEmpty(c) ? undefined : { [side === 'left' ? 'marginInlineEnd' : 'marginInlineStart']: `${DOCK_COLUMN_GAP}px` };

// ---- collapse: a panel clipped to its header ----

/** A draft keeps its Armies panel open, whatever was stored. */
const isCollapsed = (id: HudPanelId) => prefs.panels[id].collapsed && !panelHeld[id].value;

interface HandleBox {
  /** The chevron's top left, relative to the slot. */
  left: number;
  top: number;
  /** The slot's height when clipped to its header (header bottom plus the panel's bottom padding). */
  collapsedHeight: number;
}
const handles = ref<Partial<Record<HudPanelId, HandleBox>>>({});

const px = (v: string) => parseFloat(v) || 0;

function measureHandles() {
  const root_ = root.value;
  if (!root_) return;
  const next: Partial<Record<HudPanelId, HandleBox>> = {};
  for (const slot of root_.querySelectorAll<HTMLElement>('[data-hud-panel]')) {
    const handle = slot.querySelector<HTMLElement>('[data-dock-handle]');
    const panel = slot.firstElementChild;
    if (!handle || !panel) continue;
    const s = slot.getBoundingClientRect();
    const h = handle.getBoundingClientRect();
    const top = h.top - s.top;
    const hs = getComputedStyle(handle);
    const ps = getComputedStyle(panel);
    next[slot.dataset.hudPanel as HudPanelId] = {
      left: h.right - s.left - CHEVRON_PX,
      top: top + (h.height - CHEVRON_PX) / 2,
      // The header's own divider (its bottom padding and border) is hidden while collapsed; the panel's bottom padding and
      // border close the box under the title instead (the border is redrawn by the slot's ::after, since the clip cuts it).
      collapsedHeight: top + h.height - px(hs.paddingBottom) - px(hs.borderBottomWidth) + px(ps.paddingBottom) + px(ps.borderBottomWidth),
    };
  }
  const prev = handles.value;
  const same = (Object.keys({ ...prev, ...next }) as HudPanelId[]).every((id) => {
    const a = prev[id];
    const b = next[id];
    return !!a && !!b && a.left === b.left && a.top === b.top && a.collapsedHeight === b.collapsedHeight;
  });
  if (!same) handles.value = next;
}

function slotStyle(id: HudPanelId) {
  const box = handles.value[id];
  return isCollapsed(id) && box ? { height: `${box.collapsedHeight}px`, overflow: 'hidden' } : undefined;
}
const buttonStyle = (id: HudPanelId) => {
  const box = handles.value[id];
  return box ? { left: `${box.left}px`, top: `${box.top}px` } : { visibility: 'hidden' as const };
};

const slotOf = (id: HudPanelId) => root.value?.querySelector<HTMLElement>(`[data-hud-panel="${id}"]`) ?? null;

async function toggleCollapse(id: HudPanelId) {
  const slot = slotOf(id);
  const from = slot?.offsetHeight ?? 0;
  prefs.toggleCollapsed(id);
  await nextTick();
  const now = slotOf(id);
  if (!now) return;
  // The clipped panel never keeps a scrolled-away header.
  if (isCollapsed(id) && now.firstElementChild) now.firstElementChild.scrollTop = 0;
  const to = now.offsetHeight;
  if (motionEnabled() && from !== to) {
    void animate(now, [{ height: `${from}px`, overflow: 'hidden' }, { height: `${to}px`, overflow: 'hidden' }], { duration: COLLAPSE_MS, easing: 'ease-out' });
  }
}

// ---- the icon rail's x, from the left columns ----

function insetBottom(): number {
  return root.value ? parseFloat(getComputedStyle(root.value).getPropertyValue('--hud-inset-bottom')) || 0 : 0;
}

function measureRail() {
  const dock = root.value;
  if (!dock) return;
  const d = dock.getBoundingClientRect();
  const rendered = [...dock.querySelectorAll<HTMLElement>('.hud-dock__side--left .hud-dock__column')]
    .filter((col) => !col.classList.contains('is-empty'))
    .map((col) => {
      const c = col.getBoundingClientRect();
      let contentBottom = 0;
      for (const slot of col.querySelectorAll<HTMLElement>('[data-hud-panel]')) {
        if (!slot.classList.contains('is-dragging')) contentBottom = Math.max(contentBottom, slot.getBoundingClientRect().bottom - d.top);
      }
      return { left: c.left - d.left, right: c.right - d.left, contentBottom };
    });
  const top = d.height - (DOCK_GUTTER + insetBottom()) - railHeight.value;
  railLeft.value = computeRailLeft(rendered, { width: COLUMN_BUTTON_SIZE, top });
}

let observer: ResizeObserver | null = null;
function observeLayout() {
  const dock = root.value;
  if (!observer || !dock) return;
  observer.disconnect();
  observer.observe(dock);
  for (const el of dock.querySelectorAll('.hud-dock__side--left, .hud-dock__column, [data-hud-panel]')) observer.observe(el);
}
function remeasure() {
  measureHandles();
  measureRail();
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') observer = new ResizeObserver(remeasure);
  remeasure();
  observeLayout();
});
// Whatever moves, collapses, opens or closes a panel changes the layout: measure again once the DOM has caught up.
watch(
  [() => prefs.panels, columns, railHeight, () => HUD_PANEL_IDS.map((id) => panelHeld[id].value)],
  () => {
    remeasure();
    observeLayout();
  },
  { deep: true, flush: 'post' },
);
onUnmounted(() => {
  observer?.disconnect();
  railLeft.value = DOCK_GUTTER;
});

const indicatorStyle = computed(() => {
  const i = indicator.value;
  return i ? { left: `${i.left}px`, top: `${i.top}px`, width: `${i.width}px`, height: `${i.height}px` } : undefined;
});
</script>

<template>
  <div ref="root" class="hud-dock" data-testid="hud-dock" @pointerdown="onPointerDown">
    <div v-for="side in SIDES" :key="side" class="hud-dock__side" :class="`hud-dock__side--${side}`" :data-testid="`hud-dock-${side}`">
      <div
        v-for="c in columns[side]"
        :key="`${side}-${c.column}`"
        class="hud-dock__column"
        :class="{ 'is-empty': isEmpty(c) }"
        :style="columnStyle(side, c)"
        :data-side="side"
        :data-column="c.column"
        :data-testid="`hud-dock-${side}-${c.column}`"
      >
        <template v-for="align in ALIGNS" :key="align">
          <div v-if="align === 'bottom'" class="hud-dock__spacer" />
          <TransitionGroup tag="div" :css="false" class="hud-dock__group" :class="`hud-dock__group--${align}`" @enter="onEnter" @leave="onLeave">
            <div
              v-for="id in c[align]"
              :key="id"
              class="hud-dock__slot"
              :class="{ 'is-dragging': dragging === id, 'is-collapsed': isCollapsed(id) }"
              :style="slotStyle(id)"
              :data-hud-panel="id"
              :data-side="side"
              :data-column="c.column"
              :data-align="align"
            >
              <component :is="panelComponents[id]" v-bind="listeners[id]" />
              <HudPanelCollapseButton
                class="hud-dock__collapse"
                data-collapse-button
                :panel="id"
                :collapsed="isCollapsed(id)"
                :disabled="panelHeld[id].value"
                :style="buttonStyle(id)"
                @toggle="toggleCollapse(id)"
              />
            </div>
          </TransitionGroup>
        </template>
      </div>
    </div>
    <div v-if="indicator" class="hud-dock__indicator" data-testid="hud-dock-indicator" :style="indicatorStyle" />
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
/* Each side is a full-height strip (under the header bar, above the bottom gutter) holding its columns outer to inner. */
.hud-dock__side {
  position: absolute;
  top: 76px;
  bottom: calc(16px + var(--hud-inset-bottom, 0px));
  display: flex;
  align-items: stretch;
  pointer-events: none;
}
.hud-dock__side--left {
  left: 16px;
  flex-direction: row;
}
.hud-dock__side--right {
  right: 16px;
  flex-direction: row-reverse;
}
/* A column fills the side's height; its margin (set inline) is the gap toward the centre, absent for an empty column. */
.hud-dock__column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  pointer-events: none;
}
.hud-dock__side--left .hud-dock__column {
  align-items: flex-start;
}
.hud-dock__side--right .hud-dock__column {
  align-items: flex-end;
}
.hud-dock__column.is-empty {
  width: 0;
  margin: 0;
}
/* The top group stacks down from the column's top, the bottom group up from its bottom; they share the height and shrink
   (their panels scroll) only when both do not fit. */
.hud-dock__group {
  display: flex;
  gap: 8px;
  flex: 0 1 auto;
  min-height: 0;
  pointer-events: none;
}
.hud-dock__group--top {
  flex-direction: column;
}
.hud-dock__group--bottom {
  flex-direction: column-reverse;
}
.hud-dock__side--left .hud-dock__group {
  align-items: flex-start;
}
.hud-dock__side--right .hud-dock__group {
  align-items: flex-end;
}
.hud-dock__spacer {
  flex: 1 1 8px;
  min-height: 8px;
}
.hud-dock__slot {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;
  min-height: 0;
  pointer-events: none;
}
/* The panels position themselves absolutely in the world view and on phones; docked, the column places them, and they
   shrink with their own scrolling when a column gets tall. The collapse chevron is the dock's own and keeps its place. */
.hud-dock .hud-dock__slot > :deep(*:not([data-collapse-button])) {
  position: static;
  inset: auto;
  z-index: auto;
  flex: 0 1 auto;
  min-height: 0;
  max-height: none;
  overflow-y: auto;
  pointer-events: auto;
}
/* Collapsed: the slot is clipped to the header, so the panel must not scroll its body into view. */
.hud-dock .hud-dock__slot.is-collapsed > :deep(*:not([data-collapse-button])) {
  overflow: hidden;
}
/* The header's divider has nothing under it while collapsed; the clip cut the panel's bottom border, so the slot draws it. */
.hud-dock .hud-dock__slot.is-collapsed :deep([data-dock-handle]) {
  border-bottom-color: transparent;
}
.hud-dock__slot.is-collapsed::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  border-bottom: 1px solid var(--panel-border);
  pointer-events: none;
}
.hud-dock__collapse {
  position: absolute;
  z-index: 1;
  pointer-events: auto;
}
.hud-dock :deep([data-dock-handle]) {
  cursor: grab;
  user-select: none;
  touch-action: none;
  /* Room for the collapse chevron at the header's right edge. */
  padding-right: 32px;
}
.hud-dock__slot.is-dragging,
.hud-dock__slot.is-dragging :deep([data-dock-handle]) {
  cursor: grabbing;
}
.hud-dock__slot.is-dragging {
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.45));
}
/* Where a dragged panel would land: a bar across the column, or down the side for a new column. */
.hud-dock__indicator {
  position: absolute;
  background: var(--gold, #ffc55c);
  border-radius: 2px;
  pointer-events: none;
}
</style>
