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
import { formatCountdown, formatCountdownShort } from '../lib/hud/countdown';
import { isPendingOrder } from '../lib/hud/pendingBuild';

export { formatCountdown, formatCountdownShort };

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
    // A pending (optimistic, not yet confirmed) order only exists to put the
    // "…" dial on its hex — it is not a queue row.
    const orders = world.hud.queue.filter((q) => !isPendingOrder(q));
    const liveIds = new Set(orders.map((q) => q.id));
    for (const id of lastProgress.keys()) {
      if (!liveIds.has(id)) {
        lastProgress.delete(id);
      }
    }
    return orders.map((q) => {
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
  /** Which building trains this part ("Barracks, level 7 · hex 3, -2"). */
  building: string;
  /** A part queued behind another one in its building: no progress bar, it shows when it starts instead. */
  waiting: boolean;
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
      // One building trains one part at a time: a part whose start is still ahead (or unknown, on a frozen clock) is waiting.
      const startsNow = o.startsInSeconds === null ? null : Math.max(0, o.startsInSeconds - elapsed);
      const waiting = startsNow === null || startsNow > 0.5;
      const placed = world.hud.buildings.find((b) => b.q === o.q && b.r === o.r);
      const building = placed
        ? t('hud.trainingQueue.inBuilding', { building: buildingName(placed.type), level: placed.level, q: o.q, r: o.r })
        : t('hud.buildQueue.hexSubtext', { q: o.q, r: o.r });
      const remainingAtFetch = o.completesInSeconds;
      const remainingNow = remainingAtFetch === null ? null : Math.max(0, remainingAtFetch - elapsed);
      const totalSeconds = o.totalSeconds;
      let progress =
        remainingAtFetch === null || totalSeconds <= 0
          ? 1
          : 1 - Math.max(0, Math.min(1, (remainingNow ?? 0) / totalSeconds));
      if (waiting) progress = 0;
      progress = Math.max(progress, lastProgress.get(o.id) ?? 0);
      lastProgress.set(o.id, progress);
      const done = !waiting && remainingNow !== null && remainingNow <= 0.5;
      return {
        key: o.id,
        name: t('hud.trainingQueue.orderName', { count: o.count, unit: unitName(o.unit) }),
        remaining: waiting
          ? startsNow === null
            ? t('hud.trainingQueue.waiting')
            : t('hud.trainingQueue.startsIn', { time: formatCountdown(startsNow) })
          : remainingNow === null
            ? '—'
            : formatCountdown(remainingNow),
        remainingSeconds: waiting ? null : remainingNow,
        progress,
        done,
        subtext: t('hud.trainingQueue.trainedCount', { completed: o.completedCount, total: o.count }),
        building,
        waiting,
      };
    });
  });
}
