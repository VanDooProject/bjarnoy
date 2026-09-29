<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import EconomyChart, { type EconomySeries } from '../../components/admin/EconomyChart.vue';
import { buildingName } from '../../i18n/catalogueNames';
import type { MessageSchema } from '../../i18n/schema';
import { curvesFor } from '../../lib/economy/curves';
import {
  DEFAULT_PRODUCER_COUNTS,
  FOUNDING_STOCK,
  RESOURCES,
  settlerCostFrom,
  simulatePacing,
  type PacingResult,
  type Profile,
} from '../../lib/economy/pacingSim';
import { unlockLadder } from '../../lib/economy/unlocks';
import { useBuildingCatalogueStore } from '../../stores/buildingCatalogue';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const catalogue = useBuildingCatalogueStore();
const units = useUnitCatalogueStore();

const PALETTE = ['#ffc55c', '#5cb8ff', '#7bd88f', '#ff7a7a', '#c39bff', '#ff9f5c', '#5ce1d6', '#e6e07a', '#ff8fc7', '#a3b1c2'];
const DEFAULT_TYPES = ['longhouse', 'lumberjack', 'quarry', 'farm', 'storagehouse', 'barracks'];

onMounted(() => {
  void catalogue.load();
  void units.load();
});

const byType = computed(() => catalogue.byType);
const ready = computed(() => catalogue.definitions.length > 0);

// --- Section 1: curves ---------------------------------------------------

const selectedTypes = ref<string[]>([]);
// Golden-angle hues: every catalogue type gets its own stable, well-spread colour.
const typeColor = (type: string) => `hsl(${Math.round((Math.max(0, catalogue.types.indexOf(type)) * 137.508) % 360)} 70% 62%)`;

watch(
  ready,
  (isReady) => {
    if (isReady && selectedTypes.value.length === 0) {
      selectedTypes.value = DEFAULT_TYPES.filter((type) => byType.value[type]);
    }
  },
  { immediate: true },
);

const curves = computed(() =>
  catalogue.types
    .filter((type) => selectedTypes.value.includes(type))
    .map((type) => ({ type, points: curvesFor(byType.value[type]) })),
);

function curveSeries(pick: (p: ReturnType<typeof curvesFor>[number]) => number | null, dropZero: boolean): EconomySeries[] {
  return curves.value.map(({ type, points }) => ({
    label: buildingName(type),
    color: typeColor(type),
    points: points.map((p) => {
      const y = pick(p);
      return { x: p.level, y: dropZero && y !== null && y <= 0 ? null : y };
    }),
  }));
}
const costSeries = computed(() => curveSeries((p) => p.totalCost, true));
const timeSeries = computed(() => curveSeries((p) => p.buildMinutes, true));
const productionSeries = computed(() => curveSeries((p) => p.productionPerHour, false));
const paybackSeries = computed(() => curveSeries((p) => p.paybackHours, false));

// --- Section 2: unlock ladder --------------------------------------------

const ladder = computed(() => unlockLadder(byType.value));
const unlockSeries = computed<EconomySeries[]>(() => [
  {
    label: t('adminEconomy.unlocks.count'),
    color: PALETTE[0],
    points: ladder.value.map((l) => ({ x: l.level, y: l.unlocks.length })),
  },
]);

// --- Section 3: pacing ---------------------------------------------------

const producerTypes = computed(() =>
  catalogue.types.filter((type) => {
    if (type === 'longhouse') return false;
    const first = byType.value[type]?.find((d) => d.level === 1);
    if (!first) return false;
    const p = first.productionPerHour;
    return p.wood + p.stone + p.food + p.iron > 0;
  }),
);

const startStock = reactive({ ...FOUNDING_STOCK });
const producerCounts = reactive<Record<string, number>>({ ...DEFAULT_PRODUCER_COUNTS });
const horizonDays = ref(60);
// Every producer type gets an explicit count so its input never renders blank.
watch(
  producerTypes,
  (types) => {
    for (const type of types) producerCounts[type] ??= 0;
  },
  { immediate: true },
);
const settlerCost = computed(() => settlerCostFrom(units.byType['settlercrew']?.trainingCost));

