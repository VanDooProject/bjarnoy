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

// A closed drawer used to show nothing but a bare arrow — this gives the
// edge tab a preview even before it's opened: a badge with how many orders
// are actually in flight, so there's something to glance at (and a reason
// to open it) without dragging/tapping first.
const activeOrderCount = computed(() => constructionOrders.value.length + trainingOrders.value.length);
</script>

<template>
  <button
    type="button"
    class="queues-tab"
    :class="{ 'queues-tab--open': expanded }"
    :aria-expanded="expanded"
    :aria-label="expanded ? t('hud.queuesSidebar.close') : t('hud.queuesSidebar.open')"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <span class="queues-tab-chevron" aria-hidden="true">{{ t('hud.queuesSidebar.chevron') }}</span>
    <span v-if="!expanded && activeOrderCount > 0" class="queues-tab-badge" aria-hidden="true">{{ activeOrderCount }}</span>
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
/* The tab peeking off the left edge — always present so there's something
   to both tap and drag from a fully closed state, not just a target that
   only appears once the drawer is already open. */
/* Plain var(--panel-bg) reads as near-invisible against the map's own dark
   fog/water tones at this size — a gold left edge plus a lifting shadow
   gives it enough contrast to actually be noticed at a glance, not just
   found by someone who already knows it's there. */
.queues-tab {
  position: fixed;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  z-index: 45;
  width: 32px;
  height: 64px;
  border: 1px solid var(--panel-border);
  border-left: 3px solid var(--gold);
  border-radius: 0 8px 8px 0;
  background: var(--panel-bg);
  box-shadow: 4px 0 12px rgba(0, 0, 0, 0.4);
  color: var(--gold);
  font-size: 16px;
  cursor: grab;
  touch-action: none;
}
.queues-tab--open {
  color: var(--text);
}
/* The arrow points into the screen (away from the edge it's hinged on) to
   invite the open gesture; once open it flips to point back at the edge,
   matching the direction that actually closes it. */
.queues-tab-chevron {
  display: inline-block;
  transform: scaleX(-1);
}
.queues-tab--open .queues-tab-chevron {
  transform: none;
}
.queues-tab-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--gold);
  color: #20160a;
  font-size: 10px;
  font-weight: 800;
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
