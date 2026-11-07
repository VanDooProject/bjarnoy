/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Visual on/off switches for the water shader's individual mechanisms
// (waterDebugFlags) — the console-only window.__waterDebug hook (main.ts)
// needs devtools and a pan/zoom afterward to see anything change; this panel
// does both from a click. Mounted by SettlementView.vue *and* WorldMapView.vue
// under ?debug=1, since the feature ships in both views — see useFogDebug for
// why that flag is session-persisted rather than read off the query string.
import { reactive, watch } from 'vue';
import DebugPanel from './DebugPanel.vue';
import { BOG_LAKE_FOAM_STYLES, waterDebugFlags, waterDebugTuning, } from '../../lib/map/water/waterDebug';
const { defineEmits, } = {};
/** The multiplier sliders all read as "1.00x"; 1.00 is what ships. */
const times = (v) => `${v.toFixed(2)}\u00d7`;
const emit = defineEmits();
// waterDebugFlags itself stays a plain object — the renderer reads it directly
// on the hot path and HexMapRenderer.ts is deliberately Vue-reactivity-free.
// Wrapping it here keeps that boundary: this reactive() proxy forwards every
// write through to the same underlying object, so the two stay in sync without
// the renderer importing Vue at all. Same as FogDebugPanel does.
const flags = reactive(waterDebugFlags);
const tuning = reactive(waterDebugTuning);
/** The looks of the river overlay, by `riverStyle`. */
const RIVER_STYLES = ['Ripple arcs', 'Toon strands', 'Cartoon bands', 'Flow streaks', 'Bands + streaks'];
const LABELS = {
    water: 'Water layer enabled',
    midWaterWaves: 'Surface pattern (caustics close / waves far)',
    causticsEverywhere: 'Debug: caustics on the world map too',
    coarseCaustics: 'Caustics: coarse net',
    fineCaustics: 'Caustics: fine highlight net',
    causticShadows: 'Caustics: drifting dark blobs',
    shorelineFoam: 'Shoreline foam',
    seaBody: 'Sea body (world map; off = CSS gradient)',
    legacyWaveSquiggles: 'World map: Graphics wave squiggles',
    showWaterMask: 'Debug: show the raw water mask',
    riverFlow: 'River ripples (settlement)',
    showRiverFlow: 'Debug: show river ripple phase',
    legacyTileSplit: 'Split unsplit tall art in code',
    bogLakeFoam: 'Bog lakes: gust foam lines',
    bogLakeSheen: 'Bog lakes: gust sheen',
    bogLakeCatsPaws: "Bog lakes: gust cat's paws",
    bogLakeBlops: 'Bog lakes: blops (ripple crescents)',
};
// Brackets the shipped values on both sides, so "is this too wide / too still"
// is answerable by eye on a live map instead of by rebuilding between guesses.
const FOAM_WIDTH = { min: 0.1, max: 1.5, step: 0.05 };
const FOAM_SURGE = { min: 0, max: 1, step: 0.05 };
const WAVE_SPEED = { min: 0, max: 3, step: 0.1 };
// Up to the mask's own far range: past 1.5 hexes the distance channel is
// saturated and the handle would stop doing anything.
const CAUSTIC_CULL = { min: 0, max: 1.5, step: 0.05 };
// Multipliers on the shipped constants, so 1.00 is what ships and either
// direction is a comparison against it. Thickness stops at 3x because past
// that neighbouring ribbons merge and the net stops being a net; brightness at
// 2x because the coarse net's alpha is 0.38 and anything approaching opaque
// white reads as foam rather than as a caustic.
const CAUSTIC_THICKNESS = { min: 0.25, max: 3, step: 0.05 };
const CAUSTIC_BRIGHTNESS = { min: 0, max: 2, step: 0.05 };
// Seconds. The nets breathe on a period of roughly half a minute, so a range of
// one period covers every relative alignment there is — past it the offsets
// start repeating.
const CAUSTIC_PHASE = { min: 0, max: 30, step: 0.5 };
// Down to a third, where the net thins out to a few big loops, and up to 2.5x,
// where the ribbons start to touch and the water reads as a lace rather than a
// network. Both ends are worth being able to reach.
// Multipliers on the shipped (deliberately subtle) lake gust; 1.00 is what ships.
const BOG_LAKE_STRENGTH = { min: 0, max: 3, step: 0.05 };
const CAUSTIC_DENSITY = { min: 0.3, max: 2.5, step: 0.05 };
/**
 * Every slider on the panel, as data.
 *
 * Ten of these, each previously fifteen lines of near-identical markup that
 * differed only in a label, a range and a unit — at which point the markup is
 * the least readable way to express the list. `needs` is the flag whose being
 * off greys the row out, so a handle that cannot currently do anything says so.
 */
