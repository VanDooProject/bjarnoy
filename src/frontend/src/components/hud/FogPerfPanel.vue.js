/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Live per-rebuild timing breakdown, mounted beneath FogDebugPanel —
// toggle a flag there and watch the matching row move on the next
// pan/zoom. See fogPerfStats's own comment in HexMapRenderer.ts for exactly
// which flags affect which row, and its module comment for why
// `shaderPassMs`/`cacheHitRate` (real §2.8 stats) aren't shown here yet —
// neither is measurable without work this slice doesn't do (a GPU timer
// query, a header-reading fetch wrapper), and faking them would be worse
// than the honest gap.
//
// Sub-rows are real measurements or real counts, never fabricated: the
// per-hex splits (terrain drawn/culled, bordered hex count) are counters
// incremented in the same branches the flags already gate — cheap (an
// integer increment), unlike wrapping each per-hex branch in its own
// performance.now() call, which would cost more than the branch it's timing
// and skew the very loop being measured. Counts are a size-of-work proxy
// for a sub-row's share of its parent's ms, not a separately measured time.
//
// fogPerfStats is a plain object mutated directly by HexMapRenderer, not a
// Vue ref/reactive (HexMapRenderer.ts stays Vue-reactivity-free — see
// FogDebugPanel.vue's own comment on why). Unlike the debug flags, this
// direction can't reuse a reactive()-wrapped proxy: HexMapRenderer writes
// to the raw object during rebuilds, which never goes through a Vue proxy
// trap, so nothing would tell this component to re-render. Polling on an
// interval is the simplest correct way to observe an external mutable
// object like this without pulling Vue into the renderer.
import { onMounted, onUnmounted, reactive, computed } from 'vue';
import DebugPanel from './DebugPanel.vue';
import { fogPerfStats } from '../../lib/map/HexMapRenderer';
// Read-only here: where the last bake ran, so the row above can explain its own
// zero (see waterMaskNote). WaterPerfPanel owns presenting the rest of these.
import { waterPerfStats } from '../../lib/map/water/waterDebug';
const POLL_MS = 250;
const stats = reactive({ ...fogPerfStats });
const water = reactive({ ...waterPerfStats });
let timer;
onMounted(() => {
    timer = setInterval(() => {
        Object.assign(stats, fogPerfStats);
        Object.assign(water, waterPerfStats);
    }, POLL_MS);
});
onUnmounted(() => clearInterval(timer));
// Wave counts partition the wave placement grid, not the hex grid, so their
// bars need their own denominator (see Row.countOf).
const waveGridTotal = computed(() => stats.waveDrawnCount + stats.waveCulledCount);
const ROWS = computed(() => [
    {
        key: 'terrain',
        label: 'Terrain',
        ms: stats.terrainMs,
        children: [
            { key: 'terrain-drawn', label: 'Drawn', ms: null, count: stats.terrainDrawnCount, countLabel: 'hexes' },
            { key: 'terrain-culled', label: 'Culled (fog)', ms: null, count: stats.terrainCulledCount, countLabel: 'hexes' },
        ],
    },
    {
        key: 'borders',
        label: 'Borders (per-hex)',
        ms: stats.bordersMs,
        children: stats.deepFogOnly
            ? [
                {
                    key: 'deep-fog-shortcut',
                    label: `Deep-fog shortcut active — per-hex loop skipped (${stats.hexCount} hexes)`,
                    ms: null,
                },
            ]
            : [{ key: 'bordered', label: 'Realm borders drawn', ms: null, count: stats.borderedHexCount, countLabel: 'hexes' }],
    },
    { key: 'bog-edges', label: 'Bog edges', ms: stats.bogEdgesMs },
    { key: 'markers', label: 'Markers', ms: stats.markersMs },
    {
        key: 'water-mask',
        label: 'Water mask bake (this thread)',
        ms: stats.waterMaskMs,
        children: [
            {
                key: 'water-mask-note',
                label: waterMaskNote.value,
                ms: null,
            },
        ],
    },
    {
        key: 'waves',
        label: 'Waves',
        ms: stats.wavesMs,
        children: [
            {
                key: 'waves-drawn',
                label: 'Drawn',
                ms: null,
                count: stats.waveDrawnCount,
                countLabel: 'strokes/frame',
                countOf: waveGridTotal.value,
            },
            {
                key: 'waves-culled',
                label: 'Culled (fog)',
                ms: null,
                count: stats.waveCulledCount,
                countLabel: 'strokes',
                countOf: waveGridTotal.value,
            },
        ],
    },
]);
/**
 * Not a row above, because it is not part of the rebuild the rest of this
 * panel breaks down — it is paid every frame, and the total would be lying if
 * it included something that never ran during it.
 *
 * Worth having in front of the rebuild numbers anyway: everything above
 * happens once per camera move, this happens sixty times a second, and the
 * two are easy to confuse when the only wave row on the panel is the
 * placement pass.
 */
