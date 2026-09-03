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
import { computed, ref } from 'vue';
import { useWorldStore } from '../../stores/world';

const world = useWorldStore();
const emit = defineEmits<{ select: [coord: { q: number; r: number }] }>();

const cancelling = ref<string | null>(null);
const error = ref('');

async function cancel(orderId: string) {
  error.value = '';
  cancelling.value = orderId;
  try {
    await world.cancelBuildLive(orderId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not cancel the order.';
  } finally {
    cancelling.value = null;
  }
}

const BUILDING_LABELS: Record<string, string> = {
  longhouse: 'Longhouse',
  lumberjack: 'Lumberjack',
  quarry: 'Quarry',
  farm: 'Crop farm',
  storagehouse: 'Storehouse',
  tower: 'Watchtower',
  fishinghut: 'Fishing hut',
  magictower: 'Magic tower',
  pumpkinfarm: 'Pumpkin farm',
  shrineofthor: 'Shrine of Thor',
  shrineoffreyja: 'Shrine of Freyja',
  archeryrange: 'Archery range',
  dockyard: 'Dockyard',
  greatstorehouse: 'Great storehouse',
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

// Issue #99: progress must be poll-invariant. The backend now sends the
// order's true total duration (`totalSeconds`), so progress is `1 -
// remainingNow / totalSeconds` rather than relative to whenever the HUD
// last polled. `lastProgress` is a defensive fallback for a missing/stale
// `totalSeconds` (or any other surprise): it clamps each order's displayed
// progress to never go backward, keyed by order id so a genuinely new order
// starts fresh.
const lastProgress = new Map<string, number>();

const orders = computed(() => {
  void world.hud.tick; // reactive dependency so the countdown ticks every second
  const elapsed = (Date.now() - world.hud.queueFetchedAt) / 1000;
  const liveIds = new Set(world.hud.queue.map((q) => q.id));
  for (const id of lastProgress.keys()) {
    if (!liveIds.has(id)) {
      lastProgress.delete(id);
    }
  }
  return world.hud.queue.map((q) => {
    const label = BUILDING_LABELS[q.building] ?? q.building;
    const remainingAtFetch = q.completesInSeconds;
    const remainingNow = remainingAtFetch === null ? null : Math.max(0, remainingAtFetch - elapsed);
    const totalSeconds = q.totalSeconds;
    let progress =
      remainingAtFetch === null || totalSeconds <= 0
        ? 1
        : 1 - Math.max(0, Math.min(1, (remainingNow ?? 0) / totalSeconds));
    progress = Math.max(progress, lastProgress.get(q.id) ?? 0);
    lastProgress.set(q.id, progress);
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
    <div v-for="o in orders" :key="o.key" class="status-row">
      <button type="button" class="status-row-click" @click="emit('select', o.coord)">
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
      <button
        type="button"
        class="cancel-button"
        :disabled="cancelling === o.key"
        @click.stop="cancel(o.key)"
      >
        ✕
      </button>
    </div>
    <div v-if="error" class="status-subtext error">{{ error }}</div>
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
.status-subtext.error {
  color: #e05a5a;
  margin-top: 8px;
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
