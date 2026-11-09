<script setup lang="ts">
// The Pacing bench: the Economy lab's what-if catalogue (`applyWhatIf`) run through the pacing
// simulator (`simulatePacing`) in a Web Worker for the four fixed player profiles, next to a pinned
// reference. All knob and simulator logic lives in lib/economy; this view is inputs, tables and charts.
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import EconomyChart, { type EconomySeries } from '../../components/admin/EconomyChart.vue';
import { buildingName } from '../../i18n/catalogueNames';
import type { MessageSchema } from '../../i18n/schema';
import {
  BENCH_LH_COST_LEVELS,
  BENCH_LH_MILESTONES,
  BENCH_OUTPUT_TYPES,
  BENCH_PROFILES,
  BENCH_SAMPLE_HOURS,
  BENCH_START_TYPES,
  benchDefaults,
  type BenchKnobs,
  type BenchProfile,
  type BenchProfileResult,
  type BenchResult,
} from '../../lib/economy/pacingBench';
import { BUILD_TIME_CURVE_GROUPS, buildMinutes } from '../../lib/economy/buildTimes';
import { createBenchRunner } from '../../lib/economy/pacingBenchRunner';
import { FEAST_COST_BASE, FEAST_COST_GROWTH, FEAST_HOURS, FEAST_RENOWN_BASE, FEAST_RENOWN_GROWTH } from '../../lib/economy/feasts';
import { DEFAULT_JOIN_TIME, FOUNDING_STOCK, PROFILE_PRESETS, parseClock } from '../../lib/economy/pacingSim';
import { useBuildingCatalogueStore } from '../../stores/buildingCatalogue';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const catalogue = useBuildingCatalogueStore();
onMounted(() => void catalogue.load());

const ready = computed(() => catalogue.definitions.length > 0);
// The live catalogue as plain data (the store's state is reactive; a worker message needs a structured-cloneable value).
const live = computed(() => JSON.parse(JSON.stringify(catalogue.byType)) as typeof catalogue.byType);

// --- knobs -----------------------------------------------------------------

