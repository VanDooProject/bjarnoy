/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// A backend-free playground for the island-shape generation parameters
// (issue: "still look quite round" feedback on the multi-lobe rewrite).
// worldGenerator.ts is a pure TS mirror of the backend's TerrainSampler, so
// every variant card below renders straight from a seed + parameter set with
// no API call — this is what makes a live, multi-variant compare possible.
import { nextTick, reactive, ref, toRaw } from 'vue';
import { COMPACT_GENERATION, DEFAULT_GENERATION, terrainAt } from '../../lib/map/worldGenerator';
import { oddQToAxial } from '../../lib/hex/coords';
/** The presets the docs section's buttons write into a chosen variant. */
const PRESETS = [
    { key: 'default', labelKey: 'presetDefault', generation: { ...DEFAULT_GENERATION } },
    { key: 'compact', labelKey: 'presetCompact', generation: { ...COMPACT_GENERATION } },
];
/** Order the form renders in, plus each field's i18n label key and `<input>` constraints — mirrors AdminWorldReseedView's GENERATION_FIELDS. */
const GENERATION_FIELDS = [
    { key: 'islandCellSize', labelKey: 'islandCellSizeLabel', min: 16, max: 4096, step: 1 },
    { key: 'islandChance', labelKey: 'islandChanceLabel', min: 0.01, max: 1, step: 0.01 },
    { key: 'islandMaxReach', labelKey: 'islandMaxReachLabel', min: 0, max: 2000, step: 1 },
    { key: 'islandMinGap', labelKey: 'islandMinGapLabel', min: 0, max: 400, step: 1 },
    { key: 'islandMinWidth', labelKey: 'islandMinWidthLabel', min: 2, max: 200, step: 0.5 },
    { key: 'islandMaxWidth', labelKey: 'islandMaxWidthLabel', min: 2, max: 200, step: 0.5 },
    { key: 'islandMinSegments', labelKey: 'islandMinSegmentsLabel', min: 1, max: 24, step: 1 },
    { key: 'islandMaxSegments', labelKey: 'islandMaxSegmentsLabel', min: 1, max: 24, step: 1 },
    { key: 'islandMinElongation', labelKey: 'islandMinElongationLabel', min: 0, max: 20, step: 0.1 },
    { key: 'islandMaxElongation', labelKey: 'islandMaxElongationLabel', min: 0, max: 20, step: 0.1 },
    { key: 'islandMinBend', labelKey: 'islandMinBendLabel', min: 0, max: 1, step: 0.01 },
    { key: 'islandMaxBend', labelKey: 'islandMaxBendLabel', min: 0, max: 1, step: 0.01 },
    { key: 'islandCoastWarp', labelKey: 'islandCoastWarpLabel', min: 0, max: 60, step: 0.5 },
    { key: 'islandCoastWarpScale', labelKey: 'islandCoastWarpScaleLabel', min: 2, max: 400, step: 0.5 },
    { key: 'islandCoastNoise', labelKey: 'islandCoastNoiseLabel', min: 0, max: 3, step: 0.05 },
    { key: 'islandCoastNoiseScale', labelKey: 'islandCoastNoiseScaleLabel', min: 2, max: 400, step: 0.5 },
    { key: 'islandSmallShare', labelKey: 'islandSmallShareLabel', min: 0, max: 1, step: 0.01 },
    { key: 'islandLargeShare', labelKey: 'islandLargeShareLabel', min: 0, max: 1, step: 0.01 },
    { key: 'beachThreshold', labelKey: 'beachThresholdLabel', min: 0, max: 1, step: 0.01 },
    { key: 'mountainThreshold', labelKey: 'mountainThresholdLabel', min: 0, max: 1, step: 0.01 },
    { key: 'mountainRockiness', labelKey: 'mountainRockinessLabel', min: 0, max: 1, step: 0.01 },
    { key: 'forestRockiness', labelKey: 'forestRockinessLabel', min: 0, max: 1, step: 0.01 },
];
// One square dot per hex, same dot-minimap style as the OLD/NEW comparison
// screenshots, just driven live instead of pre-rendered. GRID_RADIUS only
// sizes the canvas itself (CANVAS_SIZE below); the columns/rows actually
// sampled each draw come from CANVAS_SIZE / dotSize centred on the
// viewport (see draw()), so that range is zoom-driven and unbounded —
// zooming out samples well past +/-GRID_RADIUS, not clamped to it.
const GRID_RADIUS = 40;
const DOT_SIZE = 4;
const CANVAS_SIZE = (GRID_RADIUS * 2 + 1) * DOT_SIZE;
const TERRAIN_COLORS = {
    sea: '#1c3b52',
    sand: '#d8c184',
    grass: '#4c7a3f',
    forest: '#2e5730',
    mountain: '#7c7466',
    bog: '#5b6234',
    lake: '#27445e',
};
/** A seed the backend would accept: a non-negative signed-32-bit integer. */
function randomSeed() {
    return Math.floor(Math.random() * 2 ** 31);
}
// Islands are ~150 hexes across at the default scale, so the lab opens fully
// zoomed out (MIN_ZOOM): a ~320-hex window that shows one island and its neighbours.
function defaultViewport() {
    return { centerCol: 0, centerRow: 0, zoom: 0.25 };
}
let nextId = 1;
function newVariant(seed, generation = { ...DEFAULT_GENERATION }) {
    return { id: nextId++, seedInput: String(seed), generation, viewport: defaultViewport() };
}
// Defaults to exactly the two seeds already compared by eye (2147483 read as
// still-too-round, 42 read as "not that bad") so the page opens already
// showing the disagreement it exists to help resolve.
const variants = reactive([newVariant(2147483), newVariant(42)]);
const docsOpen = ref(false);
/** Which variant a preset button writes into when more than one is open. */
const presetTarget = ref(variants[0].id);
/** Mirrors every canvas's pan/zoom onto every other variant's when true. */
const syncViewports = ref(false);
const canvasRefs = new Map();
function setCanvasRef(id, el) {
    if (el instanceof HTMLCanvasElement)
        canvasRefs.set(id, el);
    else
        canvasRefs.delete(id);
}
const terrainCaches = new Map();
// One zoomed-out (MIN_ZOOM) frame already samples ~107k distinct hexes; cap
// well above that so a long pan at low zoom, which keeps exposing hexes this
// cache has never seen, can't grow it without bound — clearing it wholesale
// on overflow is simpler than evicting individual entries and just as
// correct, since overflow only means "sampled a lot of new ground".
const MAX_TERRAIN_CACHE_ENTRIES = 300_000;
/**
 * Panning by a pixel re-exposes almost entirely the same hexes as the frame
 * before, so caching terrainAt's result per (col, row) turns steady-state
 * pan/zoom into "sample only what's newly visible" — this is what actually
 * fixes the 1/zoom^2 blow-up at low zoom (the first zoomed-out frame still
 * has to sample every one of those ~107k hexes; only the frames after it get
 * cheaper). Keyed on a signature of the seed + generation constants, so a
 * preset, reset, field edit or randomize — anything that can change what a
 * given hex resolves to — invalidates the whole cache automatically, without
 * needing a manual invalidation call at each of those sites.
 */
