<script setup lang="ts">
// Mobile counterpart to BuildQueuePanel.vue + TrainingQueuePanel.vue: on a
// narrow viewport there isn't room for two 240px status cards, so both
// queues (plus the garrison/guests) live in one slide-out drawer instead.
//
// The collapsed rail deliberately does NOT show a slot count the way the
// desktop panels do — with more than a handful of slots (premium accounts
// can queue well past 3), a static "N / M" count stops being useful at a
// glance. Instead it shows only the single soonest-to-finish item per
// category, plus a "+N more" chip for the rest — see soonestBuild/
// soonestTraining below.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { unitName } from '../../i18n/catalogueNames';
import { useWorldStore } from '../../stores/world';
import {
  MAX_TRAINING_QUEUE_LENGTH,
  useBuildOrders,
  useTrainingOrders,
  type BuildOrderRow,
  type TrainingOrderRow,
} from '../../composables/useQueueOrders';

const world = useWorldStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ select: [coord: { q: number; r: number }] }>();

const buildOrders = useBuildOrders();
const trainingOrders = useTrainingOrders();

const cancelling = ref<string | null>(null);
const error = ref('');

async function cancel(orderId: string) {
  error.value = '';
  cancelling.value = orderId;
  try {
    await world.cancelBuildLive(orderId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('hud.buildQueue.cancelError');
  } finally {
    cancelling.value = null;
  }
}

function soonest<T extends { remainingSeconds: number | null }>(pool: T[]): T | null {
  if (!pool.length) return null;
  return pool.reduce((best, r) => ((r.remainingSeconds ?? Infinity) < (best.remainingSeconds ?? Infinity) ? r : best));
}

const soonestBuild = computed<BuildOrderRow | null>(() => {
  const active = buildOrders.value.filter((o) => !o.waiting);
  return soonest(active.length ? active : buildOrders.value);
});

const soonestTraining = computed<TrainingOrderRow | null>(() => soonest(trainingOrders.value));

const garrison = computed(() =>
  world.hud.garrison
    .filter((g) => g.count > 0)
    .map((g) => ({ key: g.unit, label: unitName(g.unit), count: g.count })),
);

// Issue #40 phase 4 — mirrors TrainingQueuePanel.vue's own guests computed;
// see its comment for why guests are folded in here rather than getting a
// separate HUD element.
const guests = computed(() =>
  world.guestArmies.map((g) => ({
    key: g.armyId,
    ownerName: world.model.getSettlement(g.ownerSettlementId)?.name ?? t('hud.trainingQueue.unknownSettlement'),
    composition: g.stacks
      .filter((s) => s.count > 0)
      .map((s) => t('hud.trainingQueue.orderName', { count: s.count, unit: unitName(s.unit) }))
      .join(', ') || '—',
  })),
);

const reservedTotal = computed(() => {
  const r = world.hud.reserved;
  return r.wood + r.stone + r.food + r.iron;
});

const hasAnything = computed(
  () => buildOrders.value.length > 0 || trainingOrders.value.length > 0 || garrison.value.length > 0 || guests.value.length > 0,
);

// The whole drawer (v-if="hasAnything" on the template root) unmounts the
// instant the last queue/garrison/guest entry disappears — if that happens
// while `open` is still true, the parent's v-model stays stuck at true with
// no drawer left to close it, and MapView's canvasInteractionLocked watch
// (keyed off this same `open`) never flips back, permanently locking map
// interaction. Force-close before that can happen, and on unmount as a
// backstop for any other path that drops the drawer while open.
watch(hasAnything, (has) => {
  if (!has) open.value = false;
});

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

// Drag-to-open/close (issue: mobile queue sidebar). Matches the CSS's own
// dimensions — see the `.queue-drawer`/`.queue-drawer-rail` rules below —
// so the drag transform lines up with the resting transform exactly.
const RAIL_W = 96;
// A plain computed() here would cache window.innerWidth from whenever it
// was first read and never update — a rotation/resize would then desync
// the drag clamp/threshold math from the CSS transform, which recomputes
// `min(86vw, 340px)` live. Track the live width instead.
const viewportWidth = ref(window.innerWidth);
function onWindowResize() {
  viewportWidth.value = window.innerWidth;
}
const OPEN_W = computed(() => Math.min(viewportWidth.value * 0.86, 340));
const TRAVEL = computed(() => OPEN_W.value - RAIL_W);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// null when not dragging (the CSS class-driven transform + transition
// takes over); a clamped in-progress offset while a pointer is down.
const dragPx = ref<number | null>(null);

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startT: number;
  openAtStart: boolean;
  decided: 'horizontal' | 'vertical' | null;
}

