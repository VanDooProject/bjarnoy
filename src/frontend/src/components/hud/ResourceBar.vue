<script setup lang="ts">
// Issue #16 "header": resource icons redrawn as hexes (the mockup's
// diamonds), and population wired up as a fifth pill exactly like the other
// four (current/max stock + a rate) instead of being unimplemented — see
// `WorldModel.populationFor` / `stores/world.ts`'s `hud.population`. Each
// pill also carries a cap (`WorldModel.storageCapForDisplay`) and a fill-progress
// underline, matching the reference's "4,965 / 12,000" + green bar.
//
// Mobile HUD bar rework: below HUD_COMPACT_QUERY there simply isn't room for
// the stacked value/rate/fill layout, so each pill collapses to one line
// that tap-cycles through stock -> rate -> max capacity (see `stageOf`/
// `cycle` below), auto-reverting to stock after a few seconds of no further
// tap so a player can't accidentally strand every pill on "max ...". The
// fill bar itself is never part of the cycle — it renders identically in
// every stage, at both viewport tiers. Desktop keeps today's markup and
// styling completely untouched.
import { computed, onBeforeUnmount, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { HUD_COMPACT_QUERY } from '../../lib/breakpoints';
import type { MessageSchema } from '../../i18n/schema';

const props = defineProps<{
  // Issue #16 "ring menu": dims the resource pills while a ring is open, to
  // match RealmPanel's own disabled look — these aren't interactive, but
  // reads as one consistent "HUD chrome recedes while the ring has focus"
  // rule rather than only RealmPanel changing.
  ringOpen?: boolean;
}>();

const world = useWorldStore();
const { t, n } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const isCompact = useMediaQuery(HUD_COMPACT_QUERY);

// Issue #158: each pill's fill track gains a dim reserved segment — the
// stock is not split into two bars, `reserved` is a *portion* of `value`
// already sitting in stock, earmarked for the waiting build queue and
// unspendable elsewhere. Always zero in demo mode (`hud.reserved` never
// changes from its empty default there — see stores/world.ts).
const pills = computed(() => [
  { key: 'wood', color: 'var(--wood)', value: world.hud.resources.wood, rate: world.hud.rates.wood, cap: world.hud.storageCap.wood, reserved: world.hud.reserved.wood },
  { key: 'stone', color: 'var(--stone)', value: world.hud.resources.stone, rate: world.hud.rates.stone, cap: world.hud.storageCap.stone, reserved: world.hud.reserved.stone },
  { key: 'food', color: 'var(--food)', value: world.hud.resources.food, rate: world.hud.rates.food, cap: world.hud.storageCap.food, reserved: world.hud.reserved.food },
  { key: 'iron', color: 'var(--iron)', value: world.hud.resources.iron, rate: world.hud.rates.iron, cap: world.hud.storageCap.iron, reserved: world.hud.reserved.iron },
]);

const population = computed(() => world.hud.population);
const POPULATION_KEY = 'population';

function fmt(value: number): string {
  return n(Math.floor(value), 'integer');
}

function fillPct(value: number, cap: number): number {
  return cap > 0 ? Math.min(100, Math.max(0, (value / cap) * 100)) : 0;
}

/**
 * The reserved segment's own left offset and width within the track, as
 * percentages of `cap` — positioned as the trailing (highest-stock) slice of
 * the filled bar: from `(value - reserved) / cap` to `value / cap`. Reserved
 * can never exceed the stock it's carved out of, so this never runs past
 * `fillPct`.
 */
function reservedSegment(value: number, reserved: number, cap: number): { left: number; width: number } {
  if (cap <= 0) return { left: 0, width: 0 };
  const clampedReserved = Math.max(0, Math.min(reserved, value));
  const left = Math.max(0, Math.min(100, ((value - clampedReserved) / cap) * 100));
  const width = Math.max(0, Math.min(100 - left, (clampedReserved / cap) * 100));
  return { left, width };
}

// --- Mobile compact stage cycling (stock -> rate -> max -> stock) ---

type Stage = 0 | 1 | 2;
const STAGE_COUNT = 3;
const AUTO_REVERT_MS = 6000;

// Per-pill, component-local, never persisted — a transient peek, not a
// preference. Resets on remount (navigating away and back, or a reload).
const stages = reactive<Record<string, Stage>>({});
const revertTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function stageOf(key: string): Stage {
  return stages[key] ?? 0;
}

function clearRevertTimer(key: string) {
  const existing = revertTimers[key];
  if (existing) {
    clearTimeout(existing);
    delete revertTimers[key];
  }
}

function cycle(key: string) {
  stages[key] = (((stageOf(key) + 1) % STAGE_COUNT) as Stage);
  clearRevertTimer(key);
  if (stages[key] !== 0) {
    revertTimers[key] = setTimeout(() => {
      stages[key] = 0;
      delete revertTimers[key];
    }, AUTO_REVERT_MS);
  }
}

onBeforeUnmount(() => {
  Object.values(revertTimers).forEach(clearTimeout);
});

function stageText(key: string, value: number, rate: number, cap: number): string {
  const stage = stageOf(key);
  if (stage === 1) return t('hud.resourceBar.rate', { n: Math.round(rate) });
  if (stage === 2) return t('hud.resourceBar.capMax', { n: fmt(cap) });
  return fmt(value);
}
</script>

<template>
  <div class="resource-bar" :class="{ disabled: props.ringOpen, compact: isCompact }">
    <template v-if="!isCompact">
      <div v-for="pill in pills" :key="pill.key" class="resource">
        <span class="hex-icon" :style="{ background: pill.color }" />
        <div class="numbers">
          <span class="value">
            {{ fmt(pill.value) }}<span class="cap">{{ t('hud.resourceBar.capSuffix', { n: fmt(pill.cap) }) }}</span>
            <span v-if="pill.reserved > 0" class="reserved-hint">{{ t('hud.resourceBar.reserved', { n: fmt(pill.reserved) }) }}</span>
          </span>
          <span class="rate">{{ t('hud.resourceBar.rate', { n: Math.round(pill.rate) }) }}</span>
          <span class="fill-track">
            <span class="fill" :style="{ width: fillPct(pill.value, pill.cap) + '%', background: pill.color }" />
            <span
              v-if="pill.reserved > 0"
              class="fill-reserved"
              :style="{
                left: reservedSegment(pill.value, pill.reserved, pill.cap).left + '%',
                width: reservedSegment(pill.value, pill.reserved, pill.cap).width + '%',
              }"
            />
          </span>
        </div>
      </div>
      <div v-if="population.max > 0" class="resource population">
        <span class="hex-icon" style="background: var(--pop, #7fb3d5)" />
        <div class="numbers">
          <span class="value">{{ fmt(population.current) }}<span class="cap">{{ t('hud.resourceBar.capSuffix', { n: fmt(population.max) }) }}</span></span>
          <span class="rate">{{ t('hud.resourceBar.rate', { n: Math.round(population.rate) }) }}</span>
          <span class="fill-track"><span class="fill" :style="{ width: fillPct(population.current, population.max) + '%', background: 'var(--pop, #7fb3d5)' }" /></span>
        </div>
      </div>
    </template>

    <template v-else>
      <button
        v-for="pill in pills"
        :key="pill.key"
        type="button"
        class="resource resource--compact"
        :data-stage="stageOf(pill.key)"
        :aria-label="t(`catalogue.resources.${pill.key}`) + ': ' + stageText(pill.key, pill.value, pill.rate, pill.cap)"
        @click="cycle(pill.key)"
      >
        <span class="hex-icon" :style="{ background: pill.color }" />
        <div class="numbers-compact">
          <span class="value-compact" :class="`stage-${stageOf(pill.key)}`">
            {{ stageText(pill.key, pill.value, pill.rate, pill.cap) }}
            <span v-if="stageOf(pill.key) === 0 && pill.reserved > 0" class="reserved-hint">
              {{ t('hud.resourceBar.reserved', { n: fmt(pill.reserved) }) }}
            </span>
          </span>
          <span class="fill-track">
            <span class="fill" :style="{ width: fillPct(pill.value, pill.cap) + '%', background: pill.color }" />
            <span
              v-if="pill.reserved > 0"
              class="fill-reserved"
              :style="{
                left: reservedSegment(pill.value, pill.reserved, pill.cap).left + '%',
                width: reservedSegment(pill.value, pill.reserved, pill.cap).width + '%',
              }"
            />
          </span>
          <span class="stage-dots" aria-hidden="true">
            <span v-for="i in STAGE_COUNT" :key="i" class="dot" :class="{ active: stageOf(pill.key) === i - 1 }" />
          </span>
        </div>
      </button>
      <button
        v-if="population.max > 0"
        type="button"
        class="resource resource--compact population"
        :data-stage="stageOf(POPULATION_KEY)"
        :aria-label="t('hud.nav.settlement') + ': ' + stageText(POPULATION_KEY, population.current, population.rate, population.max)"
        @click="cycle(POPULATION_KEY)"
      >
        <span class="hex-icon" style="background: var(--pop, #7fb3d5)" />
        <div class="numbers-compact">
          <span class="value-compact" :class="`stage-${stageOf(POPULATION_KEY)}`">
            {{ stageText(POPULATION_KEY, population.current, population.rate, population.max) }}
          </span>
          <span class="fill-track">
            <span class="fill" :style="{ width: fillPct(population.current, population.max) + '%', background: 'var(--pop, #7fb3d5)' }" />
          </span>
          <span class="stage-dots" aria-hidden="true">
            <span v-for="i in STAGE_COUNT" :key="i" class="dot" :class="{ active: stageOf(POPULATION_KEY) === i - 1 }" />
          </span>
        </div>
      </button>
    </template>
  </div>