const SLIDERS = [
    { key: 'foamWidthHexes', label: 'Foam width', needs: 'shorelineFoam', range: FOAM_WIDTH, format: (v) => `${v.toFixed(2)} hex` },
    { key: 'foamSurge', label: 'Foam surge', needs: 'shorelineFoam', range: FOAM_SURGE, format: (v) => v.toFixed(2) },
    { key: 'causticCullHexes', label: 'Caustic keep-off', needs: 'midWaterWaves', range: CAUSTIC_CULL, format: (v) => `${v.toFixed(2)} hex` },
    { key: 'causticThickness', label: 'Coarse net: thickness', needs: 'coarseCaustics', range: CAUSTIC_THICKNESS, format: times },
    { key: 'causticBrightness', label: 'Coarse net: brightness', needs: 'coarseCaustics', range: CAUSTIC_BRIGHTNESS, format: times },
    { key: 'causticDensity', label: 'Coarse net: density', needs: 'coarseCaustics', range: CAUSTIC_DENSITY, format: times },
    { key: 'causticFineThickness', label: 'Fine net: thickness', needs: 'fineCaustics', range: CAUSTIC_THICKNESS, format: times },
    { key: 'causticFineBrightness', label: 'Fine net: brightness', needs: 'fineCaustics', range: CAUSTIC_BRIGHTNESS, format: times },
    { key: 'causticFineDensity', label: 'Fine net: density', needs: 'fineCaustics', range: CAUSTIC_DENSITY, format: times },
    { key: 'causticFinePhase', label: 'Fine net: phase shift', needs: 'fineCaustics', range: CAUSTIC_PHASE, format: (v) => `${v.toFixed(1)} s` },
    { key: 'bogLakeFoamStrength', label: 'Bog lake foam: strength', needs: 'bogLakeFoam', range: BOG_LAKE_STRENGTH, format: times },
    { key: 'bogLakeFoamWidth', label: 'Bog lake foam: line width', needs: 'bogLakeFoam', range: { min: 0.01, max: 0.15, step: 0.005 }, format: (v) => v.toFixed(3) },
    { key: 'bogLakeFoamSpacing', label: 'Bog lake foam: spacing', needs: 'bogLakeFoam', range: { min: 6, max: 40, step: 1 }, format: (v) => `${v.toFixed(0)} u` },
    { key: 'bogLakeBlopsStrength', label: 'Bog lake blops: strength', needs: 'bogLakeBlops', range: BOG_LAKE_STRENGTH, format: times },
    { key: 'bogLakeBlopDensity', label: 'Bog lake blops: density', needs: 'bogLakeBlops', range: { min: 0, max: 1, step: 0.05 }, format: times },
    { key: 'bogLakeBlopSize', label: 'Bog lake blops: size', needs: 'bogLakeBlops', range: { min: 0.4, max: 2.5, step: 0.05 }, format: times },
    { key: 'bogLakeSheenStrength', label: 'Bog lake sheen: strength', needs: 'bogLakeSheen', range: BOG_LAKE_STRENGTH, format: times },
    { key: 'bogLakeCatsPawsStrength', label: "Bog lake cat's paws: strength", needs: 'bogLakeCatsPaws', range: BOG_LAKE_STRENGTH, format: times },
    { key: 'mapAnimationSpeed', label: 'All map animations: playback speed', needs: 'water', range: { min: 0, max: 1.5, step: 0.05 }, format: times },
    { key: 'bogLakeGustPhaseOffset', label: 'Bog lake gust: phase offset', needs: 'water', range: { min: -0.5, max: 0.5, step: 0.01 }, format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} period (${(v * 16).toFixed(1)} frames)` },
    { key: 'bogLakeBandHalf', label: 'Bog lake gust: band half-width', needs: 'water', range: { min: 0.05, max: 0.5, step: 0.01 }, format: (v) => `${v.toFixed(2)} period` },
    { key: 'riverBrightness', label: 'River flow: brightness', needs: 'riverFlow', range: CAUSTIC_BRIGHTNESS, format: times },
    { key: 'riverStreakMix', label: 'River flow: streaks over bands', needs: 'riverFlow', range: CAUSTIC_BRIGHTNESS, format: times },
    { key: 'riverArc', label: 'River flow: arc', needs: 'riverFlow', range: CAUSTIC_BRIGHTNESS, format: times },
    { key: 'riverSpeed', label: 'River flow: speed', needs: 'riverFlow', range: WAVE_SPEED, format: times },
    { key: 'waveSpeed', label: 'Wave speed', needs: 'midWaterWaves', range: WAVE_SPEED, format: (v) => `${v.toFixed(1)}\u00d7` },
];
// Debug-only panel text, like LABELS and SLIDERS above.
const FOAM_STYLE_LABEL = 'Bog lake foam: style';
const RIVER_STYLE_LABEL = 'River style';
watch([flags, tuning], () => emit('change'), { flush: 'post' });
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(flags, {});
    __VLS_withDotValue(tuning, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    const __VLS_0 = DebugPanel || DebugPanel;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "water-debug" }, title: "Water debug", storageKey: "water",
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "water-debug" },
        title: "Water debug",
        storageKey: "water",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['water-debug']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    const __VLS_6 = __VLS_tryAsConstant((__VLS_unwrap(LABELS, {})));
    for (const [label, key] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            key: (key),
            ...{ class: "row" },
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
        });
        (flags.value[key]);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (label);
        // @ts-ignore
        [LABELS, flags,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_unwrap(RIVER_STYLE_LABEL, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (flags.value.riverStyle),
        disabled: (!flags.value.riverFlow),
    });
    const __VLS_7 = __VLS_tryAsConstant((__VLS_unwrap(RIVER_STYLES, {})));
    for (const [name, i] of __VLS_vFor(__VLS_nonNull(__VLS_7))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (name),
            value: (i),
        });
        (name);
        // @ts-ignore
        [flags, flags, RIVER_STYLE_LABEL, RIVER_STYLES,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "row slider-row" },
        ...{ class: ({ disabled: !flags.value.bogLakeFoam }) },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "slider-label" },
    });
    /** @type {__VLS_StyleScopedClasses['slider-label']} */ ;
    (__VLS_unwrap(FOAM_STYLE_LABEL, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (tuning.value.bogLakeFoamStyle),
        disabled: (!flags.value.bogLakeFoam),
        'data-testid': "bog-lake-foam-style",
    });
    const __VLS_8 = __VLS_tryAsConstant((__VLS_unwrap(BOG_LAKE_FOAM_STYLES, {})));
    for (const [name, index] of __VLS_vFor(__VLS_nonNull(__VLS_8))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (name),
            value: (index),
        });
        (name);
        // @ts-ignore
        [flags, flags, FOAM_STYLE_LABEL, tuning, BOG_LAKE_FOAM_STYLES,];
    }
    const __VLS_9 = __VLS_tryAsConstant((__VLS_unwrap(SLIDERS, {})));
    for (const [slider] of __VLS_vFor(__VLS_nonNull(__VLS_9))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (slider.key),
            ...{ class: "row slider-row" },
            ...{ class: ({ disabled: !flags.value[slider.needs] }) },
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
        /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "slider-label" },
        });
        /** @type {__VLS_StyleScopedClasses['slider-label']} */ ;
        (slider.label);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "slider-value" },
        });
        /** @type {__VLS_StyleScopedClasses['slider-value']} */ ;
        (slider.format(tuning.value[slider.key]));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "range",
            min: (slider.range.min),
            max: (slider.range.max),
            step: (slider.range.step),
            disabled: (!flags.value[slider.needs]),
        });
        (tuning.value[slider.key]);
        // @ts-ignore
        [flags, flags, tuning, tuning, SLIDERS,];
    }
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
});
export default {};
