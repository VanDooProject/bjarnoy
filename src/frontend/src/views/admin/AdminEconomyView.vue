<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import EconomyChart, { type EconomySeries } from '../../components/admin/EconomyChart.vue';
import { buildingName } from '../../i18n/catalogueNames';
import type { MessageSchema } from '../../i18n/schema';
import { curvesFor } from '../../lib/economy/curves';
import {
  DEFAULT_JOIN_TIME,
  DEFAULT_PRODUCER_COUNTS,
  DEFAULT_PRODUCERS_AHEAD,
  DEFAULT_RENOWN_THRESHOLD,
  FOUNDING_STOCK,
  PROFILE_PRESETS,
  RESOURCES,
  productionOnDay,
  settlerCostFrom,
  simulatePacing,
  type PacingResult,
  type Session,
} from '../../lib/economy/pacingSim';
import { applyWhatIf, defaultWhatIf, type WhatIfKnobs } from '../../lib/economy/whatIf';
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

// --- What-if: the same catalogue regenerated from level 1 and the growth knobs ---

const whatIf = reactive<WhatIfKnobs>(defaultWhatIf());
const whatIfByType = computed(() => applyWhatIf(byType.value, whatIf));
function resetWhatIf() {
  Object.assign(whatIf, defaultWhatIf());
}
const WHAT_IF_FIELDS = [
  'costGrowth',
  'longhouseCostGrowth',
  'timeGrowth',
  'longhouseTimeGrowth',
  'productionGrowth',
  'producerCostScale',
  'longhouseCostScale',
  'timeScale',
] as const;

const curves = computed(() =>
  catalogue.types
    .filter((type) => selectedTypes.value.includes(type))
    .map((type) => ({
      type,
      live: curvesFor(byType.value[type]),
      whatIf: curvesFor(whatIfByType.value[type] ?? byType.value[type]),
    })),
);

