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
//
// Mobile HUD bar rework, phase 3 (owner's decision): the phone row must
// NEVER wrap onto a second line, in either the collapsed or the expanded
// (drawer-open) state — a wrapped population pill at 320px was flagged as
// bad, not fixed by giving it more room. With wrapping no longer a release
// valve, the row instead measures itself (`useShortNotation`/`updateFit`
// below) and switches every pill's numbers to short "k"/"M" notation
// together — see `lib/hud/compactNumber.ts` — only once the full-notation
// row genuinely doesn't fit. The hidden `.resource-bar--measure` clone
// mirrors the visible row but forced to full notation, so fit is always
// judged against "would full notation fit", never against whatever is
// currently on screen — that's what keeps the row from flip-flopping right
// at the boundary.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { isHudDrawerOpen } from '../../composables/hudDrawerOpenState';
import { HUD_COMPACT_QUERY } from '../../lib/breakpoints';
import { formatHudNumber } from '../../lib/hud/compactNumber';
import type { MessageSchema } from '../../i18n/schema';

const props = defineProps<{
  // Issue #16 "ring menu": dims the resource pills while a ring is open —
  // these aren't interactive, but reads as one consistent "HUD chrome
  // recedes while the ring has focus" rule rather than only one panel
  // changing.
  ringOpen?: boolean;
}>();

const world = useWorldStore();
const { t, locale } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

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

// --- Number formatting (full by default, short only once measured to not fit) ---

/** Whether the phone row is currently showing short "k"/"M" notation instead of full grouped numbers. Always false on desktop. */
const useShortNotation = ref(false);

/**
 * Owner's decision, last resort: "if even short notation doesn't fit
 * (very unlikely), shrink the font a step rather than wrap." Set once
 * `updateFit` finds the row still overflowing even after switching to short
 * notation — e.g. five pills' worth of very large numbers on the narrowest
 * (320px) phone. Never set without `useShortNotation` also being true.
 */
const useTightFont = ref(false);

/** `forceFull` lets the hidden measurer (below) always render full notation regardless of `useShortNotation`, since it exists to answer "would full notation fit". */
function fmt(value: number, forceFull = false): string {
  return formatHudNumber(Math.floor(value), locale.value, forceFull ? false : useShortNotation.value);
}

/** A rate carries its own sign (`+60/h`, `-12/h`) — `formatHudNumber` already signs negatives, so only the positive case needs a `+` added here. */
function fmtRate(rate: number, forceFull = false): string {
  const rounded = Math.round(rate);
  const formatted = formatHudNumber(rounded, locale.value, forceFull ? false : useShortNotation.value);
  return rounded < 0 ? formatted : `+${formatted}`;
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

// Cap stage now reuses the exact same "/{n}" the expanded view's cap line
// shows (owner's call — a bare "/3,000" reads as continuing the "current"
// line's own cap, exactly like the expanded pill directly above it does),
// not a standalone "max {n}" label.
function stageText(value: number, rate: number, cap: number, forceFull = false): string {
  if (stage.value === 1) return t('hud.resourceBar.rate', { n: fmtRate(rate, forceFull) });
  if (stage.value === 2) return t('hud.resourceBar.capSuffix', { n: fmt(cap, forceFull) });
  return fmt(value, forceFull);
}

// --- Fit measurement: does full notation fit the row's real width? ---
// `barRef` is the actual, visible `.resource-bar` — the one whose width the
// row must fit into. `measureRef` is the hidden clone below (forced full
// notation, `flex: none` on its own pills so it reports its true unwrapped
// content width via `scrollWidth`, and `position: fixed` so it never
// participates in `.hud-bar-right`'s own flex layout). Comparing the two,
// rather than trying to guess a width in pixels, is what makes this correct
// at every phone width and font/locale combination instead of just the ones
// tested by hand.
const barRef = ref<HTMLElement | null>(null);
const measureRef = ref<HTMLElement | null>(null);
let resizeObserver: ResizeObserver | null = null;

/** Smallest evenly spread gap short notation may leave before the font steps down a size. */
const MIN_TIGHT_GAP_PX = 8;

async function updateFit(): Promise<void> {
  if (!isCompact.value) {
    useShortNotation.value = false;
    useTightFont.value = false;
    return;
  }
  const bar = barRef.value;
  const measure = measureRef.value;
  if (!bar || !measure) return;
  const needsShort = measure.scrollWidth > bar.clientWidth;
  useShortNotation.value = needsShort;
  useTightFont.value = false;
  if (!needsShort) return;
  // Let the DOM actually re-render in short notation before judging whether
  // that alone was enough. "Enough" means the evenly spread row still keeps
  // a visible gap (MIN_TIGHT_GAP_PX at each of its pills + 1 spaces, ends
  // included) — not merely that it doesn't overflow, which would still let
  // the pills sit nearly touching on the narrowest phones.
  await nextTick();
  const pillsWidth = Array.from(bar.children).reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);
  useTightFont.value = pillsWidth + (bar.children.length + 1) * MIN_TIGHT_GAP_PX > bar.clientWidth;
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined' && barRef.value) {
    resizeObserver = new ResizeObserver(() => void updateFit());
    resizeObserver.observe(barRef.value);
  }
  void nextTick(updateFit);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