let dragState: DragState | null = null;

const rootStyle = computed(() => {
  if (dragPx.value === null) return {};
  const base = open.value ? 0 : -TRAVEL.value;
  return { transform: `translateX(${base + dragPx.value}px)` };
});

function onRailPointerDown(event: PointerEvent) {
  const rail = event.currentTarget as HTMLElement;
  rail.setPointerCapture(event.pointerId);
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startT: performance.now(),
    openAtStart: open.value,
    decided: null,
  };
  dragPx.value = 0;
}

function onRailPointerMove(event: PointerEvent) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;

  if (dragState.decided === null) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    // A drag that starts more vertical than horizontal is a scroll, not a
    // drawer drag — bail out entirely rather than fighting the gesture.
    dragState.decided = Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
    if (dragState.decided === 'vertical') {
      dragPx.value = null;
      return;
    }
  }
  if (dragState.decided !== 'horizontal') return;

  dragPx.value = dragState.openAtStart ? clamp(dx, -TRAVEL.value, 0) : clamp(dx, 0, TRAVEL.value);
}

function settleDrag(event: PointerEvent) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const rail = event.currentTarget as HTMLElement;
  if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);

  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  const dt = performance.now() - dragState.startT;
  const { openAtStart, decided } = dragState;
  dragState = null;
  dragPx.value = null;

  if (decided === 'vertical') return;

  const isTap = Math.abs(dx) < 8 && Math.abs(dy) < 8 && dt < 500;
  if (isTap) {
    open.value = !open.value;
    return;
  }

  const travel = TRAVEL.value;
  const velocity = dt > 0 ? dx / dt : 0;
  if (!openAtStart) {
    const traveledFraction = clamp(dx, 0, travel) / travel;
    open.value = traveledFraction > 0.4 || velocity > 0.5;
  } else {
    const traveledFraction = clamp(-dx, 0, travel) / travel;
    open.value = !(traveledFraction > 0.4 || -velocity > 0.5);
  }
}

function onRailPointerCancel(event: PointerEvent) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState = null;
  dragPx.value = null;
}

// The pointerup tap path above already toggles `open` — this only handles
// the keyboard-activated click (Enter/Space on the focused rail button),
// which fires with `detail === 0`. A touch/mouse-generated click always has
// detail >= 1, so it's a no-op duplicate of the pointer path, not a second
// toggle.
function onRailClick(event: MouseEvent) {
  if (event.detail === 0) toggle();
}

function selectBuildOrder(coord: { q: number; r: number }) {
  close();
  emit('select', coord);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    close();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', onWindowResize);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', onWindowResize);
  // Backstop for hasAnything's own watch above: whatever unmounts this
  // drawer while open (e.g. useIsMobile crossing back over the breakpoint
  // mid-gesture) must not leave the parent's v-model — and therefore the
  // canvas interaction lock keyed off it — stuck at true.
  open.value = false;
});
</script>

