/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Issue #16 "header": resource icons redrawn as hexes (the mockup's
// diamonds), and population wired up as a fifth pill exactly like the other
// four (current/max stock + a rate) instead of being unimplemented — see
// `WorldModel.populationFor` / `stores/world.ts`'s `hud.population`. Each
// pill also carries a cap (`WorldModel.storageCapForDisplay`) and a fill-progress
// underline, matching the reference's "4,965 / 12,000" + green bar.
//
// Mobile HUD bar rework: below HUD_COMPACT_QUERY (and, on desktop, whenever the
// full row doesn't fit beside the nav, see `desktopCollapsed`) there simply isn't room for
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { isHudDrawerOpen } from '../../composables/hudDrawerOpenState';
import { isHudRail } from '../../composables/hudSettlementBubbleState';
import { HUD_COMPACT_QUERY, HUD_RAIL_TALL_QUERY } from '../../lib/breakpoints';
import { formatHudNumber } from '../../lib/hud/compactNumber';
import { animate, motionEnabled } from '../../lib/motion';
const { defineProps, } = {};
const props = defineProps();
const world = useWorldStore();
const { t, locale } = useI18n({ useScope: 'global' });
const isCompact = useMediaQuery(HUD_COMPACT_QUERY);
// Landscape rail (TopBar.vue's `isHudRail`): the pills are a column of
// separate floating bubbles at a fixed width, never the pull-down drawer's
// "expanded" layout and never measured against a row — see `updateFit`.
// One line per pill by default (the usual stock -> rate -> cap tap cycle);
// two lines (stock, then rate or cap) once the viewport is tall enough.
const isRail = computed(() => isCompact.value && isHudRail.value);
const isTall = useMediaQuery(HUD_RAIL_TALL_QUERY);
const railTwoLine = computed(() => isRail.value && isTall.value);
const isExpanded = computed(() => isCompact.value && isHudDrawerOpen.value && !isRail.value);
// Desktop: the bar takes the room left beside the nav, and when the full
// desktop row (stacked value / rate / fill per pill) doesn't fit it, it
// renders the very same collapsed pills the phone uses (one line per pill,
// tap cycles stock -> rate -> cap, short "k"/"M" notation once even those
// don't fit) instead of running out under the realm name. Decided by
// `updateFit` below against the hidden full desktop row, never against what
// is on screen.
const desktopCollapsed = ref(false);
/** Whether the collapsed one-line pills are showing (always on a phone, on desktop only when the full row doesn't fit). */
const collapsed = computed(() => isCompact.value || desktopCollapsed.value);
// Issue #158: each pill's fill track gains a dim reserved segment — the
// stock is not split into two bars, `reserved` is a *portion* of `value`
// already sitting in stock, earmarked for the waiting build queue and
// unspendable elsewhere. Always zero in demo mode (`hud.reserved` never
// changes from its empty default there — see stores/world.ts).
// X8: after a confirmed build the affected pills count down from the old to the
// new value instead of snapping. `tickBack` is the part of the spend the number
// has not come down by yet; it is added to the live stock (so production ticks
// keep showing meanwhile) and shrinks to zero over TICK_DOWN_MS. Driven by the
// store's explicit `hud.lastSpend` event, never by watching the values: an
// ordinary production tick must not trigger it.
const TICK_DOWN_MS = 420;
const tickBack = reactive({ wood: 0, stone: 0, food: 0, iron: 0 });
const tickFrames = new Map();
function tickDown(kind, amount) {
    cancelTick(kind);
    const t0 = performance.now();
    tickBack[kind] = amount;
    const step = (now) => {
        const k = Math.min(1, (now - t0) / TICK_DOWN_MS);
        tickBack[kind] = amount * (1 - k);
        if (k < 1)
            tickFrames.set(kind, requestAnimationFrame(step));
        else
            tickFrames.delete(kind);
    };
    tickFrames.set(kind, requestAnimationFrame(step));
}
function cancelTick(kind) {
    const frame = tickFrames.get(kind);
    if (frame !== undefined)
        cancelAnimationFrame(frame);
    tickFrames.delete(kind);
    tickBack[kind] = 0;
}
watch(() => world.hud.lastSpend, async (spend) => {
    if (!spend)
        return;
    const kinds = Object.keys(spend.cost).filter((kind) => (spend.cost[kind] ?? 0) > 0);
    if (motionEnabled())
        for (const kind of kinds)
            tickDown(kind, spend.cost[kind]);
    await nextTick();
    for (const kind of kinds) {
        for (const el of barRef.value?.querySelectorAll(`[data-res="${kind}"]`) ?? []) {
            // A red flash that eases back to the pill's own colours; a plain short fade under reduced motion.
            const flash = [{ offset: 0, color: '#f0a396', background: 'rgba(226,112,95,.45)' }];
            void animate(el, flash, { duration: 650, easing: 'ease-out', reduced: flash });
        }
    }
});
onBeforeUnmount(() => {
    for (const kind of [...tickFrames.keys()])
        cancelTick(kind);
});
const pills = computed(() => [
    { key: 'wood', color: 'var(--wood)', value: world.hud.resources.wood + tickBack.wood, rate: world.hud.rates.wood, cap: world.hud.storageCap.wood, reserved: world.hud.reserved.wood },
    { key: 'stone', color: 'var(--stone)', value: world.hud.resources.stone + tickBack.stone, rate: world.hud.rates.stone, cap: world.hud.storageCap.stone, reserved: world.hud.reserved.stone },
    { key: 'food', color: 'var(--food)', value: world.hud.resources.food + tickBack.food, rate: world.hud.rates.food, cap: world.hud.storageCap.food, reserved: world.hud.reserved.food },
    { key: 'iron', color: 'var(--iron)', value: world.hud.resources.iron + tickBack.iron, rate: world.hud.rates.iron, cap: world.hud.storageCap.iron, reserved: world.hud.reserved.iron },
]);
const population = computed(() => world.hud.population);
// --- Number formatting (full by default, short only once measured to not fit) ---
/** Whether the collapsed row is currently showing short "k"/"M" notation instead of full grouped numbers. Only ever true while the collapsed pills show. */
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
function fmt(value, forceFull = false) {
    return formatHudNumber(Math.floor(value), locale.value, forceFull ? false : useShortNotation.value);
}
/** A rate carries its own sign (`+60/h`, `-12/h`) — `formatHudNumber` already signs negatives, so only the positive case needs a `+` added here. */
function fmtRate(rate, forceFull = false) {
    const rounded = Math.round(rate);
    const formatted = formatHudNumber(rounded, locale.value, forceFull ? false : useShortNotation.value);
    return rounded < 0 ? formatted : `+${formatted}`;
}
function fillPct(value, cap) {
    return cap > 0 ? Math.min(100, Math.max(0, (value / cap) * 100)) : 0;
}
/**
 * The reserved segment's own left offset and width within the track, as
 * percentages of `cap` — positioned as the trailing (highest-stock) slice of
 * the filled bar: from `(value - reserved) / cap` to `value / cap`. Reserved
 * can never exceed the stock it's carved out of, so this never runs past
 * `fillPct`.
 */
