<script setup lang="ts">
// The condensed construction/training progress shown when the draggable
// mobile header bar (TopBar's `draggable` prop) is expanded — a compact
// "how are my queues doing" glance, not a replacement for the full
// BuildQueuePanel/TrainingQueuePanel corner cards or the Queues sidebar.
// Reuses the same poll-invariant progress math as those panels rather than
// duplicating it differently here.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useWorldStore } from '../../stores/world';

const world = useWorldStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const MAX_TRAINING_QUEUE_LENGTH = 5;

function progressOf(remainingAtFetch: number | null, totalSeconds: number, fetchedAt: number): number {
  void world.hud.tick; // reactive dependency so the bar advances every second
  if (remainingAtFetch === null || totalSeconds <= 0) return 1;
  const elapsed = (Date.now() - fetchedAt) / 1000;
  const remainingNow = Math.max(0, remainingAtFetch - elapsed);
  return Math.max(0, Math.min(1, 1 - remainingNow / totalSeconds));
}

// The furthest-along non-waiting order in each queue stands in for "how is
// this queue doing" at a glance — a single bar per queue, not one per order.
// Each row only renders while something is actually queued (`used > 0`),
// not just because the settlement has slots at all — an idle queue has
// nothing worth glancing at here.
const construction = computed(() => {
  const active = world.hud.queue.find((o) => o.state !== 'waiting');
  return {
    used: world.hud.construction.slotsUsed,
    total: world.hud.construction.slots,
    progress: active ? progressOf(active.completesInSeconds, active.totalSeconds, world.hud.queueFetchedAt) : 0,
  };
});

const training = computed(() => {
  const active = world.hud.trainingQueue[0];
  return {
    used: world.hud.trainingQueue.length,
    total: MAX_TRAINING_QUEUE_LENGTH,
    progress: active ? progressOf(active.completesInSeconds, active.totalSeconds, world.hud.trainingQueueFetchedAt) : 0,
  };
});
</script>

<template>
  <div class="queue-summary">
    <div v-if="construction.used > 0" class="summary-row">
      <div class="summary-row-top">
        <span class="summary-label">{{ t('hud.buildQueue.title') }}</span>
        <span class="summary-count">{{ t('hud.buildQueue.slots', { used: construction.used, total: construction.total }) }}</span>
      </div>
      <div class="summary-progress">
        <div class="summary-progress-fill" :style="{ width: `${Math.round(construction.progress * 100)}%` }" />
      </div>
    </div>
    <div v-if="training.used > 0" class="summary-row">
      <div class="summary-row-top">
        <span class="summary-label">{{ t('hud.trainingQueue.title') }}</span>
        <span class="summary-count">{{ t('hud.trainingQueue.slots', { used: training.used, total: training.total }) }}</span>
      </div>
      <div class="summary-progress">
        <div class="summary-progress-fill" :style="{ width: `${Math.round(training.progress * 100)}%` }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.queue-summary {
  padding: 14px 20px 16px;
  background: rgba(6, 12, 16, 0.94);
  pointer-events: auto;
}
.summary-row + .summary-row {
  margin-top: 12px;
}
.summary-row-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.summary-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text);
}
.summary-count {
  font-size: 12px;
  color: var(--muted);
}
.summary-progress {
  margin-top: 6px;
  height: 4px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  overflow: hidden;
}
.summary-progress-fill {
  height: 100%;
  background: var(--gold);
  border-radius: 2px;
}
</style>
