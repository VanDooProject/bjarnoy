<script setup lang="ts">
// Issue #40 phase 1: a Travian-style "who's standing at home" view — the
// training-queue half mirrors BuildQueuePanel.vue's countdown/progress-bar
// convention (same backend-driven-timer reasoning: the queue's own
// completesInSeconds is real, not simulated), and the garrison half is a
// simple unit-type + count list underneath it. Kept as a sibling panel
// rather than folding into BuildQueuePanel — build and train are
// conceptually separate queues with different slot limits (Settlement.cs's
// MaxQueueLength vs. MaxTrainingQueueLength) and it reads awkwardly to
// interleave building levels with unit counts in one list.
//
// Demo mode has no backend training queue or garrison (the local WorldModel
// has no concept of trained units yet), so both halves render only when
// there is something to show — same as BuildQueuePanel not rendering when
// `world.hud.queue` is empty.
import { computed } from 'vue';
import { useWorldStore } from '../../stores/world';

const world = useWorldStore();

const UNIT_LABELS: Record<string, string> = {
  thrall: 'Thrall',
  spearman: 'Spearman',
  axeman: 'Axeman',
  bowman: 'Bowman',
  berserker: 'Berserker',
  provisioner: 'Provisioner',
  catapult: 'Catapult',
  karve: 'Karve',
  longship: 'Longship',
};

function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}

// Mirrors Settlement.MaxTrainingQueueLength (backend) — no endpoint exposes
// this as data, so it's kept in sync here the same way BuildQueuePanel pins
// its own TOTAL_SLOTS.
const MAX_TRAINING_QUEUE_LENGTH = 5;

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
  const elapsed = (Date.now() - world.hud.trainingQueueFetchedAt) / 1000;
  return world.hud.trainingQueue.map((o) => {
    // Issue #91: progress is now an absolute fraction of the batch's real
    // total duration (poll-invariant) instead of being re-derived from
    // whatever was left at the last poll — see BuildQueuePanel's comment for
    // why the old approximation made the bar jump backward on every refetch.
    const totalSeconds = o.totalSeconds;
    const remainingAtFetch = o.completesInSeconds;
    const remainingNow = remainingAtFetch === null ? null : Math.max(0, remainingAtFetch - elapsed);
    const progress =
      remainingAtFetch === null || totalSeconds === null || totalSeconds <= 0
        ? 1
        : 1 - Math.max(0, Math.min(1, (remainingNow ?? 0) / totalSeconds));
    const done = remainingNow !== null && remainingNow <= 0.5;
    return {
      key: o.id,
      name: `${o.count}× ${unitLabel(o.unit)}`,
      remaining: remainingNow === null ? '—' : fmt(remainingNow),
      progress,
      done,
      subtext: `${o.completedCount} / ${o.count} trained`,
    };
  });
});

const garrison = computed(() =>
  world.hud.garrison
    .filter((g) => g.count > 0)
    .map((g) => ({ key: g.unit, label: unitLabel(g.unit), count: g.count })),
);

// Issue #40 phase 4: guest (Support) armies currently stationed at this
// settlement — the host's read-only view (`GET /settlements/{id}/guests`,
// fetched alongside `world.armies` — see world.ts's `refreshArmies`). Shown
// as a small section under Garrison rather than a separate HUD panel: every
// screen corner is already taken (BuildQueuePanel top-left, this panel
// top-right, RealmPanel bottom-left, ArmyPanel bottom-right — see each
// panel's own `position: absolute`), and a guest garrison is conceptually
// close kin to "who's standing at home" already shown just above it. No
// recall/action buttons here — the host cannot command a guest army, only
// its owner can (via their own settlement's ArmyPanel).
const guests = computed(() =>
  world.guestArmies.map((g) => ({
    key: g.armyId,
    ownerName: world.model.getSettlement(g.ownerSettlementId)?.name ?? 'Unknown settlement',
    composition: g.stacks
      .filter((s) => s.count > 0)
      .map((s) => `${s.count}× ${unitLabel(s.unit)}`)
      .join(', ') || '—',
  })),
);
</script>

<template>
  <div v-if="orders.length || garrison.length || guests.length" class="status-card training-queue-panel">
    <template v-if="orders.length">
      <div class="status-card-header">
        <span class="status-card-title">Training</span>
        <span class="status-card-count">{{ orders.length }} / {{ MAX_TRAINING_QUEUE_LENGTH }} slots</span>
      </div>
      <div v-for="o in orders" :key="o.key" class="status-row">
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
      </div>
    </template>

    <div class="garrison" :class="{ 'has-orders-above': orders.length }">
      <div class="status-card-header">
        <span class="status-card-title">Garrison</span>
      </div>
      <div v-if="garrison.length" class="garrison-grid">
        <div v-for="g in garrison" :key="g.key" class="garrison-row">
          <span class="garrison-name">{{ g.label }}</span>
          <span class="garrison-count">{{ g.count }}</span>
        </div>
      </div>
      <div v-else class="status-subtext garrison-empty">No units standing here yet.</div>
    </div>

    <div v-if="guests.length" class="guests has-orders-above">
      <div class="status-card-header">
        <span class="status-card-title">Guests</span>
        <span class="status-card-count">{{ guests.length }}</span>
      </div>
      <div class="guests-grid">
        <div v-for="g in guests" :key="g.key" class="guest-row">
          <span class="guest-owner">{{ g.ownerName }}</span>
          <span class="guest-composition">{{ g.composition }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * `.status-card`/`.status-row`/`.status-progress`/`.status-subtext`/
 * `.status-card-header`/`.status-card-title`/`.status-card-count` are
 * intentionally mirrored from BuildQueuePanel.vue's scoped styles (Vue
 * scoped styles don't leak across components) rather than shared, so both
 * panels stay visually identical without introducing a cross-component CSS
 * dependency for four small rulesets.
 */
.status-card {
  position: absolute;
  right: 16px;
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
  padding: 8px 0;
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

.garrison.has-orders-above {
  margin-top: 12px;
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
.garrison-empty {
  margin-top: 0;
}

.guests.has-orders-above {
  margin-top: 12px;
}
.guests-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
</style>