function terrainCacheFor(variantId, seed, gen) {
    const signature = `${seed}|${JSON.stringify(gen)}`;
    const existing = terrainCaches.get(variantId);
    if (existing && existing.signature === signature)
        return existing.samples;
    const samples = new Map();
    terrainCaches.set(variantId, { signature, samples });
    return samples;
}
function draw(variant) {
    const canvas = canvasRefs.get(variant.id);
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx)
        return;
    const seedValue = Number(variant.seedInput);
    // variants is reactive(), so variant.generation is a Vue Proxy. terrainAt
    // -> closestIsland -> islandCellDepth reads ~20 gen.* properties per island
    // cell, for the 25 cells of a 5x5 scan (9 on legacy worlds), per dot — each of those a proxy `get` trap plus
    // dependency tracking. Measured at 7.5x the cost of sampling the same grid
    // against a plain object, so unwrap once here rather than letting a future
    // refactor pass the proxy back into the sampler. draw() only reads this
    // synchronously and never retains it, so toRaw (no allocation) beats a
    // `{ ...variant.generation }` snapshot.
    const gen = toRaw(variant.generation);
    const seed = Number.isInteger(seedValue) ? seedValue : 0;
    const world = { seed, generation: gen };
    const { centerCol, centerRow, zoom } = variant.viewport;
    const dotSize = DOT_SIZE * zoom;
    const half = CANVAS_SIZE / dotSize / 2;
    const minCol = Math.floor(centerCol - half) - 1;
    const maxCol = Math.ceil(centerCol + half) + 1;
    const minRow = Math.floor(centerRow - half) - 1;
    const maxRow = Math.ceil(centerRow + half) + 1;
    const samples = terrainCacheFor(variant.id, seed, gen);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
            const cacheKey = `${col},${row}`;
            let terrain = samples.get(cacheKey);
            if (terrain === undefined) {
                const { q, r } = oddQToAxial({ col, row });
                terrain = terrainAt(q, r, world);
                if (samples.size >= MAX_TERRAIN_CACHE_ENTRIES)
                    samples.clear();
                samples.set(cacheKey, terrain);
            }
            const px = (col - (centerCol - half)) * dotSize;
            const py = (row - (centerRow - half)) * dotSize;
            ctx.fillStyle = TERRAIN_COLORS[terrain];
            ctx.fillRect(px, py, dotSize, dotSize);
        }
    }
}
function redrawAll() {
    for (const variant of variants)
        draw(variant);
}
const dirtyVariantIds = new Set();
let pendingFrame = null;
function flushDirtyVariants() {
    pendingFrame = null;
    for (const id of dirtyVariantIds) {
        const variant = variants.find((v) => v.id === id);
        if (variant)
            draw(variant);
    }
    dirtyVariantIds.clear();
}
/**
 * Marks `variant` dirty and schedules one rAF to draw every dirty variant,
 * instead of drawing right away. onPointerMove fires many times per
 * rendered frame during a drag (same for onWheel during a scroll, and a
 * fast typist across the 17 generation inputs), and draw()'s cost is
 * dominated by terrainAt sampling — without this, every one of those events
 * paid that cost inline in the handler. Coalescing into a single rAF draws
 * each dirty variant at most once per frame no matter how many events land
 * in it, without changing what ends up on screen.
 */