<template>
  <div v-if="hasAnything">
    <div v-if="open" class="queue-drawer-backdrop" @pointerdown.self="close" />
    <div class="queue-drawer" :class="{ 'is-open': open, 'is-dragging': dragPx !== null }" :style="rootStyle">
      <div id="queue-drawer-body" class="queue-drawer-panel" :aria-hidden="!open" :inert="!open">
        <div class="queue-drawer-header">
          <span class="status-card-title">{{ t('hud.queueDrawer.title') }}</span>
          <button type="button" class="queue-drawer-close" @click="close">{{ t('hud.queueDrawer.close') }}</button>
        </div>

        <div class="queue-drawer-scroll">
          <template v-if="buildOrders.length">
            <div class="status-card-header">
              <span class="status-card-title">{{ t('hud.buildQueue.title') }}</span>
              <span class="status-card-count">{{ t('hud.buildQueue.slots', { used: world.hud.construction.slotsUsed, total: world.hud.construction.slots }) }}</span>
            </div>
            <div v-for="o in buildOrders" :key="o.key" class="status-row" :class="{ 'is-waiting': o.waiting }">
              <button type="button" class="status-row-click" @click="selectBuildOrder(o.coord)">
                <div class="status-row-top">
                  <span class="status-row-name">{{ o.name }}</span>
                  <span class="status-row-time">{{ o.remaining }}</span>
                </div>
                <div v-if="!o.waiting" class="status-progress">
                  <div class="status-progress-fill" :class="{ 'is-done': o.done }" :style="{ width: `${Math.round(o.progress * 100)}%` }" />
                </div>
                <div class="status-subtext">{{ o.subtext }}</div>
              </button>
              <button type="button" class="cancel-button" :disabled="cancelling === o.key" @click.stop="cancel(o.key)">
                {{ t('hud.buildQueue.cancel') }}
              </button>
            </div>
            <div v-if="reservedTotal > 0" class="status-subtext reserved-footer">
              {{ t('hud.buildQueue.reservedFooter', {
                wood: Math.round(world.hud.reserved.wood),
                stone: Math.round(world.hud.reserved.stone),
                food: Math.round(world.hud.reserved.food),
                iron: Math.round(world.hud.reserved.iron),
              }) }}
            </div>
          </template>
          <div v-if="error" class="status-subtext error">{{ error }}</div>

          <template v-if="trainingOrders.length">
            <div class="status-card-header" :class="{ 'has-section-above': buildOrders.length }">
              <span class="status-card-title">{{ t('hud.trainingQueue.title') }}</span>
              <span class="status-card-count">{{ t('hud.trainingQueue.slots', { used: trainingOrders.length, total: MAX_TRAINING_QUEUE_LENGTH }) }}</span>
            </div>
            <div v-for="o in trainingOrders" :key="o.key" class="status-row">
              <div class="status-row-top">
                <span class="status-row-name">{{ o.name }}</span>
                <span class="status-row-time">{{ o.remaining }}</span>
              </div>
              <div class="status-progress">
                <div class="status-progress-fill" :class="{ 'is-done': o.done }" :style="{ width: `${Math.round(o.progress * 100)}%` }" />
              </div>
              <div class="status-subtext">{{ o.subtext }}</div>
            </div>
          </template>

          <div class="status-card-header" :class="{ 'has-section-above': buildOrders.length || trainingOrders.length }">
            <span class="status-card-title">{{ t('hud.trainingQueue.garrison') }}</span>
          </div>
          <div v-if="garrison.length" class="garrison-grid">
            <div v-for="g in garrison" :key="g.key" class="garrison-row">
              <span class="garrison-name">{{ g.label }}</span>
              <span class="garrison-count">{{ g.count }}</span>
            </div>
          </div>
          <div v-else class="status-subtext">{{ t('hud.trainingQueue.garrisonEmpty') }}</div>

          <template v-if="guests.length">
            <div class="status-card-header has-section-above">
              <span class="status-card-title">{{ t('hud.trainingQueue.guests') }}</span>
              <span class="status-card-count">{{ guests.length }}</span>
            </div>
            <div class="guests-grid">
              <div v-for="g in guests" :key="g.key" class="guest-row">
                <span class="guest-owner">{{ g.ownerName }}</span>
                <span class="guest-composition">{{ g.composition }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <button
        type="button"
        class="queue-drawer-rail"
        :aria-expanded="open"
        aria-controls="queue-drawer-body"
        :aria-label="open ? t('hud.queueDrawer.closeLabel') : t('hud.queueDrawer.openLabel')"
        @pointerdown="onRailPointerDown"
        @pointermove="onRailPointerMove"
        @pointerup="settleDrag"
        @pointercancel="onRailPointerCancel"
        @click="onRailClick"
      >
        <!-- The full list is already showing in .queue-drawer-panel right next
             to this once open — rendering the rail's own mini summary too
             would visually duplicate it (looked like the drawer was "open
             twice"). Collapse to a bare drag/tap grip while open instead. -->
        <div v-if="!open" class="queue-drawer-rail-content">
          <div v-if="soonestBuild" class="rail-row">
            <div class="rail-row-top">
              <span class="rail-row-label">{{ t('hud.queueDrawer.buildLabel') }}</span>
              <span v-if="buildOrders.length > 1" class="rail-row-more">{{ t('hud.queueDrawer.more', { count: buildOrders.length - 1 }) }}</span>
            </div>
            <div class="rail-row-name">{{ soonestBuild.name }}</div>
            <div class="rail-row-bottom">
              <span class="rail-row-time">{{ soonestBuild.remaining }}</span>
            </div>
            <div v-if="!soonestBuild.waiting" class="status-progress">
              <div class="status-progress-fill" :class="{ 'is-done': soonestBuild.done }" :style="{ width: `${Math.round(soonestBuild.progress * 100)}%` }" />
            </div>
          </div>
          <div v-if="soonestTraining" class="rail-row">
            <div class="rail-row-top">
              <span class="rail-row-label">{{ t('hud.queueDrawer.trainLabel') }}</span>
              <span v-if="trainingOrders.length > 1" class="rail-row-more">{{ t('hud.queueDrawer.more', { count: trainingOrders.length - 1 }) }}</span>
            </div>
            <div class="rail-row-name">{{ soonestTraining.name }}</div>
            <div class="rail-row-bottom">
              <span class="rail-row-time">{{ soonestTraining.remaining }}</span>
            </div>
            <div class="status-progress">
              <div class="status-progress-fill" :class="{ 'is-done': soonestTraining.done }" :style="{ width: `${Math.round(soonestTraining.progress * 100)}%` }" />
            </div>
          </div>
        </div>
        <span class="queue-drawer-chevron" :class="{ 'is-open': open }" aria-hidden="true">{{ t('hud.queueDrawer.chevron') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/*
 * Reuses the `.status-*` conventions from BuildQueuePanel.vue/
 * TrainingQueuePanel.vue (mirrored, not shared — Vue scoped styles don't
 * leak across components) so the expanded drawer body reads the same as
 * the desktop panels it replaces.
 */
.status-card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--panel-border);
}
.status-card-header.has-section-above {
  margin-top: 12px;
}
.status-card-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text);
}
.status-card-count {
  font-size: 12px;
  color: var(--muted);
}
.status-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 0;
}
.status-row + .status-row {
  margin-top: 2px;
}
.status-row-click {
  flex: 1;
  min-width: 0;
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  padding: 0;
  cursor: pointer;
}
.status-row-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.status-row-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.status-row-time {
  font-size: 13px;
  font-weight: 600;
  color: var(--gold);
  white-space: nowrap;
}
.status-progress {
  margin-top: 5px;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
}
.status-progress-fill {
  height: 100%;
  background: var(--gold);
}
.status-progress-fill.is-done {
  background: #5ab0e6;
}
.status-subtext {
  margin-top: 4px;
  font-size: 11px;
  color: var(--muted);
}
.status-subtext.error {
  color: #e05a5a;
  margin-top: 8px;
}
.status-row.is-waiting {
  opacity: 0.55;
}
.status-row.is-waiting .status-row-time {
  color: var(--muted);
}
.reserved-footer {
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px solid var(--panel-border);
}
.cancel-button {
  flex: none;
  background: transparent;
  border: none;
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  padding: 2px 4px;
}
.cancel-button:hover {
  color: var(--text);
}
.cancel-button:disabled {
  opacity: 0.5;
  cursor: default;
}
.garrison-grid,
.guests-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.garrison-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}
.garrison-name {
  color: var(--text);
}
.garrison-count {
  color: var(--gold);
  font-weight: 600;
}
.guest-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 12px;
}
.guest-owner {
  color: var(--text);
  font-weight: 600;
}
.guest-composition {
  color: var(--muted);
  font-size: 11px;
}