const waveDrawMs = computed(() => stats.waveDrawMs);
function ms(v) {
    return `${v.toFixed(2)} ms`;
}
function share(v, of) {
    return of > 0 ? Math.round((v / of) * 100) : 0;
}
/**
 * The rest of the scan: hexes the terrain pass walked and drew nothing for
 * that the fog cull did not claim.
 *
 * Worth naming rather than leaving as the gap between three numbers, because
 * it is nearly all of them. A zoomed-out world map scans ~58,000 hexes to draw
 * ~270: about nine in ten of the rest are open sea, which is the background
 * and not a hex anything is drawn for, and reading `58,065 hexes` alone gave
 * no way to tell that from a cull that had quietly stopped working.
 */
/**
 * Where the last bake ran, and why the row above it can read 0.00 ms while the
 * water panel reports hundreds.
 *
 * The rebuild breakdown is main-thread time, so a bake on the worker
 * contributes nothing to it — which is the entire point of it being there, and
 * also exactly the sort of zero that reads as a broken counter if the panel
 * does not say so.
 */
const waterMaskNote = computed(() => {
    if (stats.waterMaskMs > 0)
        return 'Baked on this thread';
    if (water.bakedOnWorker)
        return `Baked on the worker (${water.bakeMs.toFixed(0)} ms there, off this frame)`;
    return 'Reused (viewport still inside the baked region)';
});
/**
 * Hexes in the viewport the scan never walked, because no settlement's fog
 * reaches them and nothing there could draw.
 *
 * This is where most of the cull lives now: it is applied by bounding the
 * scan rather than by testing each hex, so `fog-culled` below counts only
 * what the per-hex test still rejects. Reporting the clip alongside it is
 * what keeps the cull legible — otherwise the panel would show it working
 * best exactly when its own number reads zero.
 */