const STORE_KEY = 'bjarnoy-pacing-bench-v2';
interface Reference {
  knobs: BenchKnobs;
  result: BenchResult;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const defaults = computed(() => benchDefaults(live.value));
const knobs = reactive<BenchKnobs>(benchDefaults({}));
const reference = ref<Reference | null>(null);

interface Field {
  id: string;
  label: string;
  hint?: string;
  min: number;
  max?: number;
  step: number;
  get: (k: BenchKnobs) => number;
  set: (k: BenchKnobs, v: number) => void;
}
interface Group {
  id: 'producers' | 'output' | 'producerCost' | 'longhouse' | 'buildTimes' | 'storage' | 'run';
  fields: Field[];
}

const direct = (id: keyof BenchKnobs & string, min: number, max: number | undefined, step: number): Field => ({
  id,
  label: `fields.${id}`,
  min,
  max,
  step,
  get: (k) => k[id] as number,
  set: (k, v) => ((k as unknown as Record<string, number>)[id] = v),
});
const early = (i: 0 | 1 | 2): Field => ({
  id: `early${i + 1}`,
  label: `fields.early${i + 1}`,
  min: 0.1,
  max: 2,
  step: 0.05,
  get: (k) => k.producerEarlyDiscount[i],
  set: (k, v) => (k.producerEarlyDiscount[i] = v),
});
const GROUPS: Group[] = [
  {
    id: 'producers',
    fields: [
      { ...direct('producersPerTower', 0, 5, 1), hint: 'fields.producersPerTowerHint' },
      ...BENCH_START_TYPES.map(
        (type): Field => ({
          id: `start_${type}`,
          label: `fields.start_${type}`,
          hint: ['farm', 'fishinghut', 'bogoreworks'].includes(type) ? `fields.start_${type}Hint` : undefined,
          min: 0,
          max: 12,
          step: 1,
          get: (k) => k.startCounts[type] ?? 0,
          set: (k, v) => (k.startCounts[type] = v),
        }),
      ),
      direct('producersAhead', 0, 25, 1),
    ],
  },
  {
    id: 'output',
    fields: [
      ...BENCH_OUTPUT_TYPES.map(
        (type): Field => ({
          id: `out_${type}`,
          label: `fields.out_${type}`,
          min: 0,
          step: 1,
          get: (k) => k.levelOneOutput[type] ?? 0,
          set: (k, v) => (k.levelOneOutput[type] = v),
        }),
      ),
      { ...direct('productionGrowth', 1.01, 2, 0.01), hint: 'fields.productionGrowthHint' },
    ],
  },
  { id: 'producerCost', fields: [{ ...direct('costGrowth', 1.01, 2, 0.01), hint: 'fields.costGrowthHint' }, early(0), early(1), early(2)] },
  {
    id: 'longhouse',
    fields: [direct('longhouseCostGrowth', 1.01, 2, 0.01), direct('longhouseBreakLevel', 1, 30, 1), direct('longhouseLateCostGrowth', 1.01, 2.5, 0.01)],
  },
  {
    id: 'buildTimes',
    fields: [
      direct('lhKnee', 4, 29, 1),
      direct('lhShape', -5, 10, 0.5),
      direct('lhTopHours', 1, 100, 1),
      direct('prodKnee', 4, 24, 1),
      direct('prodShape', -5, 10, 0.5),
      direct('topHerderLumber', 1, 100, 1),
      direct('topProducers', 1, 100, 1),
      direct('topBogOre', 1, 100, 1),
      direct('shKnee', 4, 24, 1),
      direct('shShape', -5, 10, 0.5),
      direct('shTopHours', 1, 100, 1),
      { ...direct('techShape', -5, 10, 0.5), hint: 'fields.techShapeHint' },
      direct('gsTopHours', 1, 100, 1),
      { ...direct('timeScale', 0.05, 10, 0.05), hint: 'fields.timeScaleHint' },
    ],
  },
  {
    id: 'storage',
    fields: [
      direct('storageHouseCapacity', 10, undefined, 10),
      direct('storageHouseCapacityGrowth', 1.01, 2, 0.01),
      direct('storageHouseCostGrowth', 1.01, 2, 0.01),
      direct('greatStorehouseCapacity', 100, undefined, 1000),
      direct('greatStorehouseCapacityGrowth', 1.01, 3, 0.01),
      direct('greatStorehouseCostGrowth', 1.01, 3, 0.01),
    ],
  },
  { id: 'run', fields: [direct('renownThreshold', 1000, undefined, 5000), direct('horizonDays', 10, 365, 10)] },
];
const ALL_FIELDS = GROUPS.flatMap((g) => g.fields);

const isChanged = (f: Field): boolean => f.get(knobs) !== f.get(defaults.value);

/** A cleared or half-typed input reads as the live value instead of reaching the simulator as NaN or 0. */
function runnable(): BenchKnobs {
  const k = clone(knobs);
  for (const f of ALL_FIELDS) if (!Number.isFinite(f.get(k))) f.set(k, f.get(defaults.value));
  k.horizonDays = Math.min(365, Math.max(1, Math.round(k.horizonDays)));
  return k;
}

// --- running ---------------------------------------------------------------

const runner = createBenchRunner();
const latest = ref<BenchResult | null>(null);
/** Horizon of the run shown (the knob may already have moved on). */
const latestDays = ref(0);
const status = ref(t('adminPacingBench.status.starting'));
const busy = ref(false);
let runId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ knobs, reference: reference.value }));
  } catch {
    /* storage unavailable: the bench works without remembering */
  }
}