/* Drawer chrome
 *
 * z-index 11/12 (same tier as the other HUD status cards, e.g.
 * BuildQueuePanel.vue's own z-index: 10) was wrong for the *open* drawer:
 * the onboarding overlays it can be opened alongside on the landing page —
 * OnboardingBanner.vue/OnboardingChecklist.vue (15), ResourceTicker.vue
 * (16), GuidancePointer.vue (36) — all sat above it and showed through,
 * despite the drawer having its own full-screen backdrop meant to recede
 * everything else. 37/38 puts the backdrop+drawer just above
 * GuidancePointer (the highest of that group) while staying below the true
 * modals/chrome that must never be obscured (RingMenu's own backdrop 30,
 * BuildingModal/TrainingModal/TopBar 40, ReturningPlayerMenu/ProfileNudge
 * 50) — those aren't expected to be reachable while this backdrop is up
 * anyway (canvasInteractionLocked keeps a hex tap from opening the ring
 * underneath it), but there's no reason to outrank them regardless.
 */
.queue-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 37;
  background: rgba(0, 0, 0, 0.35);
}
.queue-drawer {
  position: fixed;
  left: 0;
  top: 76px;
  bottom: 0;
  z-index: 38;
  display: flex;
  width: min(86vw, 340px);
  transform: translateX(calc(-1 * (min(86vw, 340px) - 96px)));
  transition: transform 180ms ease;
}
.queue-drawer.is-open {
  transform: translateX(0);
}
/* Mid-drag, the transform is driven imperatively by rootStyle every
   pointermove — the transition would otherwise fight/lag each frame. */