</template>

<style scoped>
.resource-bar {
  display: flex;
  align-items: center;
  gap: 22px;
  flex: none;
  transition: opacity 0.15s ease;
}
.resource-bar.disabled {
  opacity: 0.35;
  filter: grayscale(0.7);
}
.resource {
  display: flex;
  align-items: center;
  gap: 7px;
}
.resource + .resource {
  padding-left: 22px;
  border-left: 1px solid var(--panel-border);
}
.hex-icon {
  width: 13px;
  height: 13px;
  flex: none;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
.numbers {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.value {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}
.cap {
  font-weight: 400;
  color: var(--muted);
}
.rate {
  font-size: 11px;
  color: var(--food);
}
.fill-track {
  position: relative;
  margin-top: 3px;
  width: 100%;
  min-width: 64px;
  height: 3px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  border-radius: 2px;
}
/* Issue #158: the reserved slice of the fill — the top (highest-stock) edge of the bar, dimmed to read as "in stock but spoken for" rather than freely spendable. */
.fill-reserved {
  position: absolute;
  top: 0;
  height: 100%;
  background: rgba(0, 0, 0, 0.45);
}
.reserved-hint {
  margin-left: 4px;
  font-weight: 400;
  font-size: 11px;
  color: var(--muted);
}

/* Mobile compact pills — single line per pill, tap-cycles through stock /
   rate / max capacity. Only active under HUD_COMPACT_QUERY (lib/breakpoints.ts);
   the desktop rules above are untouched. */
.resource-bar.compact {
  gap: 12px;
}
.resource--compact {
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.resource--compact:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
  border-radius: 4px;
}
.numbers-compact {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  min-width: 44px;
}
.value-compact {
  font-weight: 600;
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
}
/* Distinguish the three stages by text shape, not colour alone — colour is
   an additional cue only. Stage 0 (stock) keeps the default bold/light text. */
.value-compact.stage-1 {
  color: var(--food);
}
.value-compact.stage-2 {
  font-weight: 400;
  color: var(--muted);
}
.resource-bar.compact .fill-track {
  min-width: 48px;
  margin-top: 2px;
}
.stage-dots {
  display: flex;
  gap: 3px;
  margin-top: 2px;
}
.stage-dots .dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--panel-border);
}
.stage-dots .dot.active {
  background: var(--gold);
}
</style>
