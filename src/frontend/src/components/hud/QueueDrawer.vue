<script setup lang="ts">
// Mobile counterpart to BuildQueuePanel.vue + TrainingQueuePanel.vue: on a
// narrow viewport there isn't room for two 240px status cards, so both
// queues (plus the garrison/guests) live in one slide-out drawer instead.
//
// The collapsed rail deliberately does NOT show a slot count the way the
// desktop panels do — with more than a handful of slots (premium accounts
// can queue well past 3), a static "N / M" count stops being useful at a
// glance. Instead it shows only the single soonest-to-finish item per
// category, plus a "+N more" chip for the rest — see soonestBuild/
// soonestTraining below.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { unitName } from '../../i18n/catalogueNames';
import { useWorldStore } from '../../stores/world';
import { useBuildOrders, useTrainingOrders, type BuildOrderRow, type TrainingOrderRow } from '../../composables/useQueueOrders';

const world = useWorldStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ select: [coord: { q: number; r: number }] }>();

// Mirrors Settlement.MaxTrainingQueueLength (backend) — same reasoning as
// TrainingQueuePanel.vue's own copy of this constant.
const MAX_TRAINING_QUEUE_LENGTH = 5;

const buildOrders = useBuildOrders();
const trainingOrders = useTrainingOrders();

const cancelling = ref<string | null>(null);
const error = ref('');

