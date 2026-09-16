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
// that tap-cycles through stock -> rate -> max capacity (see `stage`/
// `cycle` below) — a single shared stage, not one per pill, so tapping any
// pill switches all of them together, auto-reverting to stock after a few
// seconds of no further tap. While the pull-down drawer is open (isHudDrawerOpen)
// there's real vertical room again, so pills switch to a third, "expanded"
// rendering that shows all three facts at once — the exact same markup/CSS
// as the desktop branch below, just still gated to mobile widths, so the
// drawer doesn't need its own separate (and duplicate) resource list.
// The fill bar itself is never part of the cycle — it renders identically in
// every stage/branch. Desktop keeps today's markup and styling untouched.
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { isHudDrawerOpen } from '../../composables/hudDrawerOpenState';
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
const isExpanded = computed(() => isCompact.value && isHudDrawerOpen.value);

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

// --- Mobile collapsed stage cycling (stock -> rate -> max -> stock) ---
// A single shared stage, not one per pill: tapping any pill switches all of
// them together, so they always read as one consistent "mode" rather than a
// mismatched mix of stock/rate/max across the row.

type Stage = 0 | 1 | 2;
const STAGE_COUNT = 3;
const AUTO_REVERT_MS = 6000;

const stage = ref<Stage>(0);
let revertTimer: ReturnType<typeof setTimeout> | null = null;

function clearRevertTimer() {
  if (revertTimer) {
    clearTimeout(revertTimer);
    revertTimer = null;
  }
}

function cycle() {
  stage.value = ((stage.value + 1) % STAGE_COUNT) as Stage;
  clearRevertTimer();
  if (stage.value !== 0) {
    revertTimer = setTimeout(() => {
      stage.value = 0;
      revertTimer = null;
    }, AUTO_REVERT_MS);
  }
}

onBeforeUnmount(clearRevertTimer);

function stageText(value: number, rate: number, cap: number): string {
  if (stage.value === 1) return t('hud.resourceBar.rate', { n: Math.round(rate) });
  if (stage.value === 2) return t('hud.resourceBar.capMax', { n: fmt(cap) });
  return fmt(value);
}
</script>

<template>
  <div class="resource-bar" :class="{ disabled: props.ringOpen, compact: isCompact && !isExpanded, expanded: isExpanded }">
    <template v-if="!isCompact || isExpanded">
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
        :data-stage="stage"
        :aria-label="t(`catalogue.resources.${pill.key}`) + ': ' + stageText(pill.value, pill.rate, pill.cap)"
        @click="cycle"
      >
        <span class="hex-icon" :style="{ background: pill.color }" />
        <div class="numbers-compact">
          <span class="value-compact" :class="`stage-${stage}`">
            {{ stageText(pill.value, pill.rate, pill.cap) }}
            <span v-if="stage === 0 && pill.reserved > 0" class="reserved-hint">
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
            <span v-for="i in STAGE_COUNT" :key="i" class="dot" :class="{ active: stage === i - 1 }" />
          </span>
        </div>
      </button>
      <button
        v-if="population.max > 0"
        type="button"
        class="resource resource--compact population"
        :data-stage="stage"
        :aria-label="t('hud.nav.settlement') + ': ' + stageText(population.current, population.rate, population.max)"
        @click="cycle"
      >
        <span class="hex-icon" style="background: var(--pop, #7fb3d5)" />
        <div class="numbers-compact">
          <span class="value-compact" :class="`stage-${stage}`">
            {{ stageText(population.current, population.rate, population.max) }}
          </span>
          <span class="fill-track">
            <span class="fill" :style="{ width: fillPct(population.current, population.max) + '%', background: 'var(--pop, #7fb3d5)' }" />
          </span>
          <span class="stage-dots" aria-hidden="true">
            <span v-for="i in STAGE_COUNT" :key="i" class="dot" :class="{ active: stage === i - 1 }" />
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

/* Mobile expanded pills only (drawer open) — reuses the desktop markup
   above wholesale, but a mobile pill is much narrower than a desktop one,
   so "400/3,000" on one line gets cramped fast. Break the cap onto its own
   line there; desktop (no `.expanded` class) keeps the single-line look. */
.resource-bar.expanded .value .cap {
  display: block;
}

/* Mobile collapsed pills only (drawer closed) — single line per pill,
   tap-cycles through stock / rate / max capacity together. Only active
   under HUD_COMPACT_QUERY (lib/breakpoints.ts) and while the drawer is
   closed; the desktop rules above are untouched, and are reused as-is for
   the mobile *expanded* state (drawer open — see ResourceBar.vue's isExpanded). */
.resource-bar.compact {
  gap: 10px;
}
/* The desktop `.resource + .resource` separator (22px padding + a border)
   would otherwise still apply here too — far too wide for 5 pills to fit a
   phone screen. Compact pills space themselves with the flex gap above
   instead. */
.resource-bar.compact .resource--compact + .resource--compact {
  padding-left: 0;
  border-left: none;
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
