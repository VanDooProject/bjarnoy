/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, markRaw, onMounted, ref, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import WorldMapCanvas from '../../components/map/WorldMapCanvas.vue';
import WorldReviewPanel from '../../components/admin/WorldReviewPanel.vue';
import { api, ApiError } from '../../api/client';
import { useUnsavedInput } from '../../composables/useUnsavedInput';
import { WorldModel } from '../../lib/map/WorldModel';
import { formatShare, MAX_SCAN_COUNT, parseScan } from './worldReview';
const { t } = useI18n({ useScope: 'global' });
// Issue #133: pick a candidate seed, look at the map it produces, and only
// then commit it. Committing regenerates the world's islands, which deletes
// every settlement in it — the backend refuses outright if any of them belong
// to a real player other than this admin, so the confirmation below guards
// against fat fingers, not against destroying someone else's game.
const route = useRoute();
const router = useRouter();
const worldId = computed(() => String(route.params.worldId ?? ''));
const world = ref(null);
const loading = ref(true);
const loadError = ref(null);
const seedInput = ref('');
function formFrom(settings) {
    return { ...settings };
}
/** Order the form renders in, plus each field's i18n label key and `<input>` constraints. */
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
    { key: 'minimumIslandTiles', labelKey: 'minimumIslandTilesLabel', min: 0, step: 1 },
];
// Pre-filled from the world's current values once it loads (see onMounted),
// so leaving every field untouched previews/reseeds exactly what the world
// already has. Cast away null only because it's briefly unset before the
// world response arrives; every field is always present by the time the
// form (v-if="world") renders.
const generation = ref({});
/** The generation values the current `preview` was actually generated with — reseed commits these, not whatever `generation` has drifted to since (same reasoning as the seed check in `canCommit`). */
const previewedGeneration = ref(null);
function resetGenerationToCurrent() {
    if (world.value)
        generation.value = formFrom(world.value.generation);
}
const preview = ref(null);
// Outside Vue's reactivity for the same reason stores/world.ts keeps its own
// model out of it: the renderer reads this every frame.
const previewModel = shallowRef(null);
const previewing = ref(false);
const previewError = ref(null);
const fullscreen = ref(false);
const canvasRef = ref(null);
/** The review finding the preview map was last centred on (highlighted in the table). */
const selectedFinding = ref(null);
/** Centres the preview map on a review finding's representative hex. */
function focusFinding(finding) {
    selectedFinding.value = finding;
    canvasRef.value?.renderer?.panTo({ q: finding.q, r: finding.r });
}
// Seed scan: review a range of candidate seeds (POST review-seeds) and preview one of them.
const scanFrom = ref('');
const scanCount = ref('4');
const scanning = ref(false);
const scanError = ref(null);
const scanResult = ref(null);
async function runScan() {
    if (scanning.value)
        return;
    const parsed = parseScan(scanFrom.value, scanCount.value);
    if (parsed === 'badSeed') {
        scanError.value = t('adminWorldReseed.seedMustBeInteger');
        return;
    }
    if (parsed === 'badCount') {
        scanError.value = t('adminWorldReview.scanCountRange', { max: MAX_SCAN_COUNT });
        return;
    }
    scanning.value = true;
    scanError.value = null;
    try {
        scanResult.value = await api.adminReviewWorldSeeds(worldId.value, { ...parsed, generation: { ...generation.value } });
    }
    catch (err) {
        scanError.value = err instanceof ApiError ? err.message : t('adminWorldReview.scanError');
        scanResult.value = null;
    }
    finally {
        scanning.value = false;
    }
}
/** Previews a seed from the scan list: the same as typing it into the seed field and pressing "Preview seed". */
function previewScanned(seed) {
    seedInput.value = String(seed);
    void runPreview();
}
const confirmName = ref('');
// The destructive reseed's typed confirmation; the generation fields are re-derivable tuning.
useUnsavedInput(() => confirmName.value !== '');
const committing = ref(false);
const commitError = ref(null);
const committed = ref(null);
/** A seed the backend will accept: a non-negative signed-32-bit integer. */
function randomSeed() {
    return Math.floor(Math.random() * 2 ** 31);
}
function randomizeSeed() {
    seedInput.value = String(randomSeed());
}
const parsedSeed = computed(() => {
    const value = Number(seedInput.value);
    return Number.isInteger(value) ? value : null;
});
const nameMatches = computed(() => world.value !== null && confirmName.value.trim() === world.value.name);
function generationMatches(a, b) {
    return a !== null && b !== null && GENERATION_FIELDS.every((f) => a[f.key] === b[f.key]);
}
// Only a seed *and* a generation-parameter set that have actually been looked
// at may be committed — the whole point of the preview is that nobody
// reseeds a map sight-unseen, generation knobs included.
const canCommit = computed(() => preview.value !== null &&
    parsedSeed.value === preview.value.seed &&
    generationMatches(generation.value, previewedGeneration.value) &&
    nameMatches.value);