function reservedSegment(value, reserved, cap) {
    if (cap <= 0)
        return { left: 0, width: 0 };
    const clampedReserved = Math.max(0, Math.min(reserved, value));
    const left = Math.max(0, Math.min(100, ((value - clampedReserved) / cap) * 100));
    const width = Math.max(0, Math.min(100 - left, (clampedReserved / cap) * 100));
    return { left, width };
}
const STAGE_COUNT = 3;
const AUTO_REVERT_MS = 6000;
const stage = ref(0);
let revertTimer = null;
function clearRevertTimer() {
    if (revertTimer) {
        clearTimeout(revertTimer);
        revertTimer = null;
    }
}
function cycle() {
    stage.value = ((stage.value + 1) % STAGE_COUNT);
    clearRevertTimer();
    if (stage.value !== 0) {
        revertTimer = setTimeout(() => {
            stage.value = 0;
            revertTimer = null;
        }, AUTO_REVERT_MS);
    }
}
onBeforeUnmount(clearRevertTimer);
const line2 = ref(0);
function cycleLine2() {
    line2.value = (line2.value === 0 ? 1 : 0);
    clearRevertTimer();
    if (line2.value !== 0) {
        revertTimer = setTimeout(() => {
            line2.value = 0;
            revertTimer = null;
        }, AUTO_REVERT_MS);
    }
}
function onPillTap() {
    if (railTwoLine.value)
        cycleLine2();
    else
        cycle();
}
function line2Text(rate, cap) {
    return line2.value === 1 ? t('hud.resourceBar.capSuffix', { n: fmt(cap) }) : t('hud.resourceBar.rate', { n: fmtRate(rate) });
}
/** The text a rail pill shows (both lines, for the aria-label) — in two-line mode the stock and its second line, otherwise the one cycling line. */
function pillSummary(value, rate, cap) {
    return railTwoLine.value ? `${fmt(value)} ${line2Text(rate, cap)}` : stageText(value, rate, cap);
}
// Cap stage now reuses the exact same "/{n}" the expanded view's cap line
// shows (owner's call — a bare "/3,000" reads as continuing the "current"
// line's own cap, exactly like the expanded pill directly above it does),
// not a standalone "max {n}" label.
function stageText(value, rate, cap, forceFull = false) {
    if (stage.value === 1)
        return t('hud.resourceBar.rate', { n: fmtRate(rate, forceFull) });
    if (stage.value === 2)
        return t('hud.resourceBar.capSuffix', { n: fmt(cap, forceFull) });
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
const barRef = ref(null);
const measureRef = ref(null);
/** Desktop only: hidden clone of the full desktop row (full notation), what `desktopCollapsed` is judged against. */
const desktopMeasureRef = ref(null);
let resizeObserver = null;
/** Smallest evenly spread gap short notation may leave before the font steps down a size. */
const MIN_TIGHT_GAP_PX = 8;
/** The rail's pills have a fixed width: numbers of six digits and up switch to "k"/"M" together. */
const RAIL_SHORT_FROM = 100_000;
async function updateFit() {
    if (!isCompact.value) {
        // Desktop: does the full row fit the room beside the nav? Always judged
        // against the hidden desktop clone, never the row on screen, so the
        // decision cannot flip-flop at the boundary. When it doesn't fit, the
        // collapsed pills take over and the short-notation step below applies.
        if (!desktopMeasureRef.value)
            await nextTick();
        const desktopBar = barRef.value;
        const desktopMeasure = desktopMeasureRef.value;
        if (!desktopBar || !desktopMeasure)
            return;
        const fits = desktopMeasure.scrollWidth <= desktopBar.clientWidth;
        desktopCollapsed.value = !fits;
        if (fits) {
            useShortNotation.value = false;
            useTightFont.value = false;
            return;
        }
        // Let the collapsed markup and its measuring clone render first.
        await nextTick();
    }
    else {
        desktopCollapsed.value = false;
    }
    if (isRail.value) {
        // No row to measure: the rail is a fixed-width column, so only the size
        // of the numbers decides, and the font never steps down.
        const all = [...pills.value, { value: population.value.current, rate: population.value.rate, cap: population.value.max }];
        useShortNotation.value = all.some((p) => Math.max(Math.abs(p.value), Math.abs(p.rate), Math.abs(p.cap)) >= RAIL_SHORT_FROM);
        useTightFont.value = false;
        return;
    }
    const bar = barRef.value;
    const measure = measureRef.value;
    if (!bar || !measure)
        return;
    const needsShort = measure.scrollWidth > bar.clientWidth;
    useShortNotation.value = needsShort;
    useTightFont.value = false;
    if (!needsShort)
        return;
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
watch([pills, population, stage, isExpanded, isCompact, isRail, locale], () => void updateFit(), { deep: true });
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(collapsed, {});
    __VLS_withDotValue(isExpanded, {});
    __VLS_withDotValue(population, {});
    __VLS_withDotValue(railTwoLine, {});
    __VLS_withDotValue(stage, {});
    __VLS_withDotValue(isRail, {});
    __VLS_withDotValue(line2, {});
    __VLS_withDotValue(isCompact, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    /** @type {__VLS_StyleScopedClasses['cap']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['fill-track']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource--compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource--compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource--compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['value-compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['value-compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['fill-track']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource--compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource--compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource--compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource--compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['numbers-compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['value-compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['reserved-hint']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['fill-track']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--rail-2']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['fill-track']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--measure']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--measure']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--measure']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource--compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--measure']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['value-compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['tight-font']} */ ;
    /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['tight-font']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['tight-font']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['rate']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "barRef",
        ...{ class: "resource-bar" },
        ...{ class: ({
                disabled: props.ringOpen,
                compact: collapsed.value && !isExpanded.value,
                expanded: isExpanded.value,
                'tight-font': __VLS_unwrap(useTightFont, {}),
                'resource-bar--rail': isRail.value,
                'resource-bar--rail-2': railTwoLine.value,
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['tight-font']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--rail']} */ ;
    /** @type {__VLS_StyleScopedClasses['resource-bar--rail-2']} */ ;
    if (!collapsed.value || isExpanded.value) {
        const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(pills, {})));
        for (const [pill] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (pill.key),
                ...{ class: "resource" },
                'data-res': (pill.key),
            });
            /** @type {__VLS_StyleScopedClasses['resource']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "hex-icon" },
                ...{ style: ({ background: pill.color }) },
            });
            /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "numbers" },
            });
            /** @type {__VLS_StyleScopedClasses['numbers']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "value" },
            });
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            (fmt(pill.value));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cap" },
            });
            /** @type {__VLS_StyleScopedClasses['cap']} */ ;
            (__VLS_unwrap(t, {})('hud.resourceBar.capSuffix', { n: fmt(pill.cap) }));
            if (pill.reserved > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "reserved-hint" },
                });
                /** @type {__VLS_StyleScopedClasses['reserved-hint']} */ ;
                (__VLS_unwrap(t, {})('hud.resourceBar.reserved', { n: fmt(pill.reserved) }));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "rate" },
            });
            /** @type {__VLS_StyleScopedClasses['rate']} */ ;
            (__VLS_unwrap(t, {})('hud.resourceBar.rate', { n: fmtRate(pill.rate) }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "fill-track" },
            });
            /** @type {__VLS_StyleScopedClasses['fill-track']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "fill" },
                ...{ style: ({ width: fillPct(pill.value, pill.cap) + '%', background: pill.color }) },
            });
            /** @type {__VLS_StyleScopedClasses['fill']} */ ;
            if (pill.reserved > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                    ...{ class: "fill-reserved" },
                    ...{ style: ({
                            left: reservedSegment(pill.value, pill.reserved, pill.cap).left + '%',
                            width: reservedSegment(pill.value, pill.reserved, pill.cap).width + '%',
                        }) },
                });
                /** @type {__VLS_StyleScopedClasses['fill-reserved']} */ ;
            }
            // @ts-ignore
            [collapsed, collapsed, isExpanded, isExpanded, isExpanded, useTightFont, isRail, railTwoLine, pills, t, t, t,];
        }
        if (population.value.max > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "resource population" },
            });
            /** @type {__VLS_StyleScopedClasses['resource']} */ ;
            /** @type {__VLS_StyleScopedClasses['population']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "hex-icon" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "numbers" },
            });
            /** @type {__VLS_StyleScopedClasses['numbers']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "value" },
            });
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            (fmt(population.value.current));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cap" },
            });
            /** @type {__VLS_StyleScopedClasses['cap']} */ ;
            (__VLS_unwrap(t, {})('hud.resourceBar.capSuffix', { n: fmt(population.value.max) }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "rate" },
            });
            /** @type {__VLS_StyleScopedClasses['rate']} */ ;
            (__VLS_unwrap(t, {})('hud.resourceBar.rate', { n: fmtRate(population.value.rate) }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "fill-track" },
            });
            /** @type {__VLS_StyleScopedClasses['fill-track']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "fill" },
                ...{ style: ({ width: fillPct(population.value.current, population.value.max) + '%', background: 'var(--pop, #7fb3d5)' }) },
            });
            /** @type {__VLS_StyleScopedClasses['fill']} */ ;
        }
    }
    else {
        const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(pills, {})));
        for (const [pill] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (onPillTap) },
                key: (pill.key),
                type: "button",
                ...{ class: "resource resource--compact" },
                'data-res': (pill.key),
                'data-stage': (stage.value),
                'aria-label': (__VLS_unwrap(t, {})(`catalogue.resources.${pill.key}`) + ': ' + pillSummary(pill.value, pill.rate, pill.cap)),
            });
            /** @type {__VLS_StyleScopedClasses['resource']} */ ;
            /** @type {__VLS_StyleScopedClasses['resource--compact']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "hex-icon" },
                ...{ style: ({ background: pill.color }) },
            });
            /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "numbers-compact" },
            });
            /** @type {__VLS_StyleScopedClasses['numbers-compact']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "value-compact" },
                ...{ class: (railTwoLine.value ? 'stage-0' : `stage-${stage.value}`) },
            });
            /** @type {__VLS_StyleScopedClasses['value-compact']} */ ;
            (railTwoLine.value ? fmt(pill.value) : stageText(pill.value, pill.rate, pill.cap));
            if (stage.value === 0 && pill.reserved > 0 && !isRail.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "reserved-hint" },
                });
                /** @type {__VLS_StyleScopedClasses['reserved-hint']} */ ;
                (__VLS_unwrap(t, {})('hud.resourceBar.reserved', { n: fmt(pill.reserved) }));
            }
            if (railTwoLine.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "value-compact value-line2" },
                    ...{ class: (line2.value === 0 ? 'stage-1' : 'stage-2') },
                });
                /** @type {__VLS_StyleScopedClasses['value-compact']} */ ;
                /** @type {__VLS_StyleScopedClasses['value-line2']} */ ;
                (line2Text(pill.rate, pill.cap));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "fill-track" },
            });
            /** @type {__VLS_StyleScopedClasses['fill-track']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "fill" },
                ...{ style: ({ width: fillPct(pill.value, pill.cap) + '%', background: pill.color }) },
            });
            /** @type {__VLS_StyleScopedClasses['fill']} */ ;
            if (pill.reserved > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                    ...{ class: "fill-reserved" },
                    ...{ style: ({
                            left: reservedSegment(pill.value, pill.reserved, pill.cap).left + '%',
                            width: reservedSegment(pill.value, pill.reserved, pill.cap).width + '%',
                        }) },
                });
                /** @type {__VLS_StyleScopedClasses['fill-reserved']} */ ;
            }
            // @ts-ignore
            [isRail, railTwoLine, railTwoLine, railTwoLine, pills, t, t, t, t, population, population, population, population, population, population, stage, stage, stage, line2,];
        }
        if (population.value.max > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (onPillTap) },
                type: "button",
                ...{ class: "resource resource--compact population" },
                'data-stage': (stage.value),
                'aria-label': (__VLS_unwrap(t, {})('hud.nav.settlement') + ': ' + pillSummary(population.value.current, population.value.rate, population.value.max)),
            });
            /** @type {__VLS_StyleScopedClasses['resource']} */ ;
            /** @type {__VLS_StyleScopedClasses['resource--compact']} */ ;
            /** @type {__VLS_StyleScopedClasses['population']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "hex-icon" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "numbers-compact" },
            });
            /** @type {__VLS_StyleScopedClasses['numbers-compact']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "value-compact" },
                ...{ class: (railTwoLine.value ? 'stage-0' : `stage-${stage.value}`) },
            });
            /** @type {__VLS_StyleScopedClasses['value-compact']} */ ;
            (railTwoLine.value ? fmt(population.value.current) : stageText(population.value.current, population.value.rate, population.value.max));
            if (railTwoLine.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "value-compact value-line2" },
                    ...{ class: (line2.value === 0 ? 'stage-1' : 'stage-2') },
                });
                /** @type {__VLS_StyleScopedClasses['value-compact']} */ ;
                /** @type {__VLS_StyleScopedClasses['value-line2']} */ ;
                (line2Text(population.value.rate, population.value.max));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "fill-track" },
            });
            /** @type {__VLS_StyleScopedClasses['fill-track']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "fill" },
                ...{ style: ({ width: fillPct(population.value.current, population.value.max) + '%', background: 'var(--pop, #7fb3d5)' }) },
            });
            /** @type {__VLS_StyleScopedClasses['fill']} */ ;
        }
    }
    if (collapsed.value && !isRail.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "measureRef",
            ...{ class: "resource-bar resource-bar--measure" },
            ...{ class: ({ compact: !isExpanded.value, expanded: isExpanded.value }) },
            'aria-hidden': "true",
            'data-measure': "true",
            inert: true,
        });
        /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
        /** @type {__VLS_StyleScopedClasses['resource-bar--measure']} */ ;
        /** @type {__VLS_StyleScopedClasses['compact']} */ ;
        /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
        if (isExpanded.value) {
            const __VLS_2 = __VLS_tryAsConstant((__VLS_unwrap(pills, {})));
            for (const [pill] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (pill.key),
                    ...{ class: "resource" },
                });
                /** @type {__VLS_StyleScopedClasses['resource']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                    ...{ class: "hex-icon" },
                    ...{ style: ({ background: pill.color }) },
                });
                /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "numbers" },
                });
                /** @type {__VLS_StyleScopedClasses['numbers']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (fmt(pill.value, true));
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "cap" },
                });
                /** @type {__VLS_StyleScopedClasses['cap']} */ ;
                (__VLS_unwrap(t, {})('hud.resourceBar.capSuffix', { n: fmt(pill.cap, true) }));
                if (pill.reserved > 0) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "reserved-hint" },
                    });
                    /** @type {__VLS_StyleScopedClasses['reserved-hint']} */ ;
                    (__VLS_unwrap(t, {})('hud.resourceBar.reserved', { n: fmt(pill.reserved, true) }));
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "rate" },
                });
                /** @type {__VLS_StyleScopedClasses['rate']} */ ;
                (__VLS_unwrap(t, {})('hud.resourceBar.rate', { n: fmtRate(pill.rate, true) }));
                // @ts-ignore
                [collapsed, isExpanded, isExpanded, isExpanded, isRail, railTwoLine, railTwoLine, railTwoLine, pills, t, t, t, t, population, population, population, population, population, population, population, population, population, population, population, population, stage, stage, line2,];
            }
            if (population.value.max > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "resource population" },
                });
                /** @type {__VLS_StyleScopedClasses['resource']} */ ;
                /** @type {__VLS_StyleScopedClasses['population']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                    ...{ class: "hex-icon" },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "numbers" },
                });
                /** @type {__VLS_StyleScopedClasses['numbers']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (fmt(population.value.current, true));
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "cap" },
                });
                /** @type {__VLS_StyleScopedClasses['cap']} */ ;
                (__VLS_unwrap(t, {})('hud.resourceBar.capSuffix', { n: fmt(population.value.max, true) }));
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "rate" },
                });
                /** @type {__VLS_StyleScopedClasses['rate']} */ ;
                (__VLS_unwrap(t, {})('hud.resourceBar.rate', { n: fmtRate(population.value.rate, true) }));
            }
        }
        else {
            const __VLS_3 = __VLS_tryAsConstant((__VLS_unwrap(pills, {})));
            for (const [pill] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (pill.key),
                    ...{ class: "resource resource--compact" },
                });
                /** @type {__VLS_StyleScopedClasses['resource']} */ ;
                /** @type {__VLS_StyleScopedClasses['resource--compact']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                    ...{ class: "hex-icon" },
                    ...{ style: ({ background: pill.color }) },
                });
                /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "numbers-compact" },
                });
                /** @type {__VLS_StyleScopedClasses['numbers-compact']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "value-compact" },
                });
                /** @type {__VLS_StyleScopedClasses['value-compact']} */ ;
                (stageText(pill.value, pill.rate, pill.cap, true));
                if (stage.value === 0 && pill.reserved > 0) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "reserved-hint" },
                    });
                    /** @type {__VLS_StyleScopedClasses['reserved-hint']} */ ;
                    (__VLS_unwrap(t, {})('hud.resourceBar.reserved', { n: fmt(pill.reserved, true) }));
                }
                // @ts-ignore
                [pills, t, t, t, population, population, population, population, stage,];
            }
            if (population.value.max > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "resource resource--compact population" },
                });
                /** @type {__VLS_StyleScopedClasses['resource']} */ ;
                /** @type {__VLS_StyleScopedClasses['resource--compact']} */ ;
                /** @type {__VLS_StyleScopedClasses['population']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                    ...{ class: "hex-icon" },
                    ...{ style: {} },
                });
                /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "numbers-compact" },
                });
                /** @type {__VLS_StyleScopedClasses['numbers-compact']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "value-compact" },
                });
                /** @type {__VLS_StyleScopedClasses['value-compact']} */ ;
                (stageText(population.value.current, population.value.rate, population.value.max, true));
            }
        }
    }
    if (!isCompact.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "desktopMeasureRef",
            ...{ class: "resource-bar resource-bar--measure" },
            'aria-hidden': "true",
            'data-measure': "desktop",
            inert: true,
        });
        /** @type {__VLS_StyleScopedClasses['resource-bar']} */ ;
        /** @type {__VLS_StyleScopedClasses['resource-bar--measure']} */ ;
        const __VLS_4 = __VLS_tryAsConstant((__VLS_unwrap(pills, {})));
        for (const [pill] of __VLS_vFor(__VLS_nonNull(__VLS_4))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (pill.key),
                ...{ class: "resource" },
            });
            /** @type {__VLS_StyleScopedClasses['resource']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "hex-icon" },
                ...{ style: ({ background: pill.color }) },
            });
            /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "numbers" },
            });
            /** @type {__VLS_StyleScopedClasses['numbers']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "value" },
            });
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            (fmt(pill.value, true));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cap" },
            });
            /** @type {__VLS_StyleScopedClasses['cap']} */ ;
            (__VLS_unwrap(t, {})('hud.resourceBar.capSuffix', { n: fmt(pill.cap, true) }));
            if (pill.reserved > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "reserved-hint" },
                });
                /** @type {__VLS_StyleScopedClasses['reserved-hint']} */ ;
                (__VLS_unwrap(t, {})('hud.resourceBar.reserved', { n: fmt(pill.reserved, true) }));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "rate" },
            });
            /** @type {__VLS_StyleScopedClasses['rate']} */ ;
            (__VLS_unwrap(t, {})('hud.resourceBar.rate', { n: fmtRate(pill.rate, true) }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "fill-track" },
            });
            /** @type {__VLS_StyleScopedClasses['fill-track']} */ ;
            // @ts-ignore
            [pills, t, t, t, population, population, population, population, isCompact,];
        }
        if (population.value.max > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "resource population" },
            });
            /** @type {__VLS_StyleScopedClasses['resource']} */ ;
            /** @type {__VLS_StyleScopedClasses['population']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "hex-icon" },
                ...{ style: {} },
            });
            /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "numbers" },
            });
            /** @type {__VLS_StyleScopedClasses['numbers']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "value" },
            });
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            (fmt(population.value.current, true));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cap" },
            });
            /** @type {__VLS_StyleScopedClasses['cap']} */ ;
            (__VLS_unwrap(t, {})('hud.resourceBar.capSuffix', { n: fmt(population.value.max, true) }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "rate" },
            });
            /** @type {__VLS_StyleScopedClasses['rate']} */ ;
            (__VLS_unwrap(t, {})('hud.resourceBar.rate', { n: fmtRate(population.value.rate, true) }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "fill-track" },
            });
            /** @type {__VLS_StyleScopedClasses['fill-track']} */ ;
        }
    }
    // @ts-ignore
    [t, t, population, population, population, population,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