function scheduleDraw(variant) {
    dirtyVariantIds.add(variant.id);
    if (pendingFrame === null)
        pendingFrame = requestAnimationFrame(flushDirtyVariants);
}
/** Schedules a draw of `variant`, then mirrors its viewport onto every other one when sync is on. */
function applyViewport(variant) {
    scheduleDraw(variant);
    if (!syncViewports.value)
        return;
    for (const other of variants) {
        if (other.id === variant.id)
            continue;
        other.viewport.centerCol = variant.viewport.centerCol;
        other.viewport.centerRow = variant.viewport.centerRow;
        other.viewport.zoom = variant.viewport.zoom;
        scheduleDraw(other);
    }
}
function resetView(variant) {
    variant.viewport = defaultViewport();
    applyViewport(variant);
}
async function addVariant() {
    const variant = newVariant(randomSeed());
    if (syncViewports.value && variants.length > 0)
        variant.viewport = { ...variants[0].viewport };
    variants.push(variant);
    await nextTick();
    draw(variant);
}
async function duplicateVariant(variant) {
    const copy = newVariant(Number(variant.seedInput) || 0, { ...variant.generation });
    copy.viewport = { ...variant.viewport };
    variants.push(copy);
    await nextTick();
    draw(copy);
}
function removeVariant(id) {
    const index = variants.findIndex((v) => v.id === id);
    if (index >= 0)
        variants.splice(index, 1);
    canvasRefs.delete(id);
    pointerDrags.delete(id);
    terrainCaches.delete(id);
    dirtyVariantIds.delete(id);
    if (dirtyVariantIds.size === 0 && pendingFrame !== null) {
        cancelAnimationFrame(pendingFrame);
        pendingFrame = null;
    }
    if (presetTarget.value === id && variants.length > 0)
        presetTarget.value = variants[0].id;
}
function randomizeSeed(variant) {
    variant.seedInput = String(randomSeed());
    draw(variant);
}
/**
 * The variant a preset button (or anything else offering a single-target
 * write) should apply to: the explicitly picked one if it's still open,
 * otherwise the first variant — so a single-variant page never needs the
 * target selector to be visible at all.
 */