async function runNow() {
  const id = ++runId;
  const k = runnable();
  busy.value = true;
  status.value = t('adminPacingBench.status.running');
  try {
    const run = await runner.run(live.value, k);
    if (id !== runId) return;
    latest.value = run.result;
    latestDays.value = k.horizonDays;
    reference.value ??= { knobs: k, result: run.result };
    status.value = t('adminPacingBench.status.done', { days: k.horizonDays, profiles: BENCH_PROFILES.length, ms: run.ms });
    saveState();
  } catch (e) {
    if (id === runId) status.value = t('adminPacingBench.status.error', { message: e instanceof Error ? e.message : String(e) });
  } finally {
    if (id === runId) busy.value = false;
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => void runNow(), 250);
}

// Once the catalogue is there: start from the live values (or the remembered settings), then run.
watch(
  ready,
  (isReady) => {
    if (!isReady) return;
    const base = defaults.value;
    Object.assign(knobs, clone(base));
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as { knobs?: Partial<BenchKnobs>; reference?: Reference } | null;
      if (saved?.knobs) {
        Object.assign(knobs, saved.knobs, {
          startCounts: { ...base.startCounts, ...saved.knobs.startCounts },
          levelOneOutput: { ...base.levelOneOutput, ...saved.knobs.levelOneOutput },
          foundingStock: { ...base.foundingStock, ...saved.knobs.foundingStock },
          producerEarlyDiscount: saved.knobs.producerEarlyDiscount ?? base.producerEarlyDiscount,
        });
        reference.value = saved.reference ?? null;
      }
    } catch {
      /* unreadable or unavailable storage: start from the live values */
    }
    void runNow();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearTimeout(timer);
  runId++;
  runner.dispose();
});

function onInput(f: Field, e: Event) {
  const v = (e.target as HTMLInputElement).valueAsNumber;
  if (!Number.isFinite(v)) return;
  f.set(knobs, v);
  schedule();
}

function pin() {
  if (!latest.value) return;
  reference.value = { knobs: runnable(), result: latest.value };
  saveState();
  status.value = t('adminPacingBench.status.pinned');
}

function reset() {
  Object.assign(knobs, clone(defaults.value));
  schedule();
}