.queue-drawer.is-dragging {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .queue-drawer {
    transition: none;
  }
}
.queue-drawer-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-left: none;
  overflow: hidden;
}
.queue-drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  border-bottom: 1px solid var(--panel-border);
  flex: none;
}
.queue-drawer-close {
  background: transparent;
  border: none;
  color: var(--muted);
  font: inherit;
  font-size: 15px;
  cursor: pointer;
  padding: 2px 6px;
}
.queue-drawer-close:hover {
  color: var(--text);
}
.queue-drawer-scroll {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 15px 16px;
}
.queue-drawer-rail {
  flex: none;
  width: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 8px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: grab;
  touch-action: none;
  /* Not while dragging (dragPx !== null skips the CSS transform entirely —
     see rootStyle) or the width snap would fight the drag's own transform
     each frame the same way the transition does (see .is-dragging above). */
  transition: width 180ms ease;
}
.queue-drawer-rail:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: -2px;
}
/* The full expanded list already shows everything the rail's own mini
   summary would — see the template comment above .queue-drawer-rail-content
   — so once open this is just a slim grip for dragging/tapping shut. */
.queue-drawer.is-open .queue-drawer-rail {
  width: 28px;
  padding: 10px 2px;
  justify-content: center;
}
.queue-drawer.is-dragging .queue-drawer-rail {
  transition: none;
}
.queue-drawer-rail-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rail-row-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 4px;
}
.rail-row-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
.rail-row-more {
  font-size: 10px;
  color: var(--muted);
}
.rail-row-name {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rail-row-bottom {
  margin-top: 2px;
}
.rail-row-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--gold);
}
.queue-drawer-chevron {
  flex: none;
  font-size: 18px;
  color: var(--muted);
  transition: transform 180ms ease;
}
.queue-drawer-chevron.is-open {
  transform: rotate(180deg);
}
</style>