onMounted(async () => {
    try {
        // There is no single-world admin GET; the list is the admin world source
        // everywhere else in this section too (see stores/adminWorld.ts).
        const worlds = await api.adminListWorlds();
        world.value = worlds.find((w) => w.id === worldId.value) ?? null;
        if (!world.value) {
            loadError.value = t('adminWorldReseed.noSuchWorld');
        }
        else {
            resetGenerationToCurrent();
        }
    }
    catch {
        loadError.value = t('adminWorldReseed.loadError');
    }
    finally {
        loading.value = false;
    }
    randomizeSeed();
    scanFrom.value = seedInput.value;
});
async function runPreview() {
    if (previewing.value)
        return;
    const seed = parsedSeed.value;
    if (seed === null) {
        previewError.value = t('adminWorldReseed.seedMustBeInteger');
        return;
    }
    previewing.value = true;
    previewError.value = null;
    try {
        const requestedGeneration = { ...generation.value };
        const result = await api.adminPreviewWorldSeed(worldId.value, { seed, generation: requestedGeneration });
        preview.value = result;
        selectedFinding.value = null;
        previewedGeneration.value = requestedGeneration;
        previewModel.value = markRaw(buildPreviewModel(result));
    }
    catch (err) {
        previewError.value = err instanceof ApiError ? err.message : t('adminWorldReseed.previewError');
        preview.value = null;
        previewedGeneration.value = null;
        previewModel.value = null;
    }
    finally {
        previewing.value = false;
    }
}
/**
 * The throwaway `WorldModel` the preview renders from. Terrain itself is not
 * in the response and does not need to be: `worldGenerator.ts` derives it from
 * the seed and the generation constants exactly as the backend's
 * `TerrainSampler` does — so the model is built with the constants the
 * candidate was generated with (`result.generation`, world radius included),
 * not the defaults — and only the islands, rivers and giants, which no client
 * can derive, come over the wire. Islands have no id here (nothing was
 * persisted), so their index stands in as a label key.
 */