/** Live series first (solid), then the what-if twins (dashed, same colour). */
function curveSeries(pick: (p: ReturnType<typeof curvesFor>[number]) => number | null, dropZero: boolean): EconomySeries[] {
  const toPoints = (points: ReturnType<typeof curvesFor>) =>
    points.map((p) => {
      const y = pick(p);
      return { x: p.level, y: dropZero && y !== null && y <= 0 ? null : y };
    });
  return [
    ...curves.value.map(({ type, live }) => ({ label: buildingName(type), color: typeColor(type), points: toPoints(live) })),
    ...curves.value.map(({ type, whatIf: w }) => ({
      label: t('adminEconomy.curves.whatIfSuffix', { name: buildingName(type) }),
      color: typeColor(type),
      dashed: true,
      points: toPoints(w),
    })),
  ];
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
const storageCount = ref(2);
const joinTime = ref(DEFAULT_JOIN_TIME);
const producersAhead = ref(DEFAULT_PRODUCERS_AHEAD);
const aheadUnlimited = ref(false);
const feasts = ref(false);
const renownThreshold = ref(DEFAULT_RENOWN_THRESHOLD);
// Every producer type gets an explicit count so its input never renders blank.
watch(
  producerTypes,
  (types) => {
    for (const type of types) producerCounts[type] ??= 0;
  },
  { immediate: true },
);
const settlerCost = computed(() => settlerCostFrom(units.byType['settlercrew']?.trainingCost));

type ProfileKey = 'active' | 'checkins4' | 'checkins2' | 'always24' | 'custom';
const PROFILE_KEYS: ProfileKey[] = ['active', 'checkins4', 'checkins2', 'always24', 'custom'];
const PROFILE_LABEL: Record<ProfileKey, string> = {
  active: 'adminEconomy.pacing.profileActive',
  checkins4: 'adminEconomy.pacing.profileCheckins4',
  checkins2: 'adminEconomy.pacing.profileCheckins2',
  always24: 'adminEconomy.pacing.profileAlways24',
  custom: 'adminEconomy.pacing.profileCustom',
};
const selectedProfiles = ref<ProfileKey[]>(['active', 'checkins4', 'checkins2']);
const customSessions = ref<Session[]>([
  { start: '08:00', minutes: 10 },
  { start: '13:00', minutes: 10 },
  { start: '19:00', minutes: 10 },
]);
function addSession() {
  customSessions.value.push({ start: '12:00', minutes: 10 });
}
function removeSession(i: number) {
  customSessions.value.splice(i, 1);
}
const sessionsOf = (key: ProfileKey): Session[] =>
  key === 'custom' ? customSessions.value.map((s) => ({ ...s })) : PROFILE_PRESETS[key];

interface ProfileRun {
  live: PacingResult;
  whatIf: PacingResult;
}
const results = ref<Partial<Record<ProfileKey, ProfileRun>> | null>(null);
/** Profiles the shown results were run for, in display order. */
const ranProfiles = ref<ProfileKey[]>([]);
const running = ref(false);

function run() {
  running.value = true;
  const base = {
    horizonDays: Math.max(1, Number(horizonDays.value) || 1),
    producerCounts: { ...producerCounts },
    settlerCost: settlerCost.value,
    settleType: 'cartworkshop',
    storageCount: Math.max(1, Number(storageCount.value) || 1),
    joinTime: joinTime.value || DEFAULT_JOIN_TIME,
    producersAhead: aheadUnlimited.value ? Infinity : Math.max(0, Number(producersAhead.value) || 0),
    feasts: feasts.value,
    renownThreshold: Math.max(0, Number(renownThreshold.value) || 0),
  };
  const keys = PROFILE_KEYS.filter((k) => selectedProfiles.value.includes(k));
  const out: Partial<Record<ProfileKey, ProfileRun>> = {};
  for (const key of keys) {
    const sessions = sessionsOf(key);
    out[key] = {
      live: simulatePacing(byType.value, { ...base, sessions, startStock: { ...startStock } }),
      whatIf: simulatePacing(whatIfByType.value, { ...base, sessions, startStock: { ...whatIf.foundingStock } }),
    };
  }
  results.value = out;
  ranProfiles.value = keys;
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
  const make = (which: 'live' | 'whatIf'): EconomySeries[] =>
    ranProfiles.value.map((key) => {
      const s = results.value![key]![which].series;
      const label = t(PROFILE_LABEL[key]);
      return {
        label: which === 'live' ? label : t('adminEconomy.curves.whatIfSuffix', { name: label }),
        color: PALETTE[PROFILE_KEYS.indexOf(key)],
        dashed: which === 'whatIf',
        points: s.minute.map((m, k) => ({ x: m / 1440, y: s.lh[k] })),
      };
    });
  return [...make('live'), ...make('whatIf')];
});

const MILESTONE_LEVELS = [5, 10, 15, 20, 25, 30];
const PRODUCTION_DAYS = [7, 14, 30];
const lhLevels = computed(() => MILESTONE_LEVELS.filter((l) => l <= Math.max(...ladder.value.map((r) => r.level), 0)));