const results = ref<Record<Profile, PacingResult> | null>(null);
const running = ref(false);

function run() {
  running.value = true;
  const base = {
    startStock: { ...startStock },
    horizonDays: Math.max(1, Number(horizonDays.value) || 1),
    producerCounts: { ...producerCounts },
    settlerCost: settlerCost.value,
    settleType: 'cartworkshop',
  };
  results.value = {
    always: simulatePacing(byType.value, { ...base, profile: 'always' }),
    casual: simulatePacing(byType.value, { ...base, profile: 'casual' }),
  };
  running.value = false;
}

// One initial run when the catalogue arrives; afterwards only the button runs it.
const ranOnce = ref(false);
watch(
  ready,
  (isReady) => {
    if (isReady && !ranOnce.value) {
      ranOnce.value = true;
      run();
    }
  },
  { immediate: true },
);

const pacingSeries = computed<EconomySeries[]>(() => {
  if (!results.value) return [];
  return (['always', 'casual'] as const).map((profile, i) => {
    const s = results.value![profile].series;
    return {
      label: t(profile === 'always' ? 'adminEconomy.pacing.profileAlways' : 'adminEconomy.pacing.profileCasual'),
      color: PALETTE[i],
      points: s.minute.map((m, k) => ({ x: m / 1440, y: s.lh[k] })),
    };
  });
});

const lhLevels = computed(() => ladder.value.map((l) => l.level));