const clippedAway = computed(() => Math.max(0, stats.viewportHexCount - stats.hexCount));
const openSeaSkipped = computed(() => Math.max(0, stats.hexCount - stats.terrainDrawnCount - stats.terrainCulledCount));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(stats, {});
    __VLS_withDotValue(clippedAway, {});
    __VLS_withDotValue(openSeaSkipped, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar-track']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['per-frame']} */ ;
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    /** @type {__VLS_StyleScopedClasses['meta-split']} */ ;
    /** @type {__VLS_StyleScopedClasses['meta-split']} */ ;
    /** @type {__VLS_StyleScopedClasses['meta-split']} */ ;
    /** @type {__VLS_StyleScopedClasses['meta-split']} */ ;
    const __VLS_0 = DebugPanel || DebugPanel;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "fog-perf" }, title: "Fog perf (last rebuild)", storageKey: "fogPerf",
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "fog-perf" },
        title: "Fog perf (last rebuild)",
        storageKey: "fogPerf",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['fog-perf']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    const __VLS_6 = __VLS_tryAsConstant((__VLS_unwrap(ROWS, {})));
    for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
            key: (row.key),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "row" },
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "label" },
        });
        /** @type {__VLS_StyleScopedClasses['label']} */ ;
        (row.label);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "bar-track" },
        });
        /** @type {__VLS_StyleScopedClasses['bar-track']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "bar" },
            ...{ style: ({ width: share(row.ms ?? 0, stats.value.totalMs) + '%' }) },
        });
        /** @type {__VLS_StyleScopedClasses['bar']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "value" },
        });
        /** @type {__VLS_StyleScopedClasses['value']} */ ;
        (ms(row.ms ?? 0));
        const __VLS_7 = __VLS_tryAsConstant((row.children));
        for (const [child] of __VLS_vFor(__VLS_nonNull(__VLS_7))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (child.key),
                ...{ class: "row sub" },
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            /** @type {__VLS_StyleScopedClasses['sub']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "label" },
            });
            /** @type {__VLS_StyleScopedClasses['label']} */ ;
            (child.label);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "bar-track" },
            });
            /** @type {__VLS_StyleScopedClasses['bar-track']} */ ;
            if (child.ms !== null) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                    ...{ class: "bar" },
                    ...{ style: ({ width: share(child.ms, row.ms || child.ms || 1) + '%' }) },
                });
                /** @type {__VLS_StyleScopedClasses['bar']} */ ;
            }
            else if (child.count !== undefined) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                    ...{ class: "bar count" },
                    ...{ style: ({ width: share(child.count, child.countOf ?? stats.value.hexCount) + '%' }) },
                });
                /** @type {__VLS_StyleScopedClasses['bar']} */ ;
                /** @type {__VLS_StyleScopedClasses['count']} */ ;
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "value" },
            });
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            if (child.ms !== null) {
                (ms(child.ms));
            }
            else if (child.count !== undefined) {
                (child.count);
                (child.countLabel);
            }
            // @ts-ignore
            [ROWS, stats, stats,];
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row total" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['total']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "bar-track" },
    });
    /** @type {__VLS_StyleScopedClasses['bar-track']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (ms(stats.value.totalMs));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row per-frame" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['per-frame']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "bar-track" },
    });
    /** @type {__VLS_StyleScopedClasses['bar-track']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (ms(__VLS_unwrap(waveDrawMs, {})));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "meta" },
    });
    /** @type {__VLS_StyleScopedClasses['meta']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (stats.value.viewportHexCount.toLocaleString());
    (stats.value.hexCount.toLocaleString());
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "meta-split" },
    });
    /** @type {__VLS_StyleScopedClasses['meta-split']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "clipped" },
    });
    /** @type {__VLS_StyleScopedClasses['clipped']} */ ;
    (clippedAway.value.toLocaleString());
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "drawn" },
    });
    /** @type {__VLS_StyleScopedClasses['drawn']} */ ;
    (stats.value.terrainDrawnCount.toLocaleString());
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "culled" },
    });
    /** @type {__VLS_StyleScopedClasses['culled']} */ ;
    (stats.value.terrainCulledCount.toLocaleString());
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "skipped" },
    });
    /** @type {__VLS_StyleScopedClasses['skipped']} */ ;
    (openSeaSkipped.value.toLocaleString());
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mask" },
    });
    /** @type {__VLS_StyleScopedClasses['mask']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mask-row" },
    });
    /** @type {__VLS_StyleScopedClasses['mask-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (stats.value.maskFetchInFlight ? 'in flight…' : ms(stats.value.maskFetchMs));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "mask-row" },
    });
    /** @type {__VLS_StyleScopedClasses['mask-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (stats.value.maskVersion ?? '—');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "legend" },
    });
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({});
    // @ts-ignore
    [stats, stats, stats, stats, stats, stats, stats, stats, waveDrawMs, clippedAway, openSeaSkipped,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
