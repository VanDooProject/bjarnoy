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
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { unitName } from '../../i18n/catalogueNames';
import GuestList from './GuestList.vue';
import { useWorldStore } from '../../stores/world';
import { useTrainingOrders } from '../../composables/useQueueOrders';

const world = useWorldStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const orders = useTrainingOrders();

const garrison = computed(() =>
  world.hud.garrison
    .filter((g) => g.count > 0)
    .map((g) => ({ key: g.unit, label: unitName(g.unit), count: g.count })),
);

// Issue #40 phase 4: guest (Support) armies stationed at this settlement —
// the host's view (`GET /settlements/{id}/guests`, fetched alongside
// `world.armies` — see world.ts's `refreshArmies`), with a "Send home" per
// row (GuestList.vue, shared with QueueDrawer). Shown as a small section
// under Garrison rather than a separate HUD panel: most screen corners are
// already taken (BuildQueuePanel top-left, this panel top-right, ArmyPanel
// bottom-right), and a guest garrison is close kin to "who's standing at
// home" shown just above it.
const guestCount = computed(() => world.guestArmies.length);
</script>

<template>
  <div v-if="orders.length || garrison.length || guestCount" class="status-card training-queue-panel">
    <template v-if="orders.length">
      <div class="status-card-header">
        <span class="status-card-title">{{ t('hud.trainingQueue.title') }}</span>
        <span class="status-card-count">{{ t('hud.trainingQueue.orders', { count: orders.length }) }}</span>
      </div>
      <div v-for="o in orders" :key="o.key" class="status-row" :class="{ 'is-waiting': o.waiting }">
        <div class="status-row-top">
          <span class="status-row-name">{{ o.name }}</span>
          <span class="status-row-time">{{ o.remaining }}</span>
        </div>
        <div v-if="!o.waiting" class="status-progress">
          <div
            class="status-progress-fill"
            :class="{ 'is-done': o.done }"
            :style="{ width: `${Math.round(o.progress * 100)}%` }"
          />
        </div>
        <div class="status-subtext">{{ o.building }}</div>
        <div class="status-subtext">{{ o.subtext }}</div>
      </div>
    </template>

    <div class="garrison" :class="{ 'has-orders-above': orders.length }">
      <div class="status-card-header">
        <span class="status-card-title">{{ t('hud.trainingQueue.garrison') }}</span>
      </div>
      <div v-if="garrison.length" class="garrison-grid">
        <div v-for="g in garrison" :key="g.key" class="garrison-row">
          <span class="garrison-name">{{ g.label }}</span>
          <span class="garrison-count">{{ g.count }}</span>
        </div>
      </div>
      <div v-else class="status-subtext garrison-empty">{{ t('hud.trainingQueue.garrisonEmpty') }}</div>
    </div>

    <div v-if="guestCount" class="guests has-orders-above">
      <div class="status-card-header">
        <span class="status-card-title">{{ t('hud.trainingQueue.guests') }}</span>
        <span class="status-card-count">{{ guestCount }}</span>
      </div>
      <GuestList />
    </div>
  </div>
</template>

<style scoped>
/* An order queued behind another one in its building reads dim: no progress bar, "Starts in …" in place of a countdown. */
.status-row.is-waiting {
  opacity: 0.55;
}
.status-row.is-waiting .status-row-time {
  color: var(--muted);
}
/*
 * The card box and its header (`.status-card`, `.status-card-header/-title/-count`) are shared in style.css; only this panel's
 * place is set here. `.status-row`/`.status-progress`/`.status-subtext` are still mirrored from BuildQueuePanel.vue.
 */
.status-card {
  right: 16px;
  top: 76px;
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
</style>