/** Minutes as `Xd HH:MM`. */
function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.floor(minutes % 60);
  return `${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function costText(line: { wood: number; stone: number; food: number; iron: number }): string {
  return RESOURCES.map((r) => `${Math.round(line[r])} ${t(`adminEconomy.resources.${r}`)}`).join(' · ');
}
</script>

<template>
  <section class="economy">
    <h1>{{ $t('adminEconomy.title') }}</h1>
    <p class="hint">{{ $t('adminEconomy.intro') }}</p>
    <p v-if="catalogue.source" class="source" data-testid="economy-source">
      <template v-if="catalogue.source === 'live'">{{ $t('adminEconomy.source.live') }}</template>
      <template v-else>{{ $t('adminEconomy.source.fallback', { generatedAt: catalogue.generatedAt ?? '—' }) }}</template>
    </p>
    <p v-if="!ready" class="muted">{{ $t('adminEconomy.loading') }}</p>

    <template v-else>
      <!-- Curves -->
      <div class="panel-section">
        <h2>{{ $t('adminEconomy.curves.title') }}</h2>
        <fieldset class="type-picker">
          <legend>{{ $t('adminEconomy.curves.pick') }}</legend>
          <label v-for="type in catalogue.types" :key="type" class="type-chip" :class="{ on: selectedTypes.includes(type) }">
            <input v-model="selectedTypes" type="checkbox" :value="type" />
            <span class="swatch" :style="{ background: typeColor(type) }" />
            {{ buildingName(type) }}
          </label>
        </fieldset>
        <p v-if="selectedTypes.length === 0" class="muted">{{ $t('adminEconomy.curves.empty') }}</p>
        <div v-else class="chart-grid">
          <div class="chart-card">
            <h3>{{ $t('adminEconomy.curves.totalCost') }}</h3>
            <EconomyChart :series="costSeries" log-y integer-x :x-title="$t('adminEconomy.curves.level')" :y-title="$t('adminEconomy.curves.cost')" />
          </div>
          <div class="chart-card">
            <h3>{{ $t('adminEconomy.curves.buildTime') }}</h3>
            <EconomyChart :series="timeSeries" log-y integer-x :x-title="$t('adminEconomy.curves.level')" :y-title="$t('adminEconomy.curves.minutes')" />
          </div>
          <div class="chart-card">
            <h3>{{ $t('adminEconomy.curves.production') }}</h3>
            <EconomyChart :series="productionSeries" integer-x :x-title="$t('adminEconomy.curves.level')" :y-title="$t('adminEconomy.curves.perHour')" />
          </div>
          <div class="chart-card">
            <h3>{{ $t('adminEconomy.curves.payback') }}</h3>
            <EconomyChart :series="paybackSeries" integer-x :x-title="$t('adminEconomy.curves.level')" :y-title="$t('adminEconomy.curves.hours')" />
          </div>
        </div>
      </div>

      <!-- Unlock ladder -->
      <div class="panel-section">
        <h2>{{ $t('adminEconomy.unlocks.title') }}</h2>
        <p class="hint">{{ $t('adminEconomy.unlocks.hint') }}</p>
        <div class="chart-card">
          <h3>{{ $t('adminEconomy.unlocks.chartTitle') }}</h3>
          <EconomyChart
            kind="bar"
            :series="unlockSeries"
            :legend="false"
            :x-title="$t('adminEconomy.unlocks.lhLevel')"
            :y-title="$t('adminEconomy.unlocks.count')"
          />
        </div>
        <ul class="ladder">
          <li
            v-for="row in ladder"
            :key="row.level"
            class="ladder-row"
            :class="{ bulk: row.bulk, gap: row.gap }"
            :data-testid="`ladder-${row.level}`"
          >
            <span class="ladder-level">{{ $t('adminEconomy.unlocks.levelRow', { level: row.level }) }}</span>
            <span class="ladder-items">
              <span v-if="row.unlocks.length === 0" class="muted">{{ $t('adminEconomy.unlocks.none') }}</span>
              <span v-for="u in row.unlocks" :key="u.type" class="unlock">
                <strong>{{ buildingName(u.type) }}</strong>
                <span v-for="p in u.prerequisites" :key="p.type" class="chip">
                  {{ $t('adminEconomy.prereqChip', { building: buildingName(p.type), level: p.level }) }}
                </span>
              </span>
            </span>
            <span v-if="row.bulk" class="flag bulk-flag">{{ $t('adminEconomy.unlocks.bulk') }}</span>
            <span v-if="row.gap" class="flag gap-flag">{{ $t('adminEconomy.unlocks.gap') }}</span>
          </li>
        </ul>
      </div>

      <!-- Pacing -->
      <div class="panel-section">
        <h2>{{ $t('adminEconomy.pacing.title') }}</h2>
        <p class="hint">{{ $t('adminEconomy.pacing.hint') }}</p>
        <form class="inputs" @submit.prevent="run">
          <fieldset>
            <legend>{{ $t('adminEconomy.pacing.startStock') }}</legend>
            <label v-for="r in RESOURCES" :key="r">
              {{ $t(`adminEconomy.resources.${r}`) }}
              <input v-model.number="startStock[r]" type="number" min="0" step="50" />
            </label>
          </fieldset>
          <fieldset>
            <legend>{{ $t('adminEconomy.pacing.producers') }}</legend>
            <label v-for="type in producerTypes" :key="type">
              {{ buildingName(type) }}
              <input v-model.number="producerCounts[type]" type="number" min="0" max="20" step="1" :data-testid="`producers-${type}`" />
            </label>
          </fieldset>
          <fieldset>
            <legend>{{ $t('adminEconomy.pacing.settings') }}</legend>
            <label>
              {{ $t('adminEconomy.pacing.horizon') }}
              <input v-model.number="horizonDays" type="number" min="1" max="365" step="1" />
            </label>
            <p class="muted small">{{ $t('adminEconomy.pacing.settlerCost') }}: {{ costText(settlerCost) }}</p>
          </fieldset>
          <button type="submit" class="run" :disabled="running" data-testid="economy-run">
            {{ running ? $t('adminEconomy.pacing.running') : $t('adminEconomy.pacing.run') }}
          </button>
        </form>

        <p v-if="!results" class="muted">{{ $t('adminEconomy.pacing.noRun') }}</p>
        <template v-else>
          <div class="chart-card">
            <h3>{{ $t('adminEconomy.pacing.chartTitle') }}</h3>
            <EconomyChart
              :series="pacingSeries"
              stepped
              :x-title="$t('adminEconomy.pacing.days')"
              :y-title="$t('adminEconomy.pacing.lhLevel')"
            />
          </div>
          <div class="tables">
            <div>
              <h3>{{ $t('adminEconomy.pacing.milestones') }}</h3>
              <table class="table" data-testid="milestones">
                <thead>
                  <tr>
                    <th>{{ $t('adminEconomy.pacing.colLevel') }}</th>
                    <th>{{ $t('adminEconomy.pacing.profileAlways') }}</th>
                    <th>{{ $t('adminEconomy.pacing.profileCasual') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="level in lhLevels" :key="level">
                    <td>{{ level }}</td>
                    <td>{{ results.always.lhReachedAt[level] === undefined ? $t('adminEconomy.pacing.notReached') : formatDuration(results.always.lhReachedAt[level]) }}</td>
                    <td>{{ results.casual.lhReachedAt[level] === undefined ? $t('adminEconomy.pacing.notReached') : formatDuration(results.casual.lhReachedAt[level]) }}</td>
                  </tr>
                  <tr class="settlers-row">
                    <td>{{ $t('adminEconomy.pacing.settlers') }}</td>
                    <td data-testid="settlers-always">{{ results.always.settlersReadyAt === null ? $t('adminEconomy.pacing.settlersNever') : formatDuration(results.always.settlersReadyAt) }}</td>
                    <td data-testid="settlers-casual">{{ results.casual.settlersReadyAt === null ? $t('adminEconomy.pacing.settlersNever') : formatDuration(results.casual.settlersReadyAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>
    </template>
  </section>
</template>

<style scoped>
.economy h1 {
  margin: 0 0 8px;
}
.economy h2 {
  margin: 0 0 12px;
  font-size: 16px;
}
.economy h3 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--muted);
  max-width: 90ch;
}
.source {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--muted);
}
.muted {
  color: var(--muted);
}
.small {
  font-size: 12px;
}
.panel-section {
  margin-bottom: 36px;
}
.chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 460px), 1fr));
  gap: 16px;
}
.chart-card {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
  min-width: 0;
}
.type-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border: none;
  padding: 0;
  margin: 0 0 16px;
}
.type-picker legend {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 6px;
  padding: 0;
}
.type-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  font-size: 13px;
  color: var(--muted);
  cursor: pointer;
}
.type-chip.on {
  color: var(--text);
  background: var(--panel-bg);
  border-color: var(--gold);
}
.type-chip input {
  display: none;
}
.swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.ladder {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ladder-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 8px 12px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  font-size: 14px;
}
.ladder-row.bulk {
  border-color: var(--gold);
  background: rgba(255, 197, 92, 0.1);
}
.ladder-row.gap {
  border-style: dashed;
  background: rgba(163, 177, 194, 0.08);
}
.ladder-level {
  min-width: 110px;
  color: var(--muted);
}
.ladder-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  flex: 1;
}
.unlock {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.chip {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  color: var(--muted);
}
.flag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 600;
}
.bulk-flag {
  background: var(--gold);
  color: #1a1208;
}
.gap-flag {
  border: 1px solid var(--panel-border);
  color: var(--muted);
}
.inputs {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}
.inputs fieldset {
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 12px 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  max-width: 100%;
}
.inputs legend {
  font-size: 13px;
  color: var(--muted);
  padding: 0 4px;
}
.inputs label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.inputs input {
  width: 84px;
}
.table {
  width: 100%;
  max-width: 640px;
  border-collapse: collapse;
}
.table th,
.table td {
  text-align: left;
  padding: 6px 12px;
  border-bottom: 1px solid var(--panel-border);
  font-size: 14px;
}
.settlers-row td {
  font-weight: 600;
}
input {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--text);
}
.run {
  align-self: flex-end;
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-weight: 600;
  cursor: pointer;
}
.run:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