// Re-check whenever anything that can change either row's rendered width
// does: the numbers themselves, the stage being cycled (collapsed mode only
// shows one stage's text at a time), and collapsed <-> expanded (a
// completely different markup shape) — a bar *resize* (rotation, drawer
// animation) is already covered by the ResizeObserver above.
watch([pills, population, stage, isExpanded, isCompact, locale], () => void updateFit(), { deep: true });
</script>

<template>
  <div
    ref="barRef"
    class="resource-bar"
    :class="{ disabled: props.ringOpen, compact: isCompact && !isExpanded, expanded: isExpanded, 'tight-font': useTightFont }"
  >
    <template v-if="!isCompact || isExpanded">
      <div v-for="pill in pills" :key="pill.key" class="resource">
        <span class="hex-icon" :style="{ background: pill.color }" />
        <div class="numbers">
          <span class="value">
            {{ fmt(pill.value) }}<span class="cap">{{ t('hud.resourceBar.capSuffix', { n: fmt(pill.cap) }) }}</span>
            <span v-if="pill.reserved > 0" class="reserved-hint">{{ t('hud.resourceBar.reserved', { n: fmt(pill.reserved) }) }}</span>
          </span>
          <span class="rate">{{ t('hud.resourceBar.rate', { n: fmtRate(pill.rate) }) }}</span>
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
          <span class="rate">{{ t('hud.resourceBar.rate', { n: fmtRate(population.rate) }) }}</span>
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
        </div>
      </button>
    </template>
  </div>

  <!-- Hidden fit-measurement clone (see `updateFit` above) — same shape as
       the visible row above, always in full notation, never wrapped, laid
       out off-screen via `position: fixed` so it can't affect `.hud-bar-right`'s
       real layout or be seen/hit-tested. Exists only on phones. -->
  <div
    v-if="isCompact"
    ref="measureRef"
    class="resource-bar resource-bar--measure"
    :class="{ compact: !isExpanded, expanded: isExpanded }"
    aria-hidden="true"
    data-measure="true"
    inert
  >
    <template v-if="isExpanded">
      <div v-for="pill in pills" :key="pill.key" class="resource">
        <span class="hex-icon" :style="{ background: pill.color }" />
        <div class="numbers">
          <span class="value">
            {{ fmt(pill.value, true) }}<span class="cap">{{ t('hud.resourceBar.capSuffix', { n: fmt(pill.cap, true) }) }}</span>
            <span v-if="pill.reserved > 0" class="reserved-hint">{{ t('hud.resourceBar.reserved', { n: fmt(pill.reserved, true) }) }}</span>
          </span>
          <span class="rate">{{ t('hud.resourceBar.rate', { n: fmtRate(pill.rate, true) }) }}</span>
        </div>
      </div>
      <div v-if="population.max > 0" class="resource population">
        <span class="hex-icon" style="background: var(--pop, #7fb3d5)" />
        <div class="numbers">
          <span class="value">{{ fmt(population.current, true) }}<span class="cap">{{ t('hud.resourceBar.capSuffix', { n: fmt(population.max, true) }) }}</span></span>
          <span class="rate">{{ t('hud.resourceBar.rate', { n: fmtRate(population.rate, true) }) }}</span>
        </div>
      </div>
    </template>
    <template v-else>
      <div v-for="pill in pills" :key="pill.key" class="resource resource--compact">
        <span class="hex-icon" :style="{ background: pill.color }" />
        <div class="numbers-compact">
          <span class="value-compact">
            {{ stageText(pill.value, pill.rate, pill.cap, true) }}
            <span v-if="stage === 0 && pill.reserved > 0" class="reserved-hint">{{ t('hud.resourceBar.reserved', { n: fmt(pill.reserved, true) }) }}</span>
          </span>
        </div>
      </div>
      <div v-if="population.max > 0" class="resource resource--compact population">
        <span class="hex-icon" style="background: var(--pop, #7fb3d5)" />
        <div class="numbers-compact">
          <span class="value-compact">{{ stageText(population.current, population.rate, population.max, true) }}</span>
        </div>
      </div>
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
/* The desktop `gap: 22px` + `.resource + .resource` separator (22px padding
   + a border) below assume roomy side-by-side desktop pills; once a narrow
   mobile pill's own value/cap/rate stack is only ~70px wide, that same 22px
   gap plus 22px padding reads as a huge blank strip ("spacing after
   numbers") between one pill's numbers and the next pill's icon. Match the
   already-established compact-mode numbers (10px gap, no border/padding
   separator) here too, for visual consistency across the two mobile states. */
