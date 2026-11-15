<script setup lang="ts">
// Everything under a "Garrison" header, shared by TrainingQueuePanel.vue (desktop) and
// QueueDrawer.vue (phone), each of which keeps its own header: the own units, the Guests section
// and the Upkeep line. The food each unit type eats per hour is hidden until the pointer is over
// the list or the player taps the Upkeep line (the only way on a touch screen).
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { unitName } from '../../i18n/catalogueNames';
import { formatCountdownShort } from '../../lib/hud/countdown';
import { foodRunsOutInSeconds, stackUpkeepPerHour, stacksUpkeepPerHour } from '../../lib/units/garrisonUpkeep';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { useWorldStore } from '../../stores/world';
import GarrisonUnitRow from './GarrisonUnitRow.vue';
import GuestList from './GuestList.vue';

const world = useWorldStore();
const catalogue = useUnitCatalogueStore();
const { t, n } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

onMounted(() => {
  void catalogue.load();
});

const garrison = computed(() =>
  world.hud.garrison
    .filter((g) => g.count > 0)
    .map((g) => ({
      key: g.unit,
      label: unitName(g.unit),
      count: g.count,
      foodPerHour: stackUpkeepPerHour(g, catalogue.byType),
    })),
);

// Guest (Support) armies stationed here eat the host's food, so they count toward the Upkeep line.
const guestCount = computed(() => world.guestArmies.length);

const upkeepPerHour = computed(
  () =>
    stacksUpkeepPerHour(world.hud.garrison, catalogue.byType)
    + world.guestArmies.reduce((sum, g) => sum + stacksUpkeepPerHour(g.stacks, catalogue.byType), 0),
);

const starving = computed(() => world.hud.rates.food < 0);
const runsOutIn = computed(() => {
  void world.hud.tick; // refresh with the HUD tick
  const seconds = foodRunsOutInSeconds(world.hud.resources.food, world.hud.rates.food);
  return seconds === null ? null : formatCountdownShort(seconds);
});

const ratesShown = ref(false);
</script>

<template>
  <div class="garrison-list" :class="{ 'is-rates-shown': ratesShown }">
    <div v-if="garrison.length" class="garrison-grid">
      <GarrisonUnitRow v-for="g in garrison" :key="g.key" :label="g.label" :count="g.count" :food-per-hour="g.foodPerHour" />
    </div>
    <div v-else class="status-subtext garrison-empty">{{ t('hud.trainingQueue.garrisonEmpty') }}</div>

    <div v-if="guestCount" class="guests">
      <div class="status-card-header">
        <span class="status-card-title">{{ t('hud.trainingQueue.guests') }}</span>
        <span class="status-card-count">{{ guestCount }}</span>
      </div>
      <GuestList />
    </div>

    <template v-if="garrison.length || guestCount">
      <button
        type="button"
        class="upkeep-sum"
        :class="{ 'is-starving': starving }"
        :aria-pressed="ratesShown"
        data-testid="garrison-upkeep"
        @click="ratesShown = !ratesShown"
      >
        <span class="upkeep-label">{{ t('hud.trainingQueue.upkeep') }}</span>
        <span class="upkeep-value">{{ t('hud.trainingQueue.upkeepPerHour', { amount: n(upkeepPerHour, 'integer') }) }}</span>
      </button>
      <div v-if="starving && runsOutIn" class="upkeep-note upkeep-runs-out" data-testid="garrison-runs-out">
        {{ t('hud.trainingQueue.foodRunsOut', { time: runsOutIn }) }}
      </div>
      <div class="upkeep-note upkeep-hint">{{ ratesShown ? t('hud.trainingQueue.hideRates') : t('hud.trainingQueue.showRates') }}</div>
    </template>
  </div>
</template>

<style scoped>
.garrison-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.garrison-empty {
  margin-top: 0;
}
.status-subtext {
  margin-top: 4px;
  font-size: 11px;
  color: var(--muted);
}
.guests {
  margin-top: 12px;
}
.upkeep-sum {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  width: 100%;
  margin-top: 10px;
  padding: 8px 0 0;
  background: transparent;
  border: none;
  border-top: 1px solid var(--panel-border);
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}
.upkeep-label {
  color: var(--muted);
}
.upkeep-value {
  font-weight: 600;
  color: var(--food);
}
.upkeep-sum.is-starving .upkeep-value {
  color: #e05a5a;
}
.upkeep-sum:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
.upkeep-note {
  margin-top: 4px;
  font-size: 11px;
  color: var(--muted);
}
.upkeep-runs-out {
  color: #e05a5a;
  text-align: right;
}
/* The tap hint only makes sense where there is no hover to reveal the column. */
.upkeep-hint {
  display: none;
}
@media (hover: none) {
  .upkeep-hint {
    display: block;
  }
}
</style>
