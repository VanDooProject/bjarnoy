<script setup lang="ts">
// The full "Queues" detail drawer — Construction/Training/Garrison, in one
// place, sliding in from the left edge on a drag or a tap of its own edge
// tab (see useDragSheet.ts). BuildQueuePanel.vue/TrainingQueuePanel.vue
// already show this same data as floating corner cards; this doesn't
// replace them (they stay useful as an always-visible glance), it's the
// "see everything, larger" view the mobile mockup's slide-out panel asked
// for. Progress math is intentionally mirrored from those two panels
// (poll-invariant progress + a monotonic clamp — see issue #99) rather than
// shared, matching this codebase's existing convention of duplicating this
// small amount of per-display-context logic instead of factoring it out.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { buildingName, unitName } from '../../i18n/catalogueNames';
import { useWorldStore } from '../../stores/world';
import { useDragSheet } from '../../composables/useDragSheet';

const world = useWorldStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const MAX_TRAINING_QUEUE_LENGTH = 5;

const { expanded, dragging, onPointerDown, onPointerMove, onPointerUp } = useDragSheet(false, {
  axis: 'x', // hinged on the left edge: dragging right (the natural, un-inverted direction) opens it
});

function close() {
  expanded.value = false;
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (num: number) => num.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Issue #99: progress must be poll-invariant — the backend's own totalSeconds
// rather than remaining-time-relative-to-last-poll — with a monotonic clamp
// as a defensive fallback, same as BuildQueuePanel.vue/TrainingQueuePanel.vue.
const lastConstructionProgress = new Map<string, number>();
const lastTrainingProgress = new Map<string, number>();

const constructionOrders = computed(() => {
  void world.hud.tick;
  const elapsed = (Date.now() - world.hud.queueFetchedAt) / 1000;
  const liveIds = new Set(world.hud.queue.map((q) => q.id));
  for (const id of lastConstructionProgress.keys()) {
    if (!liveIds.has(id)) lastConstructionProgress.delete(id);
  }
  return world.hud.queue.map((q) => {
    const waiting = q.state === 'waiting';
    const remainingAtFetch = waiting ? null : q.completesInSeconds;
    const remainingNow = remainingAtFetch === null ? null : Math.max(0, remainingAtFetch - elapsed);
    let progress =
      waiting || remainingAtFetch === null || q.totalSeconds <= 0
        ? 1
        : 1 - Math.max(0, Math.min(1, (remainingNow ?? 0) / q.totalSeconds));
    progress = Math.max(progress, lastConstructionProgress.get(q.id) ?? 0);
    lastConstructionProgress.set(q.id, progress);
    return {
      key: q.id,
      name: t('hud.buildQueue.orderName', { name: buildingName(q.building), level: q.targetLevel }),
      remaining: waiting ? t('hud.buildQueue.waitingForSlot') : remainingNow === null ? '—' : fmt(remainingNow),
      progress,
      waiting,
      subtext: t('hud.buildQueue.hexSubtext', { q: q.q, r: q.r }),
    };
  });
});

const trainingOrders = computed(() => {
  void world.hud.tick;
  const elapsed = (Date.now() - world.hud.trainingQueueFetchedAt) / 1000;
  const liveIds = new Set(world.hud.trainingQueue.map((o) => o.id));
  for (const id of lastTrainingProgress.keys()) {
    if (!liveIds.has(id)) lastTrainingProgress.delete(id);
  }
  return world.hud.trainingQueue.map((o) => {
    const remainingNow = o.completesInSeconds === null ? null : Math.max(0, o.completesInSeconds - elapsed);
    let progress =
      o.completesInSeconds === null || o.totalSeconds <= 0
        ? 1
        : 1 - Math.max(0, Math.min(1, (remainingNow ?? 0) / o.totalSeconds));
    progress = Math.max(progress, lastTrainingProgress.get(o.id) ?? 0);
    lastTrainingProgress.set(o.id, progress);
    return {
      key: o.id,
      name: t('hud.trainingQueue.orderName', { count: o.count, unit: unitName(o.unit) }),
      remaining: remainingNow === null ? '—' : fmt(remainingNow),
      progress,
      subtext: t('hud.trainingQueue.trainedCount', { completed: o.completedCount, total: o.count }),
    };
  });
});

const garrison = computed(() =>
  world.hud.garrison.filter((g) => g.count > 0).map((g) => ({ key: g.unit, label: unitName(g.unit), count: g.count })),
);

// A closed drawer used to show nothing but a bare arrow+badge — the mockup's
// closed state is a real always-visible mini-panel with actual queue content
// (the first couple of orders, a countdown and progress for each, and a
// dimmed placeholder for any free slot), not just a hint that something is
// queued. Capped to a couple of rows per section so the peek panel stays
// short enough to sit docked mid-screen without dominating the map.
const PEEK_ROWS = 2;
const peekConstruction = computed(() => constructionOrders.value.slice(0, PEEK_ROWS));
const peekFreeSlots = computed(() => Math.max(0, Math.min(PEEK_ROWS - peekConstruction.value.length, world.hud.construction.slots - world.hud.construction.slotsUsed)));
const peekTraining = computed(() => trainingOrders.value.slice(0, 1));
</script>

<template>
  <button
    type="button"
    class="queues-peek"
    :class="{ 'queues-peek--open': expanded }"
    :aria-expanded="expanded"
    :aria-label="expanded ? t('hud.queuesSidebar.close') : t('hud.queuesSidebar.open')"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <div class="queues-peek-section">
      <div class="queues-peek-header">
        <span class="queues-peek-label">{{ t('hud.buildQueue.title') }}</span>
        <span class="queues-peek-count">{{ world.hud.construction.slotsUsed }}/{{ world.hud.construction.slots }}</span>
      </div>
      <div v-for="o in peekConstruction" :key="o.key" class="queues-peek-row" :class="{ 'is-waiting': o.waiting }">
        <span class="queues-peek-icon" aria-hidden="true" />
        <span class="queues-peek-time">{{ o.remaining }}</span>
        <span class="queues-peek-fill-track"><span class="queues-peek-fill" :style="{ height: `${Math.round(o.progress * 100)}%` }" /></span>
      </div>
      <div v-for="n in peekFreeSlots" :key="`free-${n}`" class="queues-peek-row is-free">
        <span class="queues-peek-icon" aria-hidden="true" />
        <span class="queues-peek-time">{{ t('hud.queuesSidebar.freeSlot') }}</span>
      </div>
    </div>
    <div class="queues-peek-section">
      <div class="queues-peek-header">
        <span class="queues-peek-label">{{ t('hud.trainingQueue.title') }}</span>
        <span class="queues-peek-count">{{ trainingOrders.length }}/{{ MAX_TRAINING_QUEUE_LENGTH }}</span>
      </div>
      <div v-for="o in peekTraining" :key="o.key" class="queues-peek-row">
        <span class="queues-peek-icon" aria-hidden="true" />
        <span class="queues-peek-time">{{ o.remaining }}</span>
        <span class="queues-peek-fill-track"><span class="queues-peek-fill" :style="{ height: `${Math.round(o.progress * 100)}%` }" /></span>
      </div>
    </div>
    <span class="queues-peek-arrow" aria-hidden="true">{{ t('hud.queuesSidebar.chevron') }}</span>
  </button>
  <aside class="queues-sidebar" :class="{ 'queues-sidebar--open': expanded, 'queues-sidebar--dragging': dragging }">
    <div class="queues-sidebar-header">
      <button type="button" class="back-button" :aria-label="t('hud.queuesSidebar.close')" @click="close">{{ t('hud.queuesSidebar.chevron') }}</button>
      <span class="queues-sidebar-title">{{ t('hud.queuesSidebar.title') }}</span>
    </div>
    <div class="queues-sidebar-body">
      <section class="queue-section">
        <div class="queue-section-header">
          <span class="queue-section-title">{{ t('hud.buildQueue.title') }}</span>
          <span class="queue-section-count">{{ t('hud.buildQueue.slots', { used: world.hud.construction.slotsUsed, total: world.hud.construction.slots }) }}</span>
        </div>
        <div v-for="o in constructionOrders" :key="o.key" class="queue-row" :class="{ 'is-waiting': o.waiting }">
          <div class="queue-row-top">
            <span class="queue-row-name">{{ o.name }}</span>
            <span class="queue-row-time">{{ o.remaining }}</span>
          </div>
          <div v-if="!o.waiting" class="queue-progress">
            <div class="queue-progress-fill" :style="{ width: `${Math.round(o.progress * 100)}%` }" />
          </div>
          <div class="queue-subtext">{{ o.subtext }}</div>
        </div>
      </section>

      <section class="queue-section">
        <div class="queue-section-header">
          <span class="queue-section-title">{{ t('hud.trainingQueue.title') }}</span>
          <span class="queue-section-count">{{ t('hud.trainingQueue.slots', { used: trainingOrders.length, total: MAX_TRAINING_QUEUE_LENGTH }) }}</span>
        </div>
        <div v-for="o in trainingOrders" :key="o.key" class="queue-row">
          <div class="queue-row-top">
            <span class="queue-row-name">{{ o.name }}</span>
            <span class="queue-row-time">{{ o.remaining }}</span>
          </div>
          <div class="queue-progress">
            <div class="queue-progress-fill" :style="{ width: `${Math.round(o.progress * 100)}%` }" />
          </div>
          <div class="queue-subtext">{{ o.subtext }}</div>
        </div>
      </section>

      <section class="queue-section">
        <div class="queue-section-header">
          <span class="queue-section-title">{{ t('hud.trainingQueue.garrison') }}</span>
        </div>
        <div v-if="garrison.length" class="garrison-grid">
          <div v-for="g in garrison" :key="g.key" class="garrison-row">
            <span class="garrison-name">{{ g.label }}</span>
            <span class="garrison-count">{{ g.count }}</span>
          </div>
        </div>
        <div v-else class="queue-subtext">{{ t('hud.trainingQueue.garrisonEmpty') }}</div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
/* The peek panel docked to the left edge — always present, and showing the
   drawer's actual content (the first couple of orders in each queue, a
   countdown + progress for each, dimmed placeholders for free slots) rather
   than a bare arrow or a count badge, so there's something worth glancing at
   without opening it first. A gold left edge plus a lifting shadow keeps it
   visible against the map's own dark fog/water tones. */
.queues-peek {
  position: fixed;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  z-index: 45;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 104px;
  padding: 10px 8px 20px;
  border: 1px solid var(--panel-border);
  border-left: 3px solid var(--gold);
  border-radius: 0 8px 8px 0;
  background: var(--panel-bg);
  box-shadow: 4px 0 12px rgba(0, 0, 0, 0.4);
  color: var(--text);
  text-align: left;
  cursor: grab;
  touch-action: none;
}
.queues-peek-section + .queues-peek-section {
  padding-top: 8px;
  border-top: 1px solid var(--panel-border);
}
.queues-peek-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}
.queues-peek-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.queues-peek-count {
  font-size: 9px;
  color: var(--muted);
}
.queues-peek-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}
.queues-peek-row.is-waiting,
.queues-peek-row.is-free {
  opacity: 0.5;
}
.queues-peek-icon {
  width: 10px;
  height: 10px;
  flex: none;
  background: var(--gold);
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
.queues-peek-row.is-free .queues-peek-icon {
  background: var(--muted);
}
.queues-peek-time {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--gold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.queues-peek-row.is-free .queues-peek-time {
  color: var(--muted);
  font-weight: 400;
  text-transform: uppercase;
  font-size: 10px;
}
.queues-peek-fill-track {
  position: relative;
  flex: none;
  width: 3px;
  height: 16px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.queues-peek-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--gold);
}
/* The arrow points into the screen (away from the edge it's hinged on) to
   invite the open gesture; once open it flips to point back at the edge,
   matching the direction that actually closes it. */
.queues-peek-arrow {
  align-self: center;
  display: inline-block;
  color: var(--muted);
  font-size: 16px;
  transform: scaleX(-1);
}
.queues-peek--open .queues-peek-arrow {
  color: var(--text);
  transform: none;
}
.queues-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 44;
  width: min(320px, 85vw);
  background: var(--panel-bg);
  border-right: 1px solid var(--panel-border);
  box-shadow: 12px 0 30px rgba(0, 0, 0, 0.35);
  transform: translateX(-100%);
  transition: transform 0.2s ease;
  display: flex;
  flex-direction: column;
}
.queues-sidebar--open {
  transform: translateX(0);
}
.queues-sidebar--dragging {
  transition: none;
}
.queues-sidebar-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--panel-border);
  flex: none;
}
.back-button {
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 18px;
  cursor: pointer;
  padding: 2px 4px;
}
.back-button:hover {
  color: var(--text);
}
.queues-sidebar-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text);
}
.queues-sidebar-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 14px 16px;
}
.queue-section + .queue-section {
  margin-top: 20px;
}
.queue-section-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--panel-border);
}
.queue-section-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text);
}
.queue-section-count {
  font-size: 12px;
  color: var(--muted);
}
.queue-row {
  padding: 8px 0;
}
.queue-row + .queue-row {
  margin-top: 2px;
}
.queue-row.is-waiting {
  opacity: 0.55;
}
.queue-row-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.queue-row-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.queue-row-time {
  font-size: 13px;
  font-weight: 600;
  color: var(--gold);
  white-space: nowrap;
}
.queue-progress {
  margin-top: 5px;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
}
.queue-progress-fill {
  height: 100%;
  background: var(--gold);
}
.queue-subtext {
  margin-top: 4px;
  font-size: 11px;
  color: var(--muted);
}
.garrison-grid {
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
</style>