/* Owner's decision, phase 3: the row must never wrap, at any phone width —
   `flex: 1 1 auto; min-width: 0` still lets the row shrink to whatever
   width `.hud-bar-right` actually has (a roomy desktop row is never
   expected to shrink, hence the base `.resource-bar` rule above being
   `flex: none`), but there is no second line to fall back to any more: once
   the row doesn't fit, `useShortNotation` (see the script above) switches
   every pill to short notation instead. */
.resource-bar.expanded {
  gap: 0;
  row-gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  justify-content: space-evenly;
}
.resource-bar.expanded .resource + .resource {
  padding-left: 0;
  border-left: none;
}
/* Owner: pills evenly distributed across the bar's full width — the same
   visible gap between every pill and at both ends (`justify-content:
   space-evenly` on the row, pills at their natural width), rather than
   equal-width slots, whose visible gaps would vary with each pill's own
   text width. When the full numbers can't keep a real gap between pills,
   the row switches to short notation (see the script above and the
   measuring row's 14px gap below) instead of letting pills touch. */
.resource-bar.expanded .resource {
  gap: 4px;
  flex: none;
}
/* A notch smaller than desktop's 14px value text so all five expanded
   pills still fit one row on a 320–375px phone instead of the population
   pill wrapping onto a line of its own. */
.resource-bar.expanded .value {
  font-size: 12px;
}
.resource-bar.expanded .hex-icon {
  width: 11px;
  height: 11px;
}
/* The shared `.fill-track` rule above carries a 64px min-width tuned for
   roomy desktop pills — on a narrow expanded mobile pill (where the cap now
   wraps onto its own line, see the `.value .cap` rule above), that floor is
   almost always wider than the "400"/"/3,000" text sitting above it, since
   `.numbers`'s default `align-items: stretch` then stretches those shorter
   text lines out to match the (wider) fill-track instead of the other way
   around. Drop the floor here so the fill-track's width is driven purely by
   `width: 100%` of its stretched `.numbers` parent, which sizes itself to
   the widest of value/cap/rate — the bar then tracks the text instead of
   overshooting it. */
.resource-bar.expanded .fill-track {
  min-width: 0;
}

/* Mobile collapsed pills only (drawer closed) — single line per pill,
   tap-cycles through stock / rate / max capacity together. Only active
   under HUD_COMPACT_QUERY (lib/breakpoints.ts) and while the drawer is
   closed; the desktop rules above are untouched, and are reused as-is for
   the mobile *expanded* state (drawer open — see ResourceBar.vue's isExpanded). */
