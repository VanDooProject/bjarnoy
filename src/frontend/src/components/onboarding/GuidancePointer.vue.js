/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The animated "next click here" pointer (design handoff "2a"): a gold
// arrow bobbing over the map, with an uppercase label chip. Fixed to a hex
// via useMapAnchor so it tracks the camera as it pans/zooms.
//
// chat1: "the arrow needs to move up/down (in dir of itself) and not
// sideways (so 90° of what I want)" — the mockup faked this per fixed angle
// with a hand-picked translate vector (bob30/bob38/bob52, one keyframe per
// angle) because its *outer* wrapper carried the bob translate while only
// an inner <g> rotated the arrow shape. Nesting the bob translate *inside*
// the rotated frame instead means a single plain-vertical keyframe reads as
// "along the shaft's own axis" at any angle — no per-angle keyframe needed.
// The label chip is deliberately kept outside that rotated/bobbing frame
// (upright, positioned to the side) so it stays legible instead of tilting
// and drifting with the arrow. Its actual on-screen spot is no longer pure
// CSS, though: a requestAnimationFrame loop below measures the arrow's real
// box and the viewport/HUD-bar safe area every frame and calls
// guidanceChipPlacement.ts's `placeChip` to keep the chip fully on screen —
// see that module's own header for the phone-width bugs the CSS-only
// version had. The CSS below is only the pre-measurement fallback (first
// paint, before the first rAF tick lands) and the last resort if JS never
// gets a non-zero chip size (e.g. display:none somewhere upstream).
// Two anchor modes: a hex (`coord`+`renderer`, following the camera via
// useMapAnchor — frames 1/1b/2/4) or a fixed screen point (`screen`, the
// ring menu's own bubble spot for frame 3's "this one fits {terrain}" —
// static while the ring is open, since opening it locks camera drag).
//
// landing-page-defects.md L2: `--anchor-x/-y` (written by useMapAnchor, or
// by the `screen` watchEffect below) is the TARGET's screen point, and
// `.anchor` centres its own box there — which centres the SVG's *bounding
// box*, not the arrowhead's tip, on the target. `arrowTipOffset` computes,
// from the angle alone, the shift that puts the tip back on the target
// (minus a small standoff) instead of hardcoding a translate per angle —
// see that module's own doc comment for the full derivation. This applies
// to BOTH anchor modes identically: the centre-vs-tip mismatch is a
// property of the arrow's own geometry, not of what supplies the anchor
// point, so the hex-anchored and screen-anchored cases need the same fix.
import { computed, onUnmounted, ref, watch, watchEffect } from 'vue';
import { useMapAnchor } from '../../composables/useMapAnchor';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { HUD_COMPACT_QUERY } from '../../lib/breakpoints';
import { ARROW_TIP_GAP_PX, arrowTipOffset, HEX_TARGET_RADIUS_PX } from '../../lib/map/guidanceArrowGeometry';
import { placeChip } from '../../lib/map/guidanceChipPlacement';
import { isSettlementBubbleShown, SETTLEMENT_BUBBLE_ROW_PX, } from '../../composables/hudSettlementBubbleState';
const { defineProps, withDefaults, } = {};
const props = withDefaults(defineProps(), { angle: 38, targetRadius: HEX_TARGET_RADIUS_PX, tipGap: ARROW_TIP_GAP_PX, scale: 1, chipSide: 'left', avoid: () => [] });
const anchorEl = ref(null);
// Restarting a CSS animation needs the class off for one frame: a tap during a running poke starts it over.
const poking = ref(false);
let pokeFrame = 0;
watch(() => props.nudge, () => {
    poking.value = false;
    cancelAnimationFrame(pokeFrame);
    pokeFrame = requestAnimationFrame(() => {
        poking.value = true;
    });
});
onUnmounted(() => cancelAnimationFrame(pokeFrame));
useMapAnchor(anchorEl, () => (props.coord ? props.renderer : null), () => props.coord ?? null);
watchEffect(() => {
    const screen = props.screen;
    const el = anchorEl.value;
    if (!screen || !el)
        return;
    el.style.setProperty('--anchor-x', `${screen.x}px`);
    el.style.setProperty('--anchor-y', `${screen.y}px`);
});
// `angle` is a static prop per pointer target (it changes only when the
// guidance step changes, not every frame the way the anchor position does),
// so a plain computed — recalculated on prop change, not per animation
// frame — is the right cost here.
const tipOffset = computed(() => arrowTipOffset(props.angle, props.targetRadius, props.tipGap, props.scale));
// Keeps the label chip fully on screen, clear of the HUD bar, instead of the
// old CSS-only placement (side of the arrow on desktop, centred above it on
// mobile) which had no idea where the viewport edges or the HUD bar actually
// were — see guidanceChipPlacement.ts's header for the two phone-width bugs
// that CSS-only approach produced. `.rotate`'s box (not `.bob`'s, which bobs
// every frame) is used as the arrow's box: `.bob` sits inside `.rotate` and
// its animation would otherwise make the chip jitter with the bob.
const chipEl = ref(null);
const rotateEl = ref(null);
const shiftEl = ref(null);
// `chipSide` is desktop-only; below 768px "above" reads better regardless of
// the prop, matching the old media query's intent (see the CSS comment).
const isMobile = useMediaQuery('(max-width: 768px)');
// A short landscape phone (844x390) is wider than 768px but its founding hero
// is still a block the chip has to clear (LandingView's `(max-height: 500px)`
// left column sits right where the plot's chip lands), so the clearance below
// follows the whole phone HUD breakpoint, not just the narrow-width one.
const isCompactHud = useMediaQuery(HUD_COMPACT_QUERY);
function insetPx(styles, name) {
    const value = parseFloat(styles.getPropertyValue(name));
    return Number.isFinite(value) ? value : 0;
}
let lastLeft = null;
let lastTop = null;
let frame = requestAnimationFrame(tick);
function tick() {
    frame = requestAnimationFrame(tick);
    const chip = chipEl.value;
    const rotate = rotateEl.value;
    const shift = shiftEl.value;
    const anchor = anchorEl.value;
    if (!chip || !rotate || !shift || !anchor)
        return;
    const width = chip.offsetWidth;
    const height = chip.offsetHeight;
    // Zero-sized — not actually laid out yet (async canvas mount, or jsdom in
    // unit tests, which never runs layout at all). Leave the CSS fallback in
    // place rather than placing a phantom zero-size box.
    if (width === 0 || height === 0)
        return;
    const arrowRect = rotate.getBoundingClientRect();
    const anchorStyles = getComputedStyle(anchor);
    // On phones the settlement bubble sits in a row just below the bar —
    // keep the chip clear of it too.
    const overlayRows = isMobile.value && isSettlementBubbleShown.value ? SETTLEMENT_BUBBLE_ROW_PX : 0;
    let clearBelow = 0;
    if (isCompactHud.value && props.clearBelowSelector) {
        // Every match counts (the founding hero, then the landfall banner that
        // replaces it at the top once a plot is claimed), not just the first.
        for (const block of document.querySelectorAll(props.clearBelowSelector)) {
            const rect = block.getBoundingClientRect();
            if (rect.height > 0)
                clearBelow = Math.max(clearBelow, rect.bottom + 6);
        }
    }
    const safe = {
        // The landscape rail's width (0 elsewhere) — the chip stays right of it.
        left: insetPx(anchorStyles, '--hud-inset-left') + 8,
        top: Math.max(insetPx(anchorStyles, '--hud-inset-top') + 8 + overlayRows, clearBelow),
        right: window.innerWidth - 8,
        bottom: window.innerHeight - insetPx(anchorStyles, '--hud-inset-bottom') - 8,
    };
    const prefer = isMobile.value ? 'above' : props.chipSide;
    const placement = placeChip({ left: arrowRect.left, top: arrowRect.top, right: arrowRect.right, bottom: arrowRect.bottom }, { width, height }, safe, prefer, undefined, props.avoid);
    // `.chip` is `position: absolute` inside `.shift`, which carries a
    // `translate()` — any transform makes an element the containing block for
    // its absolutely-positioned descendants, so `.shift`'s own (transformed)
    // box, not `.anchor`'s, is what the chip's `left`/`top` are relative to.
    const shiftRect = shift.getBoundingClientRect();
    const left = `${placement.x - shiftRect.left}px`;
    const top = `${placement.y - shiftRect.top}px`;
    if (lastLeft === null) {
        // First measured placement: drop the CSS fallback's anchoring for good.
        chip.style.right = 'auto';
        chip.style.bottom = 'auto';
        chip.style.transform = 'none';
    }
    if (left !== lastLeft) {
        chip.style.left = left;
        lastLeft = left;
    }
    if (top !== lastTop) {
        chip.style.top = top;
        lastTop = top;
    }
}
onUnmounted(() => cancelAnimationFrame(frame));
const __VLS_defaults = { angle: 38, targetRadius: HEX_TARGET_RADIUS_PX, tipGap: ARROW_TIP_GAP_PX, scale: 1, chipSide: 'left', avoid: () => [] };
void __VLS_defaults;
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
    __VLS_withDotValue(tipOffset, {});
    __VLS_withDotValue(poking, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['bob']} */ ;
    /** @type {__VLS_StyleScopedClasses['poke']} */ ;
    /** @type {__VLS_StyleScopedClasses['poke']} */ ;
    /** @type {__VLS_StyleScopedClasses['poking']} */ ;
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['left']} */ ;
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['right']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "anchorEl",
        ...{ class: "anchor" },
        'data-testid': "guidance-pointer",
        ...{ style: ({ '--rotate': `${__VLS_ctx.angle}deg`, '--scale': __VLS_ctx.scale, '--tip-dx': `${tipOffset.value.x}px`, '--tip-dy': `${tipOffset.value.y}px` }) },
    });
    /** @type {__VLS_StyleScopedClasses['anchor']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "shiftEl",
        ...{ class: "shift" },
    });
    /** @type {__VLS_StyleScopedClasses['shift']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "rotateEl",
        ...{ class: "rotate" },
    });
    /** @type {__VLS_StyleScopedClasses['rotate']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "bob" },
    });
    /** @type {__VLS_StyleScopedClasses['bob']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onAnimationend: (...[$event]) => {
                void $event;
                return (poking.value = false);
                // @ts-ignore
                [angle, scale, tipOffset, tipOffset, poking,];
            } },
        ...{ class: "poke" },
        ...{ class: ({ poking: poking.value }) },
        'data-testid': "guidance-poke",
    });
    /** @type {__VLS_StyleScopedClasses['poke']} */ ;
    /** @type {__VLS_StyleScopedClasses['poking']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
        width: "110",
        height: "110",
        viewBox: "0 0 150 150",
        ...{ class: "arrow-svg" },
    });
    /** @type {__VLS_StyleScopedClasses['arrow-svg']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "60",
        y: "14",
        width: "30",
        height: "66",
        rx: "9",
        fill: "#ffc55c",
        stroke: "#20160a",
        'stroke-width': "4",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
        points: "75,136 32,72 118,72",
        fill: "#ffc55c",
        stroke: "#20160a",
        'stroke-width': "4",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "chipEl",
        ...{ class: "chip" },
        ...{ class: (__VLS_ctx.chipSide) },
    });
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    (__VLS_ctx.label);
    // @ts-ignore
    [poking, chipSide, label,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
