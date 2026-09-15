// Shared countdown/progress derivation for the settlement build & training
// queues — previously duplicated verbatim between BuildQueuePanel.vue and
// TrainingQueuePanel.vue (see their own history/comments on issue #99's
// poll-invariant progress fix). Extracted so a third consumer (the mobile
// QueueDrawer) doesn't become a third copy.
import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { buildingName, unitName } from '../i18n/catalogueNames';
import { useWorldStore } from '../stores/world';

// Mirrors Settlement.MaxTrainingQueueLength (backend) — no endpoint exposes
// this as data, so it's kept in sync here manually. Shared by
// TrainingQueuePanel.vue and QueueDrawer.vue rather than each keeping its
// own copy.
export const MAX_TRAINING_QUEUE_LENGTH = 5;

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export interface BuildOrderRow {
  key: string;
  name: string;
  remaining: string;
  remainingSeconds: number | null;
  progress: number;
  done: boolean;
  waiting: boolean;
  subtext: string;
  coord: { q: number; r: number };
}

// Issue #99: progress must be poll-invariant. The backend sends the order's
// true total duration (`totalSeconds`), so progress is `1 - remainingNow /
// totalSeconds` rather than relative to whenever the HUD last polled.
// `lastProgress` is a defensive fallback for a missing/stale `totalSeconds`
// (or any other surprise): it clamps each order's displayed progress to
// never go backward, keyed by order id so a genuinely new order starts
// fresh. Each call to useBuildOrders()/useTrainingOrders() gets its own map.
export function useBuildOrders(): ComputedRef<BuildOrderRow[]> {
  const world = useWorldStore();
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
  const lastProgress = new Map<string, number>();

  return computed(() => {
    void world.hud.tick; // reactive dependency so the countdown ticks every second
    const elapsed = (Date.now() - world.hud.queueFetchedAt) / 1000;
    const liveIds = new Set(world.hud.queue.map((q) => q.id));
    for (const id of lastProgress.keys()) {
      if (!liveIds.has(id)) {
        lastProgress.delete(id);
      }
    }
    return world.hud.queue.map((q) => {
      const label = buildingName(q.building);
      const waiting = q.state === 'waiting';
      // A waiting order has no real completion instant yet (see
      // BuildOrderResponse.completesAtGameTime's own remarks) — no
      // countdown, no progress bar, just "waiting for a slot".
      const remainingAtFetch = waiting ? null : q.completesInSeconds;
      const remainingNow = remainingAtFetch === null ? null : Math.max(0, remainingAtFetch - elapsed);
      const totalSeconds = q.totalSeconds;
      let progress =
        waiting || remainingAtFetch === null || totalSeconds <= 0
          ? 1
          : 1 - Math.max(0, Math.min(1, (remainingNow ?? 0) / totalSeconds));
      progress = Math.max(progress, lastProgress.get(q.id) ?? 0);
      lastProgress.set(q.id, progress);
      const done = remainingNow !== null && remainingNow <= 0.5;
      return {
        key: q.id,
        name: t('hud.buildQueue.orderName', { name: label, level: q.targetLevel }),
        remaining: waiting ? t('hud.buildQueue.waitingForSlot') : remainingNow === null ? '—' : formatCountdown(remainingNow),
        remainingSeconds: waiting ? null : remainingNow,
        progress,
        done,
        waiting,
        subtext: t('hud.buildQueue.hexSubtext', { q: q.q, r: q.r }),
        coord: { q: q.q, r: q.r },
      };
    });
  });
}

export interface TrainingOrderRow {
  key: string;
  name: string;
  remaining: string;
  remainingSeconds: number | null;
  progress: number;
  done: boolean;
  subtext: string;
}

export function useTrainingOrders(): ComputedRef<TrainingOrderRow[]> {
  const world = useWorldStore();
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
  const lastProgress = new Map<string, number>();

  return computed(() => {
    void world.hud.tick; // reactive dependency so the countdown ticks every second
    const elapsed = (Date.now() - world.hud.trainingQueueFetchedAt) / 1000;
    const liveIds = new Set(world.hud.trainingQueue.map((o) => o.id));
    for (const id of lastProgress.keys()) {
      if (!liveIds.has(id)) {
        lastProgress.delete(id);
      }
    }
    return world.hud.trainingQueue.map((o) => {
      const remainingAtFetch = o.completesInSeconds;
      const remainingNow = remainingAtFetch === null ? null : Math.max(0, remainingAtFetch - elapsed);
      const totalSeconds = o.totalSeconds;
      let progress =
        remainingAtFetch === null || totalSeconds <= 0
          ? 1
          : 1 - Math.max(0, Math.min(1, (remainingNow ?? 0) / totalSeconds));
      progress = Math.max(progress, lastProgress.get(o.id) ?? 0);
      lastProgress.set(o.id, progress);
      const done = remainingNow !== null && remainingNow <= 0.5;
      return {
        key: o.id,
        name: t('hud.trainingQueue.orderName', { count: o.count, unit: unitName(o.unit) }),
        remaining: remainingNow === null ? '—' : formatCountdown(remainingNow),
        remainingSeconds: remainingNow,
        progress,
        done,
        subtext: t('hud.trainingQueue.trainedCount', { completed: o.completedCount, total: o.count }),
      };
    });
  });
}