async function cancel(orderId: string) {
  error.value = '';
  cancelling.value = orderId;
  try {
    await world.cancelBuildLive(orderId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('hud.buildQueue.cancelError');
  } finally {
    cancelling.value = null;
  }
}

function soonest<T extends { remainingSeconds: number | null }>(pool: T[]): T | null {
  if (!pool.length) return null;
  return pool.reduce((best, r) => ((r.remainingSeconds ?? Infinity) < (best.remainingSeconds ?? Infinity) ? r : best));
}

const soonestBuild = computed<BuildOrderRow | null>(() => {
  const active = buildOrders.value.filter((o) => !o.waiting);
  return soonest(active.length ? active : buildOrders.value);
});

const soonestTraining = computed<TrainingOrderRow | null>(() => soonest(trainingOrders.value));

const garrison = computed(() =>
  world.hud.garrison
    .filter((g) => g.count > 0)
    .map((g) => ({ key: g.unit, label: unitName(g.unit), count: g.count })),
);

// Issue #40 phase 4 — mirrors TrainingQueuePanel.vue's own guests computed;
// see its comment for why guests are folded in here rather than getting a
// separate HUD element.
const guests = computed(() =>
  world.guestArmies.map((g) => ({
    key: g.armyId,
    ownerName: world.model.getSettlement(g.ownerSettlementId)?.name ?? t('hud.trainingQueue.unknownSettlement'),
    composition: g.stacks
      .filter((s) => s.count > 0)
      .map((s) => t('hud.trainingQueue.orderName', { count: s.count, unit: unitName(s.unit) }))
      .join(', ') || '—',
  })),
);

const reservedTotal = computed(() => {
  const r = world.hud.reserved;
  return r.wood + r.stone + r.food + r.iron;
});

const hasAnything = computed(
  () => buildOrders.value.length > 0 || trainingOrders.value.length > 0 || garrison.value.length > 0 || guests.value.length > 0,
);

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function selectBuildOrder(coord: { q: number; r: number }) {
  close();
  emit('select', coord);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    close();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div v-if="hasAnything">
    <div v-if="open" class="queue-drawer-backdrop" @pointerdown.self="close" />
    <div class="queue-drawer" :class="{ 'is-open': open }">
      <div id="queue-drawer-body" class="queue-drawer-panel" :aria-hidden="!open">
        <div class="queue-drawer-header">
          <span class="status-card-title">{{ t('hud.queueDrawer.title') }}</span>
          <button type="button" class="queue-drawer-close" @click="close">{{ t('hud.queueDrawer.close') }}</button>
        </div>

        <div class="queue-drawer-scroll">
          <template v-if="buildOrders.length">
            <div class="status-card-header">
              <span class="status-card-title">{{ t('hud.buildQueue.title') }}</span>
              <span class="status-card-count">{{ t('hud.buildQueue.slots', { used: world.hud.construction.slotsUsed, total: world.hud.construction.slots }) }}</span>
            </div>
            <div v-for="o in buildOrders" :key="o.key" class="status-row" :class="{ 'is-waiting': o.waiting }">
              <button type="button" class="status-row-click" @click="selectBuildOrder(o.coord)">
                <div class="status-row-top">
                  <span class="status-row-name">{{ o.name }}</span>
                  <span class="status-row-time">{{ o.remaining }}</span>
                </div>
                <div v-if="!o.waiting" class="status-progress">
                  <div class="status-progress-fill" :class="{ 'is-done': o.done }" :style="{ width: `${Math.round(o.progress * 100)}%` }" />
                </div>
                <div class="status-subtext">{{ o.subtext }}</div>
              </button>
              <button type="button" class="cancel-button" :disabled="cancelling === o.key" @click.stop="cancel(o.key)">
                {{ t('hud.buildQueue.cancel') }}
              </button>
            </div>
            <div v-if="reservedTotal > 0" class="status-subtext reserved-footer">
              {{ t('hud.buildQueue.reservedFooter', {
                wood: Math.round(world.hud.reserved.wood),
                stone: Math.round(world.hud.reserved.stone),
                food: Math.round(world.hud.reserved.food),
                iron: Math.round(world.hud.reserved.iron),
              }) }}
            </div>
            <div v-if="error" class="status-subtext error">{{ error }}</div>
          </template>

          <template v-if="trainingOrders.length">
            <div class="status-card-header" :class="{ 'has-section-above': buildOrders.length }">
              <span class="status-card-title">{{ t('hud.trainingQueue.title') }}</span>
              <span class="status-card-count">{{ t('hud.trainingQueue.slots', { used: trainingOrders.length, total: MAX_TRAINING_QUEUE_LENGTH }) }}</span>
            </div>
            <div v-for="o in trainingOrders" :key="o.key" class="status-row">
              <div class="status-row-top">
                <span class="status-row-name">{{ o.name }}</span>
                <span class="status-row-time">{{ o.remaining }}</span>
              </div>
              <div class="status-progress">
                <div class="status-progress-fill" :class="{ 'is-done': o.done }" :style="{ width: `${Math.round(o.progress * 100)}%` }" />
              </div>
              <div class="status-subtext">{{ o.subtext }}</div>
            </div>
          </template>

          <div class="status-card-header" :class="{ 'has-section-above': buildOrders.length || trainingOrders.length }">
            <span class="status-card-title">{{ t('hud.trainingQueue.garrison') }}</span>
          </div>
          <div v-if="garrison.length" class="garrison-grid">
            <div v-for="g in garrison" :key="g.key" class="garrison-row">
              <span class="garrison-name">{{ g.label }}</span>
              <span class="garrison-count">{{ g.count }}</span>
            </div>
          </div>
          <div v-else class="status-subtext">{{ t('hud.trainingQueue.garrisonEmpty') }}</div>

          <template v-if="guests.length">
            <div class="status-card-header has-section-above">
              <span class="status-card-title">{{ t('hud.trainingQueue.guests') }}</span>
              <span class="status-card-count">{{ guests.length }}</span>
            </div>
            <div class="guests-grid">
              <div v-for="g in guests" :key="g.key" class="guest-row">
                <span class="guest-owner">{{ g.ownerName }}</span>
                <span class="guest-composition">{{ g.composition }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <button
        type="button"
        class="queue-drawer-rail"
        :aria-expanded="open"
        aria-controls="queue-drawer-body"
        :aria-label="t('hud.queueDrawer.openLabel')"
        @click="toggle"
      >
        <div class="queue-drawer-rail-content">
          <div v-if="soonestBuild" class="rail-row">
            <div class="rail-row-top">
              <span class="rail-row-label">{{ t('hud.queueDrawer.buildLabel') }}</span>
              <span v-if="buildOrders.length > 1" class="rail-row-more">{{ t('hud.queueDrawer.more', { count: buildOrders.length - 1 }) }}</span>
            </div>
            <div class="rail-row-name">{{ soonestBuild.name }}</div>
            <div class="rail-row-bottom">
              <span class="rail-row-time">{{ soonestBuild.remaining }}</span>
            </div>
            <div v-if="!soonestBuild.waiting" class="status-progress">
              <div class="status-progress-fill" :class="{ 'is-done': soonestBuild.done }" :style="{ width: `${Math.round(soonestBuild.progress * 100)}%` }" />
            </div>
          </div>
          <div v-if="soonestTraining" class="rail-row">
            <div class="rail-row-top">
              <span class="rail-row-label">{{ t('hud.queueDrawer.trainLabel') }}</span>
              <span v-if="trainingOrders.length > 1" class="rail-row-more">{{ t('hud.queueDrawer.more', { count: trainingOrders.length - 1 }) }}</span>
            </div>
            <div class="rail-row-name">{{ soonestTraining.name }}</div>
            <div class="rail-row-bottom">
              <span class="rail-row-time">{{ soonestTraining.remaining }}</span>
            </div>
            <div class="status-progress">
              <div class="status-progress-fill" :class="{ 'is-done': soonestTraining.done }" :style="{ width: `${Math.round(soonestTraining.progress * 100)}%` }" />
            </div>
          </div>
        </div>
        <span class="queue-drawer-chevron" aria-hidden="true">{{ t('hud.queueDrawer.chevron') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/*
 * Reuses the `.status-*` conventions from BuildQueuePanel.vue/
 * TrainingQueuePanel.vue (mirrored, not shared — Vue scoped styles don't
 * leak across components) so the expanded drawer body reads the same as
 * the desktop panels it replaces.
 */
.status-card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--panel-border);
}
.status-card-header.has-section-above {
  margin-top: 12px;
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
.status-subtext.error {
  color: #e05a5a;
  margin-top: 8px;
}
.status-row.is-waiting {
  opacity: 0.55;
}
.status-row.is-waiting .status-row-time {
  color: var(--muted);
}
.reserved-footer {
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px solid var(--panel-border);
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
.garrison-grid,
.guests-grid {
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

/* Drawer chrome */
.queue-drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 11;
  background: rgba(0, 0, 0, 0.35);
}
.queue-drawer {
  position: fixed;
  left: 0;
  top: 76px;
  bottom: 0;
  z-index: 12;
  display: flex;
  width: min(86vw, 340px);
  transform: translateX(calc(-1 * (min(86vw, 340px) - 96px)));
  transition: transform 180ms ease;
}
.queue-drawer.is-open {
  transform: translateX(0);
}
@media (prefers-reduced-motion: reduce) {
  .queue-drawer {
    transition: none;
  }
}
.queue-drawer-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-left: none;
  overflow: hidden;
}
.queue-drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  border-bottom: 1px solid var(--panel-border);
  flex: none;
}
.queue-drawer-close {
  background: transparent;
  border: none;
  color: var(--muted);
  font: inherit;
  font-size: 15px;
  cursor: pointer;
  padding: 2px 6px;
}
.queue-drawer-close:hover {
  color: var(--text);
}
.queue-drawer-scroll {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 15px 16px;
}
.queue-drawer-rail {
  flex: none;
  width: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 8px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-left: 1px solid var(--panel-border);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.queue-drawer-rail-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rail-row-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 4px;
}
.rail-row-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
.rail-row-more {
  font-size: 10px;
  color: var(--muted);
}
.rail-row-name {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rail-row-bottom {
  margin-top: 2px;
}
.rail-row-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--gold);
}
.queue-drawer-chevron {
  flex: none;
  font-size: 18px;
  color: var(--muted);
}
</style>