function resolvePresetTarget() {
    return variants.find((v) => v.id === presetTarget.value) ?? variants[0];
}
function applyPreset(preset) {
    const variant = resolvePresetTarget();
    if (!variant)
        return;
    variant.generation = { ...preset.generation };
    draw(variant);
}
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
function clampZoom(zoom) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
/** Converts a canvas-relative CSS pixel to the col/row it currently shows. */
function pixelToGrid(variant, px, py) {
    const { centerCol, centerRow, zoom } = variant.viewport;
    const dotSize = DOT_SIZE * zoom;
    const half = CANVAS_SIZE / dotSize / 2;
    return { col: centerCol - half + px / dotSize, row: centerRow - half + py / dotSize };
}
/** Canvas-relative CSS pixel coordinates for a pointer event, accounting for the canvas's own CSS scaling. */
function eventToCanvasPixel(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    return { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale };
}
function onWheel(event, variant) {
    event.preventDefault();
    const canvas = canvasRefs.get(variant.id);
    if (!canvas)
        return;
    const { x, y } = eventToCanvasPixel(canvas, event);
    const before = pixelToGrid(variant, x, y);
    const zoomFactor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    variant.viewport.zoom = clampZoom(variant.viewport.zoom * zoomFactor);
    const after = pixelToGrid(variant, x, y);
    // Keep the hex under the cursor fixed in place rather than zooming on centre.
    variant.viewport.centerCol += before.col - after.col;
    variant.viewport.centerRow += before.row - after.row;
    applyViewport(variant);
}
const pointerDrags = new Map();
function onPointerDown(event, variant) {
    const canvas = canvasRefs.get(variant.id);
    if (!canvas)
        return;
    canvas.setPointerCapture(event.pointerId);
    pointerDrags.set(variant.id, {
        startClientX: event.clientX,
        startClientY: event.clientY,
        startCenterCol: variant.viewport.centerCol,
        startCenterRow: variant.viewport.centerRow,
    });
}
function onPointerMove(event, variant) {
    const drag = pointerDrags.get(variant.id);
    const canvas = canvasRefs.get(variant.id);
    if (!drag || !canvas)
        return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const dotSize = DOT_SIZE * variant.viewport.zoom;
    const dxCols = ((event.clientX - drag.startClientX) * scale) / dotSize;
    const dyRows = ((event.clientY - drag.startClientY) * scale) / dotSize;
    variant.viewport.centerCol = drag.startCenterCol - dxCols;
    variant.viewport.centerRow = drag.startCenterRow - dyRows;
    applyViewport(variant);
}
function onPointerUp(event, variant) {
    const canvas = canvasRefs.get(variant.id);
    if (canvas?.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
    pointerDrags.delete(variant.id);
}
function resetToDefault(variant) {
    variant.generation = { ...DEFAULT_GENERATION };
    draw(variant);
}
// Canvas refs are already attached by the time onMounted would fire (the
// v-for's :ref callbacks run during this component's own initial render),
// so drawing straight after the template renders — via nextTick, not
// onMounted — is what actually has something to draw into for every variant,
// including ones added later by addVariant/duplicateVariant above.
void nextTick(redrawAll);
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(docsOpen, {});
    __VLS_withDotValue(variants, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['docs-toggle']} */ ;
    /** @type {__VLS_StyleScopedClasses['docs-toggle-caret']} */ ;
    /** @type {__VLS_StyleScopedClasses['controls']} */ ;
    /** @type {__VLS_StyleScopedClasses['controls']} */ ;
    /** @type {__VLS_StyleScopedClasses['generation-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['generation-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "island-lab" },
    });
    /** @type {__VLS_StyleScopedClasses['island-lab']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "head" },
    });
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.$t('adminIslandLab.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (addVariant) },
        ...{ class: "secondary" },
        'data-testid': "add-variant",
    });
    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
    (__VLS_ctx.$t('adminIslandLab.addVariant'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_ctx.$t('adminIslandLab.hint'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "panel docs" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['docs']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (docsOpen.value = !docsOpen.value);
                // @ts-ignore
                [$t, $t, $t, docsOpen, docsOpen,];
            } },
        ...{ class: "secondary docs-toggle" },
        ...{ class: ({ open: docsOpen.value }) },
        'data-testid': "docs-toggle",
    });
    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
    /** @type {__VLS_StyleScopedClasses['docs-toggle']} */ ;
    /** @type {__VLS_StyleScopedClasses['open']} */ ;
    (__VLS_ctx.$t('adminIslandLab.docsToggle'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "docs-toggle-caret" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['docs-toggle-caret']} */ ;
    if (docsOpen.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "docs-body" },
            'data-testid': "docs-body",
        });
        /** @type {__VLS_StyleScopedClasses['docs-body']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('adminIslandLab.docsIntro'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('adminIslandLab.docsFields'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('adminIslandLab.docsBudget'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "presets" },
    });
    /** @type {__VLS_StyleScopedClasses['presets']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "presets-label" },
    });
    /** @type {__VLS_StyleScopedClasses['presets-label']} */ ;
    (__VLS_ctx.$t('adminIslandLab.presetsLabel'));
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(PRESETS, {})));
    for (const [preset] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (applyPreset(preset));
                    // @ts-ignore
                    [$t, $t, $t, $t, $t, docsOpen, docsOpen, PRESETS,];
                } },
            key: (preset.key),
            ...{ class: "secondary" },
            'data-testid': (`preset-${preset.key}`),
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_ctx.$t(`adminIslandLab.${preset.labelKey}`));
        // @ts-ignore
        [$t,];
    }
    if (variants.value.length > 1) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "preset-target",
        });
        (__VLS_ctx.$t('adminIslandLab.presetTargetLabel'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            id: "preset-target",
            value: (__VLS_unwrap(presetTarget, {})),
            'data-testid': "preset-target",
        });
        const __VLS_1 = __VLS_tryAsConstant((variants.value));
        for (const [variant, index] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (variant.id),
                value: (variant.id),
            });
            (__VLS_ctx.$t('adminIslandLab.variantOptionLabel', { n: index + 1, seed: variant.seedInput }));
            // @ts-ignore
            [$t, $t, variants, variants, presetTarget,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "sync-toggle" },
    });
    /** @type {__VLS_StyleScopedClasses['sync-toggle']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
        'data-testid': "sync-viewports",
    });
    (__VLS_unwrap(syncViewports, {}));
    (__VLS_ctx.$t('adminIslandLab.syncViewports'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "variants" },
    });
    /** @type {__VLS_StyleScopedClasses['variants']} */ ;
    const __VLS_2 = __VLS_tryAsConstant((variants.value));
    for (const [variant] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            key: (variant.id),
            ...{ class: "panel variant" },
            'data-testid': "island-lab-variant",
        });
        /** @type {__VLS_StyleScopedClasses['panel']} */ ;
        /** @type {__VLS_StyleScopedClasses['variant']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "controls" },
        });
        /** @type {__VLS_StyleScopedClasses['controls']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: (`lab-seed-${variant.id}`),
        });
        (__VLS_ctx.$t('adminIslandLab.seedLabel'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    return (draw(variant));
                    // @ts-ignore
                    [$t, $t, variants, syncViewports,];
                } },
            id: (`lab-seed-${variant.id}`),
            type: "number",
            step: "1",
        });
        (variant.seedInput);
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (randomizeSeed(variant));
                    // @ts-ignore
                    [];
                } },
            ...{ class: "secondary" },
            'data-testid': "randomize-seed",
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_ctx.$t('adminIslandLab.randomizeSeed'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (duplicateVariant(variant));
                    // @ts-ignore
                    [$t,];
                } },
            ...{ class: "secondary" },
            'data-testid': "duplicate-variant",
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_ctx.$t('adminIslandLab.duplicate'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (resetView(variant));
                    // @ts-ignore
                    [$t,];
                } },
            ...{ class: "secondary" },
            'data-testid': "reset-view",
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_ctx.$t('adminIslandLab.resetView'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (removeVariant(variant.id));
                    // @ts-ignore
                    [$t,];
                } },
            ...{ class: "destructive" },
            'data-testid': "remove-variant",
            disabled: (variants.value.length <= 1),
        });
        /** @type {__VLS_StyleScopedClasses['destructive']} */ ;
        (__VLS_ctx.$t('adminIslandLab.remove'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.canvas)({
            ...{ onWheel: (...[$event]) => {
                    void $event;
                    return (onWheel($event, variant));
                    // @ts-ignore
                    [$t, variants,];
                } },
            ...{ onPointerdown: (...[$event]) => {
                    void $event;
                    return (onPointerDown($event, variant));
                    // @ts-ignore
                    [];
                } },
            ...{ onPointermove: (...[$event]) => {
                    void $event;
                    return (onPointerMove($event, variant));
                    // @ts-ignore
                    [];
                } },
            ...{ onPointerup: (...[$event]) => {
                    void $event;
                    return (onPointerUp($event, variant));
                    // @ts-ignore
                    [];
                } },
            ...{ onPointercancel: (...[$event]) => {
                    void $event;
                    return (onPointerUp($event, variant));
                    // @ts-ignore
                    [];
                } },
            ref: ((el) => setCanvasRef(variant.id, el)),
            ...{ class: "minimap" },
            'data-testid': "island-lab-canvas",
            width: (__VLS_unwrap(CANVAS_SIZE, {})),
            height: (__VLS_unwrap(CANVAS_SIZE, {})),
        });
        /** @type {__VLS_StyleScopedClasses['minimap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "generation-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['generation-grid']} */ ;
        const __VLS_3 = __VLS_tryAsConstant((__VLS_unwrap(GENERATION_FIELDS, {})));
        for (const [field] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (field.key),
                ...{ class: "generation-field" },
            });
            /** @type {__VLS_StyleScopedClasses['generation-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: (`lab-gen-${variant.id}-${field.key}`),
            });
            (__VLS_ctx.$t(`adminIslandLab.${field.labelKey}`));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: (...[$event]) => {
                        void $event;
                        return (scheduleDraw(variant));
                        // @ts-ignore
                        [$t, CANVAS_SIZE, CANVAS_SIZE, GENERATION_FIELDS,];
                    } },
                id: (`lab-gen-${variant.id}-${field.key}`),
                type: "number",
                min: (field.min),
                max: (field.max),
                step: (field.step),
                'data-testid': (`lab-gen-${variant.id}-${field.key}`),
            });
            (variant.generation[field.key]);
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (resetToDefault(variant));
                    // @ts-ignore
                    [];
                } },
            ...{ class: "secondary" },
            'data-testid': "reset-generation",
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_ctx.$t('adminIslandLab.resetToDefault'));
        // @ts-ignore
        [$t,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
