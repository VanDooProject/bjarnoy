<script setup lang="ts">
// zip 9 / README "real-time elements": build queue countdowns, drawn from
// the backend's real per-order timers (Bjarnoy.Domain.Buildings.BuildOrder)
// rather than simulated — see stores/world.ts's `hud.queue`. Demo mode has
// no backend queue (buildings there place instantly), so this panel simply
// doesn't render then.
import { computed } from 'vue';
import { useWorldStore } from '../../stores/world';
import type { AxialCoord } from '../../lib/hex/coords';

const world = useWorldStore();
// issue #16 status box: "clicking a building in queue should center and
// highlight (some flashes) the tile" — the panel only knows q/r from the
// backend queue snapshot, so it hands that up rather than owning any
// renderer/camera concern itself.
const emit = defineEmits<{ select: [coord: AxialCoord] }>();

const BUILDING_LABELS: Record<string, string> = {
  longhouse: 'Longhouse',
  lumberjack: 'Lumberjack',
  quarry: 'Quarry',
  farm: 'Farm',
  storagehouse: 'Storehouse',
  tower: 'Watchtower',
};

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
  return world.hud.queue.map((q) => ({
    key: q.id,
    name: BUILDING_LABELS[q.building] ?? q.building,
    lvl: q.targetLevel,
    remaining: q.completesInSeconds === null ? null : fmt(q.completesInSeconds - elapsed),
    coord: { q: q.q, r: q.r } as AxialCoord,
  }));
});
</script>

<template>
  <div v-if="orders.length" class="build-queue panel">
    <div class="header">
      <span class="label">Build queue</span>
      <span class="count">{{ orders.length }}</span>
    </div>
    <button v-for="o in orders" :key="o.key" type="button" class="order" @click="emit('select', o.coord)">
      <span class="name">{{ o.name }} <span class="lvl">→ {{ o.lvl }}</span></span>
      <span class="time">{{ o.remaining ?? '—' }}</span>
    </button>
  </div>
</template>

<style scoped>
.build-queue {
  pointer-events: auto;
  width: 232px;
  padding: 14px 15px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}
.label {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.count {
  font-size: 12px;
  color: var(--muted-2);
}
.order {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: baseline;
  padding: 6px 0;
  border-top: 1px solid var(--panel-border);
  border-left: none;
  border-right: none;
  border-bottom: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.order:first-of-type {
  border-top: none;
}
.order:hover .name {
  color: var(--gold);
}
.lvl {
  color: var(--muted);
}
.time {
  font-weight: 600;
  color: var(--gold);
}
</style>