function buildPreviewModel(result) {
    const model = new WorldModel(result.seed, result.generation);
    model.setIslands(result.islands.map((island) => ({
        id: `preview-${island.index}`,
        name: island.name,
        q: island.q,
        r: island.r,
    })));
    model.setRiverTiles(result.islands.flatMap((island) => island.riverTiles.map((tile) => ({
        q: tile.q,
        r: tile.r,
        shape: tile.shape,
        inDirections: tile.inDirections,
        outDirection: tile.outDirection,
        width: tile.width ?? 'river',
        wasted: island.wasted,
    }))));
    model.setGiants(result.islands.flatMap((island) => island.giants.map((giant) => ({
        family: giant.family,
        anchor: { q: giant.q, r: giant.r },
        orientation: giant.orientation,
    }))));
    return model;
}
async function commit() {
    if (!world.value || !preview.value || committing.value || !canCommit.value)
        return;
    // Same window.confirm() pattern as AdminWorldsView's run-state actions, but
    // behind the re-typed world name above: unlike a pause, this one cannot be
    // undone by clicking the opposite button.
    const message = t('adminWorldReseed.confirmReseed', {
        name: world.value.name,
        seed: preview.value.seed,
        playerCount: world.value.playerCount,
    });
    if (!window.confirm(message))
        return;
    committing.value = true;
    commitError.value = null;
    try {
        const result = await api.adminReseedWorld(worldId.value, {
            confirmWorldName: confirmName.value.trim(),
            seed: preview.value.seed,
            // canCommit already guarantees this matches the last preview.
            generation: previewedGeneration.value ?? undefined,
        });
        world.value = result.world;
        committed.value = {
            seed: result.seed,
            islandCount: result.islandCount,
            deletedSettlements: result.deletedSettlements,
        };
        confirmName.value = '';
        resetGenerationToCurrent();
        previewedGeneration.value = null;
    }
    catch (err) {
        commitError.value = err instanceof ApiError ? err.message : t('adminWorldReseed.reseedError');
    }
    finally {
        committing.value = false;
    }
}
function back() {
    void router.push('/admin/worlds');
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(loading, {});
    __VLS_withDotValue(loadError, {});
    __VLS_withDotValue(world, {});
    __VLS_withDotValue(generation, {});
    __VLS_withDotValue(previewing, {});
    __VLS_withDotValue(previewError, {});
    __VLS_withDotValue(preview, {});
    __VLS_withDotValue(scanning, {});
    __VLS_withDotValue(scanError, {});
    __VLS_withDotValue(scanResult, {});
    __VLS_withDotValue(previewModel, {});
    __VLS_withDotValue(fullscreen, {});
    __VLS_withDotValue(canCommit, {});
    __VLS_withDotValue(committing, {});
    __VLS_withDotValue(commitError, {});
    __VLS_withDotValue(committed, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['controls']} */ ;
    /** @type {__VLS_StyleScopedClasses['generation-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['generation-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['preview-layout']} */ ;
    /** @type {__VLS_StyleScopedClasses['preview-layout']} */ ;
    /** @type {__VLS_StyleScopedClasses['scan-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['scan-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['scan-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['map-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['map-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "reseed" },
    });
    /** @type {__VLS_StyleScopedClasses['reseed']} */ ;
    if (loading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('adminWorldReseed.loading'));
    }
    else if (loadError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (loadError.value);
    }
    else if (world.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
            ...{ class: "head" },
        });
        /** @type {__VLS_StyleScopedClasses['head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
        (__VLS_ctx.$t('adminWorldReseed.heading', { name: world.value.name }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (back) },
            ...{ class: "secondary" },
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_ctx.$t('adminWorldReseed.backToWorlds'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "current-seed" },
            'data-testid': "current-seed",
        });
        /** @type {__VLS_StyleScopedClasses['current-seed']} */ ;
        (__VLS_ctx.$t('adminWorldReseed.currentSeed', { seed: world.value.seed }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "warning" },
        });
        /** @type {__VLS_StyleScopedClasses['warning']} */ ;
        (__VLS_ctx.$t('adminWorldReseed.warning', { playerCount: world.value.playerCount }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "panel" },
        });
        /** @type {__VLS_StyleScopedClasses['panel']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('adminWorldReseed.generationHeading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('adminWorldReseed.generationHint'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "generation-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['generation-grid']} */ ;
        const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(GENERATION_FIELDS, {})));
        for (const [field] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (field.key),
                ...{ class: "generation-field" },
            });
            /** @type {__VLS_StyleScopedClasses['generation-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: (`gen-${field.key}`),
            });
            (__VLS_ctx.$t(`adminWorldReseed.${field.labelKey}`));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                id: (`gen-${field.key}`),
                type: "number",
                min: (field.min),
                max: (field.max),
                step: (field.step),
                'data-testid': (`gen-${field.key}`),
            });
            (generation.value[field.key]);
            // @ts-ignore
            [loading, $t, $t, $t, $t, $t, $t, $t, $t, loadError, loadError, world, world, world, world, GENERATION_FIELDS, generation,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (resetGenerationToCurrent) },
            ...{ class: "secondary" },
            'data-testid': "reset-generation",
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_ctx.$t('adminWorldReseed.resetToCurrent'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "panel" },
        });
        /** @type {__VLS_StyleScopedClasses['panel']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "controls" },
        });
        /** @type {__VLS_StyleScopedClasses['controls']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "seed",
        });
        (__VLS_ctx.$t('adminWorldReseed.seedLabel'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            id: "seed",
            type: "number",
            step: "1",
        });
        (__VLS_unwrap(seedInput, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (randomizeSeed) },
            ...{ class: "secondary" },
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_ctx.$t('adminWorldReseed.randomize'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (runPreview) },
            disabled: (previewing.value),
        });
        (previewing.value ? __VLS_ctx.$t('adminWorldReseed.generating') : __VLS_ctx.$t('adminWorldReseed.previewSeed'));
        if (previewError.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "error" },
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (previewError.value);
        }
        else if (preview.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "summary" },
                'data-testid': "preview-summary",
            });
            /** @type {__VLS_StyleScopedClasses['summary']} */ ;
            (__VLS_ctx.$t('adminWorldReseed.previewSummary', { seed: preview.value.seed, islandCount: preview.value.islandCount, landTileCount: preview.value.landTileCount }));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "panel" },
            'data-testid': "seed-scan",
        });
        /** @type {__VLS_StyleScopedClasses['panel']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('adminWorldReview.scanHeading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('adminWorldReview.scanHint'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "controls" },
        });
        /** @type {__VLS_StyleScopedClasses['controls']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "scan-from",
        });
        (__VLS_ctx.$t('adminWorldReview.scanFrom'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            id: "scan-from",
            type: "number",
            step: "1",
            'data-testid': "scan-from",
        });
        (__VLS_unwrap(scanFrom, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "scan-count",
        });
        (__VLS_ctx.$t('adminWorldReview.scanCount'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            id: "scan-count",
            ...{ class: "count" },
            type: "number",
            min: "1",
            max: (__VLS_unwrap(MAX_SCAN_COUNT, {})),
            step: "1",
            'data-testid': "scan-count",
        });
        (__VLS_unwrap(scanCount, {}));
        /** @type {__VLS_StyleScopedClasses['count']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (runScan) },
            disabled: (scanning.value),
            'data-testid': "scan-seeds",
        });
        (scanning.value ? __VLS_ctx.$t('adminWorldReview.scanning') : __VLS_ctx.$t('adminWorldReview.scan'));
        if (scanError.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "error" },
                'data-testid': "scan-error",
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (scanError.value);
        }
        else if (scanResult.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "scan-table" },
                'data-testid': "scan-results",
            });
            /** @type {__VLS_StyleScopedClasses['scan-table']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminWorldReview.colSeed'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminWorldReview.colErrors'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminWorldReview.colWarnings'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminWorldReview.colCutOff'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminWorldReview.colMissingBog'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminWorldReview.colNoLandingSpots'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('adminWorldReview.colLandingSpots'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            const __VLS_1 = __VLS_tryAsConstant((scanResult.value.seeds));
            for (const [s] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (s.seed),
                    'data-testid': "scan-row",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.seed);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: ({ bad: s.errors > 0 }) },
                });
                /** @type {__VLS_StyleScopedClasses['bad']} */ ;
                (s.errors);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.warnings);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.cutOffTiles);
                (__VLS_unwrap(formatShare, {})(s.cutOffShare));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: ({ bad: s.islandsMissingBog > 0 }) },
                });
                /** @type {__VLS_StyleScopedClasses['bad']} */ ;
                (s.islandsMissingBog);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.islandsWithoutLandingSpots);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (s.landingSpots);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!(world.value))
                                throw 0;
                            if (!!(scanError.value))
                                throw 0;
                            if (!(scanResult.value))
                                throw 0;
                            return (previewScanned(s.seed));
                            // @ts-ignore
                            [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, seedInput, previewing, previewing, previewError, previewError, preview, preview, preview, preview, scanFrom, MAX_SCAN_COUNT, scanCount, scanning, scanning, scanError, scanError, scanResult, scanResult, formatShare,];
                        } },
                    ...{ class: "secondary" },
                    disabled: (previewing.value),
                    'data-testid': "scan-preview",
                });
                /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                (__VLS_ctx.$t('adminWorldReview.previewThis'));
                // @ts-ignore
                [$t, previewing,];
            }
        }
        if (previewModel.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "preview-layout" },
            });
            /** @type {__VLS_StyleScopedClasses['preview-layout']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
                ...{ class: "map-panel" },
                ...{ class: ({ fullscreen: fullscreen.value }) },
            });
            /** @type {__VLS_StyleScopedClasses['map-panel']} */ ;
            /** @type {__VLS_StyleScopedClasses['fullscreen']} */ ;
            const __VLS_2 = WorldMapCanvas;
            // @ts-ignore
            const __VLS_3 = __VLS_asFunctionalComponent1(__VLS_2, new __VLS_2({
                // @ts-ignore
                ref: "canvasRef", worldModel: (previewModel.value), playerId: "admin-preview",
            }));
            const __VLS_4 = __VLS_3({
                ref: "canvasRef",
                worldModel: (previewModel.value),
                playerId: "admin-preview",
            }, ...__VLS_functionalComponentArgsRest(__VLS_3));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        if (!(world.value))
                            throw 0;
                        if (!(previewModel.value))
                            throw 0;
                        return (fullscreen.value = !fullscreen.value);
                        // @ts-ignore
                        [previewModel, previewModel, fullscreen, fullscreen, fullscreen,];
                    } },
                ...{ class: "expand" },
            });
            /** @type {__VLS_StyleScopedClasses['expand']} */ ;
            (fullscreen.value ? __VLS_ctx.$t('adminWorldReseed.exitFullScreen') : __VLS_ctx.$t('adminWorldReseed.fullScreen'));
            if (preview.value?.review) {
                const __VLS_7 = WorldReviewPanel;
                // @ts-ignore
                const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
                    // @ts-ignore
                    ...{ 'onSelect': {} }, ...{ class: "review-panel" }, review: (preview.value.review), selected: (__VLS_unwrap(selectedFinding, {})),
                }));
                const __VLS_9 = __VLS_8({
                    ...{ 'onSelect': {} },
                    ...{ class: "review-panel" },
                    review: (preview.value.review),
                    selected: (__VLS_unwrap(selectedFinding, {})),
                }, ...__VLS_functionalComponentArgsRest(__VLS_8));
                let __VLS_12;
                const __VLS_13 = {
                    /** @type {typeof __VLS_12.select} */
                    onSelect: (focusFinding),
                };
                void __VLS_13;
                /** @type {__VLS_StyleScopedClasses['review-panel']} */ ;
                var __VLS_10;
                var __VLS_11;
            }
        }
        if (preview.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
                ...{ class: "panel danger" },
            });
            /** @type {__VLS_StyleScopedClasses['panel']} */ ;
            /** @type {__VLS_StyleScopedClasses['danger']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
            (__VLS_ctx.$t('adminWorldReseed.commitHeading'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
            (__VLS_ctx.$t('adminWorldReseed.confirmNamePrefix'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
            (world.value.name);
            (__VLS_ctx.$t('adminWorldReseed.confirmNameSuffix'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "controls" },
            });
            /** @type {__VLS_StyleScopedClasses['controls']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: "confirm-name",
            });
            (__VLS_ctx.$t('adminWorldReseed.worldNameLabel'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                id: "confirm-name",
                value: (__VLS_unwrap(confirmName, {})),
                type: "text",
                autocomplete: "off",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (commit) },
                ...{ class: "destructive" },
                disabled: (!canCommit.value || committing.value),
            });
            /** @type {__VLS_StyleScopedClasses['destructive']} */ ;
            (committing.value ? __VLS_ctx.$t('adminWorldReseed.reseeding') : __VLS_ctx.$t('adminWorldReseed.reseedWorld'));
            if (commitError.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "error" },
                });
                /** @type {__VLS_StyleScopedClasses['error']} */ ;
                (commitError.value);
            }
            if (committed.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "done" },
                    'data-testid': "reseed-done",
                });
                /** @type {__VLS_StyleScopedClasses['done']} */ ;
                (__VLS_ctx.$t('adminWorldReseed.reseedDone', { seed: committed.value.seed, islandCount: committed.value.islandCount, deletedSettlements: committed.value.deletedSettlements }));
            }
        }
    }
    // @ts-ignore
    [$t, $t, $t, $t, $t, $t, $t, $t, $t, world, preview, preview, preview, fullscreen, selectedFinding, confirmName, canCommit, committing, committing, commitError, commitError, committed, committed, committed, committed,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