/** Minutes as `Xd HH:MM`. */
function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.floor(minutes % 60);
  return `${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function levelText(r: PacingResult, level: number): string {
  return r.lhReachedAt[level] === undefined ? t('adminEconomy.pacing.never') : formatDuration(r.lhReachedAt[level]);
}
function productionText(r: PacingResult, day: number): string {
  const p = productionOnDay(r, day);
  return p === null ? '—' : Math.round(p).toLocaleString('en-US');
}
function settlementText(r: PacingResult): string {
  return r.secondSettlementAt === null ? t('adminEconomy.pacing.never') : formatDuration(r.secondSettlementAt);
}
function flattenText(r: PacingResult): string {
  return r.growthFlattensAt === null ? t('adminEconomy.pacing.never') : String(r.growthFlattensAt);
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
      <!-- What-if -->
      <div class="panel-section">
        <h2>{{ $t('adminEconomy.whatIf.title') }}</h2>
        <p class="hint">{{ $t('adminEconomy.whatIf.hint') }}</p>
        <form class="inputs" data-testid="whatif-form" @submit.prevent>
          <fieldset>
            <legend>{{ $t('adminEconomy.whatIf.title') }}</legend>
            <label v-for="f in WHAT_IF_FIELDS" :key="f">
              {{ $t(`adminEconomy.whatIf.${f}`) }}
              <input v-model.number="whatIf[f]" type="number" min="0" step="0.01" :data-testid="`whatif-${f}`" />
            </label>
          </fieldset>
          <fieldset>
            <legend>{{ $t('adminEconomy.whatIf.foundingStock') }}</legend>
            <label v-for="r in RESOURCES" :key="r">
              {{ $t(`adminEconomy.resources.${r}`) }}
              <input v-model.number="whatIf.foundingStock[r]" type="number" min="0" step="50" />
            </label>
          </fieldset>
          <button type="button" class="secondary" data-testid="whatif-reset" @click="resetWhatIf">
            {{ $t('adminEconomy.whatIf.reset') }}
          </button>
        </form>
      </div>

      <!-- Curves -->
      <div class="panel-section">
        <h2>{{ $t('adminEconomy.curves.title') }}</h2>
        <p class="hint">{{ $t('adminEconomy.curves.note') }}</p>
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
            <label>
              {{ $t('adminEconomy.pacing.storageCount') }}
              <input v-model.number="storageCount" type="number" min="1" max="10" step="1" data-testid="storage-count" />
            </label>
            <label>
              {{ $t('adminEconomy.pacing.joinTime') }}
              <input v-model="joinTime" type="time" data-testid="join-time" />
            </label>
            <label>
              {{ $t('adminEconomy.pacing.producersAhead') }}
              <input v-model.number="producersAhead" type="number" min="0" max="30" step="1" :disabled="aheadUnlimited" data-testid="producers-ahead" />
            </label>
            <label class="check">
              <input v-model="aheadUnlimited" type="checkbox" data-testid="ahead-unlimited" />
              {{ $t('adminEconomy.pacing.aheadUnlimited') }}
            </label>
            <label class="check">
              <input v-model="feasts" type="checkbox" data-testid="feasts" />
              {{ $t('adminEconomy.pacing.feasts') }}
            </label>
            <label>
              {{ $t('adminEconomy.pacing.renownThreshold') }}
              <input v-model.number="renownThreshold" type="number" min="0" step="500" data-testid="renown-threshold" />
            </label>
            <p class="muted small note">{{ $t('adminEconomy.pacing.renownNote') }}</p>
            <p class="muted small note">{{ $t('adminEconomy.pacing.settlerCrewNote') }}: {{ costText(settlerCost) }}</p>
          </fieldset>
          <fieldset>
            <legend>{{ $t('adminEconomy.pacing.profiles') }}</legend>
            <label v-for="key in PROFILE_KEYS" :key="key" class="check">
              <input v-model="selectedProfiles" type="checkbox" :value="key" :data-testid="`profile-${key}`" />
              {{ $t(PROFILE_LABEL[key]) }}
            </label>
          </fieldset>
          <fieldset v-if="selectedProfiles.includes('custom')" data-testid="custom-schedule">
            <legend>{{ $t('adminEconomy.pacing.customTitle') }}</legend>
            <div v-for="(s, i) in customSessions" :key="i" class="session-row">
              <label>
                {{ $t('adminEconomy.pacing.sessionStart') }}
                <input v-model="s.start" type="time" />
              </label>
              <label>
                {{ $t('adminEconomy.pacing.sessionMinutes') }}
                <input v-model.number="s.minutes" type="number" min="1" max="1440" step="1" />
              </label>
              <button type="button" class="secondary" @click="removeSession(i)">{{ $t('adminEconomy.pacing.removeSession') }}</button>
            </div>
            <button type="button" class="secondary" data-testid="add-session" @click="addSession">
              {{ $t('adminEconomy.pacing.addSession') }}
            </button>
          </fieldset>
          <button type="submit" class="run" :disabled="running" data-testid="economy-run">
            {{ running ? $t('adminEconomy.pacing.running') : $t('adminEconomy.pacing.run') }}
          </button>
        </form>

        <p v-if="!results" class="muted">{{ $t('adminEconomy.pacing.noRun') }}</p>
        <p v-else-if="ranProfiles.length === 0" class="muted">{{ $t('adminEconomy.pacing.noProfile') }}</p>
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
          <div class="table-scroll">
            <table class="table" data-testid="milestones">
              <thead>
                <tr>
                  <th rowspan="2">{{ $t('adminEconomy.pacing.colLevel') }}</th>
                  <th v-for="key in ranProfiles" :key="key" colspan="2" class="group">{{ $t(PROFILE_LABEL[key]) }}</th>
                </tr>
                <tr>
                  <template v-for="key in ranProfiles" :key="key">
                    <th class="sub">{{ $t('adminEconomy.pacing.live') }}</th>
                    <th class="sub whatif">{{ $t('adminEconomy.pacing.whatIf') }}</th>
                  </template>
                </tr>
              </thead>
              <tbody>
                <tr v-for="level in lhLevels" :key="`lh${level}`">
                  <td>{{ $t('adminEconomy.pacing.levelRow', { level }) }}</td>
                  <template v-for="key in ranProfiles" :key="key">
                    <td :data-testid="`lh-${level}-${key}-live`">{{ levelText(results[key]!.live, level) }}</td>
                    <td class="whatif" :data-testid="`lh-${level}-${key}-whatif`">{{ levelText(results[key]!.whatIf, level) }}</td>
                  </template>
                </tr>
                <tr v-for="day in PRODUCTION_DAYS" :key="`p${day}`" class="section-row">
                  <td>{{ $t('adminEconomy.pacing.production', { day }) }}</td>
                  <template v-for="key in ranProfiles" :key="key">
                    <td :data-testid="`prod-${day}-${key}-live`">{{ productionText(results[key]!.live, day) }}</td>
                    <td class="whatif" :data-testid="`prod-${day}-${key}-whatif`">{{ productionText(results[key]!.whatIf, day) }}</td>
                  </template>
                </tr>
                <tr class="section-row">
                  <td>{{ $t('adminEconomy.pacing.secondSettlement') }}</td>
                  <template v-for="key in ranProfiles" :key="key">
                    <td :data-testid="`settlement-${key}-live`">{{ settlementText(results[key]!.live) }}</td>
                    <td class="whatif" :data-testid="`settlement-${key}-whatif`">{{ settlementText(results[key]!.whatIf) }}</td>
                  </template>
                </tr>
                <tr>
                  <td>{{ $t('adminEconomy.pacing.growthFlattens') }}</td>
                  <template v-for="key in ranProfiles" :key="key">
                    <td :data-testid="`flatten-${key}-live`">{{ flattenText(results[key]!.live) }}</td>
                    <td class="whatif" :data-testid="`flatten-${key}-whatif`">{{ flattenText(results[key]!.whatIf) }}</td>
                  </template>
                </tr>
              </tbody>
            </table>
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
.table-scroll {
  overflow-x: auto;
  max-width: 100%;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th.group {
  text-align: center;
  border-left: 1px solid var(--panel-border);
}
.table th.sub {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
}
.table td.whatif,
.table th.whatif {
  font-style: italic;
  border-right: 1px solid var(--panel-border);
}
.table th,
.table td {
  text-align: left;
  padding: 6px 12px;
  border-bottom: 1px solid var(--panel-border);
  font-size: 14px;
}
.section-row td:first-child {
  font-weight: 600;
}
.inputs label.check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
.inputs label.check input {
  width: auto;
}
.inputs .note {
  flex-basis: 100%;
  margin: 0;
}
.session-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-basis: 100%;
}
.secondary {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 6px 12px;
  cursor: pointer;
  align-self: flex-end;
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