/* Mobile HUD bar rework, phase 2 (owner's annotated screenshot): a pill
   shown half-cut at the bar's own edge was one of the two things flagged for
   removal, and finding #1/#3's horizontal scroller (this rule used to carry
   `overflow-x: auto`/`touch-action: pan-x`) is exactly how that happened —
   letting the row run wider than the bar and pan sideways to reach the rest
   means whatever the bar's edge lands on mid-scroll is, by construction,
   sliced in half. With the avatar/chevron also gone (TopBar.vue/HudNav.vue)
   the row finally has the whole bar width to itself. Phase 3 (owner's
   decision): the row must never wrap onto a second line either, at any
   phone width — see `useShortNotation`/`updateFit` in the script above for
   what happens instead once the row stops fitting. This row still doesn't
   scroll, so it still doesn't need its own `touch-action` opinion — a plain
   touch here falls through to the bar's own pull-down-drawer drag handling
   like the rest of the bar. */
.resource-bar.compact {
  gap: 0;
  row-gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  justify-content: space-evenly;
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
  /* Owner addition: pills spread evenly across the bar's full width,
     centred within their own equal-width slot — same reasoning as the
     expanded pills' rule above. A real floor (not 0): letting a pill shrink
     to 0 would only relocate the old scroller's "half-cut pill" bug into an
     "illegibly squeezed pill" one — the text would keep its own natural
     (nowrap) width regardless and spill past its own shrunk box, which is
     the same visual clipping under a different name. The floor is the
     pill's own content width (not a fixed guess — a fixed 68px basis
     wrapped the fifth pill onto its own line at 390px when all five fit),
     so short notation (see the script above) kicks in before the row would
     ever need to shrink a pill past that floor. */
  flex: none;
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
  /* No floor here on purpose — the pill's own `min-width` above already
     keeps the whole pill (icon + numbers) from wrapping too eagerly; a
     second, independent floor on just this inner column would let it force
     `.fill-track` (100% of this column's own width, just below) wider than
     the actual value/rate text sitting above it whenever that text is
     shorter than the floor — exactly the overhang issue/fix below. */
  min-width: 0;
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
/* Owner's annotated screenshot, finding 2: the collapsed track used to
   overhang the (often much shorter) value text above it — this floor was
   why. Dropping it lets `.fill-track` (width: 100%, in the shared rule
   above) track the column's real content width instead of a fixed minimum,
   same fix already applied to the expanded pills below. */
.resource-bar.compact .fill-track {
  min-width: 0;
  margin-top: 2px;
}

/* Hidden fit-measurement clone (see `updateFit` in the script above) — laid
   out off-screen, never wrapped, and with `flex: none` on its own pills so
   each one reports its true unwrapped content width instead of sharing the
   row evenly like the visible pills do. `position: fixed` takes it out of
   normal/flex flow entirely, so it can't affect `.hud-bar-right`'s real
   layout despite sitting alongside the visible `.resource-bar` as a sibling
   root node. */
.resource-bar--measure {
  position: fixed;
  top: -9999px;
  left: -9999px;
  flex-wrap: nowrap;
  width: max-content;
  visibility: hidden;
  pointer-events: none;
}
/* The breathing room full notation must leave between pills to count as
   fitting — below it the row reads as pills stuck together, so it switches
   to short notation instead. The padding counts the two outer spaces too,
   since the visible row (`gap: 0; justify-content: space-evenly`) spreads
   its free space equally over all six gaps, ends included. Needs the
   `.compact`/`.expanded` qualifier to outrank those rows' own gap. */
.resource-bar--measure.compact,
.resource-bar--measure.expanded {
  gap: 14px;
  padding: 0 14px;
}
.resource-bar--measure.compact .resource--compact,
.resource-bar--measure.expanded .resource {
  flex: none;
  min-width: 0;
  justify-content: flex-start;
}

/* Owner's decision, last resort: short notation is expected to be enough on
   every real phone width, but `updateFit` still checks — five pills' worth
   of very large numbers can still overhang a 320px bar even abbreviated.
   Rather than let that wrap or clip, drop one text size (spacing stays the
   row's own even `space-evenly` distribution). Placed
   last so it wins over the `.compact`/`.expanded` rules above at equal
   specificity. */
.resource-bar.tight-font .value-compact {
  font-size: 10px;
}
.resource-bar.tight-font .hex-icon {
  width: 10px;
  height: 10px;
}
.resource-bar.tight-font.expanded .value,
.resource-bar.tight-font.expanded .rate {
  font-size: 10px;
}
</style>
