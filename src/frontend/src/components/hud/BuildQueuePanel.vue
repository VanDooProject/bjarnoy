<script setup lang="ts">
// zip 9 / README "real-time elements": build queue countdowns, drawn from
// the backend's real per-order timers (Bjarnoy.Domain.Buildings.BuildOrder)
// rather than simulated — see stores/world.ts's `hud.queue`. Demo mode has
// no backend queue (buildings there place instantly), so this panel simply
// doesn't render then.
//
// Issue #16 "status box, left side": restyled to the "CONSTRUCTION" card
// the user described (a header row with a used/total slot count, sharp
// corners, per-row title + right-aligned countdown, a thin progress bar
// that reads orange while in progress and blue once essentially done, and
// a dim subtext line with the hex + a short note) — see the `.status-card`
// rules below, written generically enough that a raid or settler-voyage
// card (this issue's other two status-box examples; their *content* is
// illustrative, not built here) could reuse the same classes with a
// different accent color, without wiring their data yet.
import { computed } from 'vue';
import { useWorldStore } from '../../stores/world';

const world = useWorldStore();
const emit = defineEmits<{ select: [coord: { q: number; r: number }] }>();

const BUILDING_LABELS: Record<string, string> = {
  longhouse: 'Longhouse',
  lumberjack: 'Lumberjack',
  quarry: 'Quarry',
  farm: 'Crop farm',
  storagehouse: 'Storehouse',
  tower: 'Watchtower',
};

// No backend concept of "how many build slots does this settlement have"
// exists yet — a plausible fixed capacity, just for the "X / Y slots"
// header the mockup shows.
const TOTAL_SLOTS = 3;

function fmt(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

const orders = computed(() => {
  void world.hud.tick; // reactive dependency so the countdown ticks every second
  const elapsed = (Date.now() - world.hud.queueFetchedAt) / 1000;
  return world.hud.queue.map((q) => {
    const label = BUILDING_LABELS[q.building] ?? q.building;
    // Neither the backend's BuildOrder nor this snapshot carries when an
    // order actually started, so "percent complete" can't be computed
    // exactly — this treats the remaining time *at the moment it was
    // fetched* as a stand-in for the order's total duration, which reads
    // right for anything that started around when the HUD last polled but
    // undercounts an order that was already well underway before that.
    // Good enough for a progress bar, not a real accounting number.
    const remainingAtFetch = q.completesInSeconds;
    const remainingNow = remainingAtFetch === null ? null : Math.max(0, remainingAtFetch - elapsed);
    const progress =
      remainingAtFetch === null || remainingAtFetch <= 0
        ? 1
        : 1 - Math.max(0, Math.min(1, (remainingNow ?? 0) / remainingAtFetch));
    const done = remainingNow !== null && remainingNow <= 0.5;
    return {
      key: q.id,
      name: `${label} → ${q.targetLevel}`,
      remaining: remainingNow === null ? '—' : fmt(remainingNow),
      progress,
      done,
      subtext: `hex ${q.q}-${q.r}`,
      coord: { q: q.q, r: q.r },
    };
  });
});
</script>

<template>
  <div v-if="orders.length" class="status-card">
    <div class="status-card-header">
      <span class="status-card-title">Construction</span>
      <span class="status-card-count">{{ orders.length }} / {{ TOTAL_SLOTS }} slots</span>
    </div>
    <button
      v-for="o in orders"
      :key="o.key"
      type="button"
      class="status-row"
      @click="emit('select', o.coord)"
    >
      <div class="status-row-top">
        <span class="status-row-name">{{ o.name }}</span>
        <span class="status-row-time">{{ o.remaining }}</span>
      </div>
      <div class="status-progress">
        <div
          class="status-progress-fill"
          :class="{ 'is-done': o.done }"
          :style="{ width: `${Math.round(o.progress * 100)}%` }"
        />
      </div>
      <div class="status-subtext">{{ o.subtext }}</div>
    </button>
  </div>
</template>

<style scoped>
/*
 * Generic "status box" card convention (issue #16): sharp corners, a
 * header row (uppercase label + a count/countdown), rows with a titled
 * line + right-aligned time, an optional progress bar, and a dim subtext
 * line. Reusable for other status content (raids, settler voyages) by
 * giving `.status-card` a variant modifier for the accent color — not
 * added here since only this construction panel is wired up yet.
 */
.status-card {
  position: absolute;
  left: 16px;
  top: 76px;
  z-index: 10;
  width: 240px;
  padding: 14px 15px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 0;
}
.status-card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--panel-border);
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
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  padding: 8px 0;
  cursor: pointer;
}
.status-row + .status-row {
  margin-top: 2px;
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
</style>