const copyField = ref<HTMLTextAreaElement | null>(null);
async function copy() {
  const text = JSON.stringify(runnable(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    status.value = t('adminPacingBench.status.copied');
  } catch {
    // No clipboard permission (insecure context, an embedded frame): select the text in a field to copy by hand.
    const ta = copyField.value;
    if (!ta) return;
    ta.value = text;
    ta.hidden = false;
    ta.select();
    let done = false;
    try {
      done = document.execCommand('copy');
    } catch {
      done = false;
    }
    status.value = t(done ? 'adminPacingBench.status.copied' : 'adminPacingBench.status.copyBlocked');
  }
}

// --- milestone table ---------------------------------------------------------

const PROFILE_COLOR: Record<BenchProfile['id'], string> = {
  activeFeasts: '#5cb8ff',
  active: '#ff9f5c',
  checkins4: '#7bd88f',
  checkins2: '#c39bff',
};

type MilestoneKey = 'settle' | number;
const MILESTONES: MilestoneKey[] = ['settle', ...BENCH_LH_MILESTONES];

/** Day a milestone is reached, or null. */
function dayOf(r: BenchProfileResult, key: MilestoneKey): number | null {
  const minute = key === 'settle' ? r.secondSettlementAt : (r.lhReachedAt[key] ?? null);
  return minute === null ? null : minute / 1440;
}
const fmtDay = (d: number): string => d.toFixed(d < 100 ? 1 : 0);

interface Cell {
  text: string;
  delta: string | null;
  tone: 'later' | 'sooner' | null;
  testId: string;
}
function cellFor(p: BenchProfile, key: MilestoneKey): Cell {
  const now = latest.value?.profiles.find((r) => r.id === p.id);
  const ref = reference.value?.result.profiles.find((r) => r.id === p.id);
  const v = now ? dayOf(now, key) : null;
  const rv = ref ? dayOf(ref, key) : null;
  const cell: Cell = {
    text: v === null ? t('adminPacingBench.milestones.notReached') : t('adminPacingBench.milestones.dayValue', { day: fmtDay(v) }),
    delta: null,
    tone: null,
    testId: `bench-${p.id}-${key}`,
  };
  if (v !== null && rv !== null) {
    const d = v - rv;
    if (Math.abs(d) >= 0.05) {
      cell.delta = `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`;
      cell.tone = d > 0 ? 'later' : 'sooner';
    }
  } else if (v === null && rv !== null) {
    cell.delta = t('adminPacingBench.milestones.was', { day: fmtDay(rv) });
    cell.tone = 'later';
  } else if (v !== null && rv === null && ref) {
    cell.delta = t('adminPacingBench.milestones.new');
    cell.tone = 'sooner';
  }
  return cell;
}
const rows = computed(() => (latest.value ? BENCH_PROFILES.map((p) => ({ p, cells: MILESTONES.map((m) => cellFor(p, m)) })) : []));

// --- charts ----------------------------------------------------------------

function chartSeries(pick: (r: BenchProfileResult) => number[]): EconomySeries[] {
  if (!latest.value) return [];
  const points = (r: BenchProfileResult) => pick(r).map((y, i) => ({ x: (i * BENCH_SAMPLE_HOURS) / 24, y }));
  const solid = BENCH_PROFILES.map((p) => ({
    label: p.label,
    color: PROFILE_COLOR[p.id],
    points: points(latest.value!.profiles.find((r) => r.id === p.id)!),
  }));
  const dashed = reference.value
    ? BENCH_PROFILES.map((p) => ({
        label: t('adminPacingBench.charts.reference', { name: p.label }),
        color: PROFILE_COLOR[p.id],
        dashed: true,
        points: points(reference.value!.result.profiles.find((r) => r.id === p.id)!),
      }))
    : [];
  return [...solid, ...dashed];
}
const lhSeries = computed(() => chartSeries((r) => r.lh));
const prodSeries = computed(() => chartSeries((r) => r.prod));

// --- Build time per level ------------------------------------------------------

const CURVE_COLOR = ['#5cb8ff', '#ff9f5c', '#7bd88f', '#c39bff', '#ff7a7a', '#f2d24b', '#4fd1c5', '#e879c0'];
const logTimes = ref(false);
/** One curve per group, in hours, from the knobs as typed (the same `buildMinutes` the what-if catalogue uses). */
const timeSeries = computed<EconomySeries[]>(() => {
  const k = runnable();
  return BUILD_TIME_CURVE_GROUPS.map((g, i) => ({
    label: g.label,
    color: CURVE_COLOR[i % CURVE_COLOR.length],
    points: Array.from({ length: g.max }, (_, n) => ({ x: n + 1, y: (buildMinutes(g.type, n + 1, g.max, k) * k.timeScale) / 60 })),
  }));
});

// --- Longhouse wood cost -------------------------------------------------------

const shortNumber = (v: number): string =>
  v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)} M` : v >= 1e4 ? `${Math.round(v / 1000)}k` : v.toLocaleString('en-US');
const costCells = computed(() =>
  latest.value
    ? BENCH_LH_COST_LEVELS.map((level) => {
        const v = latest.value!.lhWoodCost[level - 1];
        const r = reference.value?.result.lhWoodCost[level - 1];
        return { level, value: shortNumber(v), ref: r !== undefined && r !== v ? shortNumber(r) : null };
      })
    : [],
);

// --- "What the profiles mean": numbers come from the code the simulator uses ---------

const clock = (minute: number): string => {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const listTimes = (xs: string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const fmtInt = (v: number): string => v.toLocaleString('en-US');
const how = computed(() => {
  const active = PROFILE_PRESETS.active[0];
  const from = parseClock(active.start);
  const cart = catalogue.byType['cartworkshop']?.[0]?.prerequisites ?? [];
  return {
    from: clock(from),
    to: clock(from + active.minutes),
    offlineHours: (1440 - active.minutes) / 60,
    checkins4: listTimes(PROFILE_PRESETS.checkins4.map((s) => s.start)),
    checkins2: listTimes(PROFILE_PRESETS.checkins2.map((s) => s.start)),
    minutes: PROFILE_PRESETS.checkins4[0].minutes,
    cost: fmtInt(FEAST_COST_BASE),
    costGrowth: FEAST_COST_GROWTH,
    hours: FEAST_HOURS,
    renown: fmtInt(FEAST_RENOWN_BASE),
    renownGrowth: FEAST_RENOWN_GROWTH,
    prerequisite: cart.length > 0 ? cart.map((p) => `behind ${buildingName(p.type)} ${p.level}`).join(', ') : 'behind its prerequisites',
    time: DEFAULT_JOIN_TIME,
    wood: FOUNDING_STOCK.wood,
    stone: FOUNDING_STOCK.stone,
    food: FOUNDING_STOCK.food,
  };
});
</script>

<template>
  <section class="bench">
    <header class="top">
      <div>
        <h1>{{ $t('adminPacingBench.title') }}</h1>
        <p class="hint">{{ $t('adminPacingBench.intro') }}</p>
      </div>
      <p class="status" :class="{ busy }" role="status" data-testid="bench-status">{{ status }}</p>
    </header>

    <p v-if="!ready" class="muted">{{ $t('adminPacingBench.loading') }}</p>

    <div v-else class="layout">
      <form class="knobs" :aria-label="$t('adminPacingBench.knobsLabel')" data-testid="bench-knobs" @submit.prevent>
        <fieldset v-for="g in GROUPS" :key="g.id">
          <legend>{{ $t(`adminPacingBench.groups.${g.id}`) }}</legend>
          <template v-for="f in g.fields" :key="f.id">
            <label :for="`bench-${f.id}`">
              {{ $t(`adminPacingBench.${f.label}`) }}
              <small v-if="f.hint">{{ $t(`adminPacingBench.${f.hint}`) }}</small>
            </label>
            <input
              :id="`bench-${f.id}`"
              type="number"
              :min="f.min"
              :max="f.max"
              :step="f.step"
              :value="f.get(knobs)"
              :class="{ changed: isChanged(f) }"
              :data-testid="`bench-${f.id}`"
              @input="onInput(f, $event)"
            />
          </template>
        </fieldset>
        <div class="btns">
          <button type="button" class="run" data-testid="bench-pin" :disabled="!latest" @click="pin">{{ $t('adminPacingBench.pin') }}</button>
          <button type="button" class="secondary" data-testid="bench-reset" @click="reset">{{ $t('adminPacingBench.reset') }}</button>
          <button type="button" class="secondary" data-testid="bench-copy" @click="copy">{{ $t('adminPacingBench.copy') }}</button>
        </div>
        <textarea ref="copyField" class="copyout" hidden readonly rows="4" aria-label="settings JSON"></textarea>
      </form>

      <div class="results">
        <section class="card">
          <h2>{{ $t('adminPacingBench.milestones.title') }}</h2>
          <p class="note">{{ $t('adminPacingBench.milestones.note') }}</p>
          <div class="table-scroll">
            <table class="table" data-testid="bench-milestones">
              <thead>
                <tr>
                  <th>{{ $t('adminPacingBench.milestones.profile') }}</th>
                  <th v-for="m in MILESTONES" :key="m">
                    {{ m === 'settle' ? $t('adminPacingBench.milestones.settle') : $t('adminPacingBench.milestones.level', { level: m }) }}
                  </th>
                  <th>{{ $t('adminPacingBench.milestones.target') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.p.id">
                  <th scope="row"><span class="swatch" :style="{ background: PROFILE_COLOR[row.p.id] }" />{{ row.p.label }}</th>
                  <td v-for="(c, i) in row.cells" :key="i" :data-testid="c.testId">
                    <span class="v" :class="{ never: c.text === $t('adminPacingBench.milestones.notReached') }">{{ c.text }}</span>
                    <span v-if="c.delta" class="d" :class="c.tone" :data-testid="`${c.testId}-delta`">{{ c.delta }}</span>
                  </td>
                  <td class="target">{{ row.p.secondSettlementTarget ?? '–' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="card how">
          <h2>{{ $t('adminPacingBench.how.title') }}</h2>
          <dl>
            <dt><span class="swatch" :style="{ background: PROFILE_COLOR.activeFeasts }" /><span class="swatch" :style="{ background: PROFILE_COLOR.active }" />{{ $t('adminPacingBench.how.activeTerm') }}</dt>
            <dd>{{ $t('adminPacingBench.how.active', { from: how.from, to: how.to, offlineHours: how.offlineHours }) }}</dd>
            <dt><span class="swatch" :style="{ background: PROFILE_COLOR.checkins4 }" />{{ $t('adminPacingBench.how.checkins4Term') }}</dt>
            <dd>{{ $t('adminPacingBench.how.checkins4', { times: how.checkins4, minutes: how.minutes }) }}</dd>
            <dt><span class="swatch" :style="{ background: PROFILE_COLOR.checkins2 }" />{{ $t('adminPacingBench.how.checkins2Term') }}</dt>
            <dd>{{ $t('adminPacingBench.how.checkins2', { times: how.checkins2, minutes: how.minutes }) }}</dd>
            <dt>{{ $t('adminPacingBench.how.feastsTerm') }}</dt>
            <dd data-testid="bench-how-feasts">
              {{
                $t('adminPacingBench.how.feasts', {
                  cost: how.cost,
                  costGrowth: how.costGrowth,
                  hours: how.hours,
                  renown: how.renown,
                  renownGrowth: how.renownGrowth,
                })
              }}
            </dd>
            <dt>{{ $t('adminPacingBench.how.renownTerm') }}</dt>
            <dd>{{ $t('adminPacingBench.how.renown', { prerequisite: how.prerequisite }) }}</dd>
            <dt>{{ $t('adminPacingBench.how.day0Term') }}</dt>
            <dd>{{ $t('adminPacingBench.how.day0', { time: how.time, wood: how.wood, stone: how.stone, food: how.food }) }}</dd>
          </dl>
          <p class="note">{{ $t('adminPacingBench.how.decides') }}</p>
        </section>

        <section class="card">
          <h2>{{ $t('adminPacingBench.charts.lhTitle') }}</h2>
          <EconomyChart :series="lhSeries" stepped :x-title="$t('adminPacingBench.charts.days')" :y-title="$t('adminPacingBench.charts.lhLevel')" />
        </section>

        <section class="card">
          <h2>{{ $t('adminPacingBench.charts.prodTitle') }}</h2>
          <p class="note">{{ $t('adminPacingBench.charts.prodNote') }}</p>
          <EconomyChart :series="prodSeries" :markers="false" :x-title="$t('adminPacingBench.charts.days')" :y-title="$t('adminPacingBench.charts.perHour')" />
        </section>

        <section class="card">
          <h2>{{ $t('adminPacingBench.charts.timeTitle') }}</h2>
          <p class="note">{{ $t('adminPacingBench.charts.timeNote') }}</p>
          <label class="toggle">
            <input v-model="logTimes" type="checkbox" data-testid="bench-time-log" />
            {{ $t('adminPacingBench.charts.timeLog') }}
          </label>
          <EconomyChart :series="timeSeries" integer-x :log-y="logTimes" :x-title="$t('adminPacingBench.charts.level')" :y-title="$t('adminPacingBench.charts.hours')" data-testid="bench-time-chart" />
        </section>

        <section class="card">
          <h2>{{ $t('adminPacingBench.cost.title') }}</h2>
          <p class="note">{{ $t('adminPacingBench.cost.note') }}</p>
          <div class="costs" data-testid="bench-costs">
            <div v-for="c in costCells" :key="c.level" :data-testid="`bench-cost-${c.level}`">
              <b>{{ $t('adminPacingBench.cost.level', { level: c.level }) }}</b>
              <span>{{ c.value }}<span v-if="c.ref" class="ref"> ({{ c.ref }})</span></span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<style scoped>
.bench {
  --later: #ff7a7a;
  --sooner: #7bd88f;
}
.bench h1 {
  margin: 0 0 8px;
}
.bench h2 {
  margin: 0 0 4px;
  font-size: 16px;
}
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px 24px;
  margin-bottom: 16px;
}
.hint {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  max-width: 90ch;
}
.status {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.status.busy {
  color: var(--gold);
}
.muted {
  color: var(--muted);
}
.layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
  /* On narrow screens the results come first: the settings are a long form, the results are what you came for. */
  .results {
    order: -1;
  }
}
.knobs {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
@media (min-width: 901px) {
  .knobs {
    position: sticky;
    top: 12px;
    max-height: calc(100vh - 100px);
    overflow: auto;
  }
}
.knobs fieldset {
  border: 0;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px;
  gap: 6px 10px;
  align-items: center;
}
.knobs legend {
  grid-column: 1 / -1;
  font-size: 13px;
  font-weight: 600;
  color: var(--gold);
  padding: 0;
  margin-bottom: 4px;
}
.knobs label {
  font-size: 13px;
  color: var(--muted);
}
.knobs label small {
  display: block;
  font-size: 11px;
  color: var(--muted-2);
}
input {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--text);
  width: 100%;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
input.changed {
  border-color: var(--gold);
}
.btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.run,
.secondary {
  border-radius: 8px;
  padding: 7px 12px;
  cursor: pointer;
  font-weight: 600;
}
.run {
  background: var(--gold);
  color: #1a1208;
  border: none;
}
.run:disabled {
  opacity: 0.6;
  cursor: default;
}
.secondary {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--panel-border);
  font-weight: 500;
}
.copyout {
  width: 100%;
  font-size: 11px;
  background: var(--panel-bg);
  color: var(--text);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
}
.results {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}
.card {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  padding: 12px 14px 14px;
  min-width: 0;
}
.note {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--muted);
  max-width: 90ch;
}
.table-scroll {
  overflow-x: auto;
  max-width: 100%;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
.table th,
.table td {
  padding: 6px 10px;
  text-align: right;
  white-space: nowrap;
  border-bottom: 1px solid var(--panel-border);
  font-size: 14px;
}
.table th:first-child {
  text-align: left;
}
.table thead th {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
}
.table tbody th {
  font-weight: 500;
}
.never,
.target {
  color: var(--muted);
}
.target {
  font-size: 12px;
}
.d {
  margin-left: 6px;
  font-size: 11px;
  color: var(--muted);
}
.d.later {
  color: var(--later);
}
.d.sooner {
  color: var(--sooner);
}
.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
}
.how dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px 16px;
  margin: 8px 0 10px;
}
.how dt {
  font-weight: 600;
  white-space: nowrap;
}
.how dd {
  margin: 0;
  color: var(--muted);
  max-width: 75ch;
  font-size: 14px;
}
@media (max-width: 560px) {
  .how dl {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
  .how dd {
    margin-bottom: 8px;
  }
}
.costs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 6px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.costs > div {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
}
.costs b {
  font-weight: 500;
  color: var(--muted);
  white-space: nowrap;
}
.costs > div > span {
  text-align: right;
}
.ref {
  color: var(--muted);
  white-space: nowrap;
}
.toggle input {
  width: auto;
  flex: none;
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 8px;
  font-size: 0.9em;
}
</style>
