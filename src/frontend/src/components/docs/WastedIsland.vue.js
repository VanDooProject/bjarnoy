/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The Wasted Lands docs page's "turning island": a made-up island (see
// wastedIsland.ts for the data it renders) whose hexes cross-fade from their
// living art to their wasted counterpart as the blight slider advances.
//
// Draws with the game's own HexMapRenderer (via StaticWorldModel), fed a
// fixed Tile[] from buildIslandTiles — the same terrainBase -> hover ->
// terrainTop draw order and the same textures.ts/giantTiles.ts art lookups a
// real in-game island uses, rather than this component's own hand-positioned
// DOM sprites (what it used before). That's also why the hover wash now sits
// correctly *under* a giant's top parts instead of drawn over them: it's the
// exact same hover layer the game itself draws between the two terrain
// layers, not a separate SVG overlay guessing at stacking order.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDocsMapRenderer } from '../../composables/useDocsMapRenderer';
import DocsMapControls from './DocsMapControls.vue';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import { buildIslandStreams, buildIslandTiles, delayFraction, islandHexInfo } from '../../lib/docs/wastedIsland';
const { t } = useI18n({ useScope: 'global' });
const stage = ref(4);
const rotation = ref(0);
const playing = ref(false);
let playTimer = null;
const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
// useHexMapRenderer reads its options once, non-reactively, at mount (see
// SettlementCanvas.vue's matching comment) — every later change (the blight
// slider, the rotate buttons) instead goes through this same model's own
// `setTiles` plus the exposed renderer's `forceRebuild`, the way the real
// game mutates its WorldModel and re-renders rather than re-mounting.
const world = new StaticWorldModel(buildIslandTiles(rotation.value, stage.value));
world.setRivers(buildIslandStreams(rotation.value, stage.value));
// The hovered hex, plus which rotation it was hovered *at* — a hex's
// identity (kind/turnsAt) is looked up per-rotation (islandHexInfo), and the
// rotate buttons don't themselves fire a new hover event, so without this a
// post-rotation lookup against a pre-rotation coordinate could resolve to
// the wrong (or no) hex until the pointer next moves.
const hovered = ref(null);
const container = ref(null);
const canvas = ref(null);
const { renderer, zoomIn, zoomOut, wheelHint } = useDocsMapRenderer(canvas, container, {
    worldModel: world,
    previewCenter: { q: 0, r: 0 },
    onHoverChange: (info) => {
        hovered.value = info ? { coord: info.coord, rotation: rotation.value } : null;
    },
});
// Regression fix while porting this off the old DOM version (which had the
// exact same bug): every branch here was missing the `docs.` namespace
// prefix i18n/index.ts wraps `docs.json`'s content in (see how every other
// key in this file's own template is written, e.g. `docs.wastedLands.island.blight`)
// — `t()` on a key vue-i18n can't resolve falls back to printing the raw key
// string, so a hovered hex's caption has always shown e.g.
// "wastedLands.tiles.grass.living" instead of "Grassland".
function tileNameKey(kind, turned) {
    if (kind === 'utgard')
        return turned ? 'docs.wastedLands.island.giantWasted' : 'docs.wastedLands.island.giantLiving';
    if (kind === 'volcano')
        return turned ? 'docs.wastedLands.island.giantVolcano' : 'docs.wastedLands.island.giantMountainLiving';
    return `docs.wastedLands.tiles.${kind}.${turned ? 'wasted' : 'living'}`;
}
const captionText = computed(() => {
    const h = hovered.value;
    const info = h ? islandHexInfo(h.rotation, h.coord) : undefined;
    if (!info)
        return t('docs.wastedLands.island.hoverHint');
    if (h && world.getRiverTile(h.coord.q, h.coord.r))
        return t('docs.wastedLands.tiles.river.wasted');
    return t(tileNameKey(info.kind, stage.value >= info.turnsAt));
});
// The blight slider (and `togglePlay`'s own steps through it) rebuilds the
// whole island for the new stage and cross-fades the swap — mirrors the old
// DOM version's CSS transition (700ms, staggered by `delay * 400ms` per hex,
// ring by ring from the centre out).
watch(stage, (newStage) => {
    world.setTiles(buildIslandTiles(rotation.value, newStage));
    world.setRivers(buildIslandStreams(rotation.value, newStage));
    renderer.value?.forceRebuild({
        transition: {
            durationMs: reducedMotion ? 0 : 700,
            delayMs: (c) => (reducedMotion ? 0 : delayFraction(rotation.value, c) * 400),
        },
    });
});
function rotate(delta) {
    rotation.value = (((rotation.value + delta) % 6) + 6) % 6;
    world.setTiles(buildIslandTiles(rotation.value, stage.value));
    world.setRivers(buildIslandStreams(rotation.value, stage.value));
    // No transition here: a rotation swaps every hex's screen position, not
    // just its texture — a cross-fade would read as every tile's art
    // dissolving in place while the whole island silently jumps underneath it,
    // not as the island actually turning.
    renderer.value?.forceRebuild();
}
function togglePlay() {
    if (playing.value) {
        if (playTimer)
            clearInterval(playTimer);
        playTimer = null;
        playing.value = false;
        return;
    }
    playing.value = true;
    stage.value = 0;
    playTimer = setInterval(() => {
        if (stage.value >= 4) {
            if (playTimer)
                clearInterval(playTimer);
            playTimer = null;
            playing.value = false;
            return;
        }
        stage.value += 1;
    }, 1400);
}
onBeforeUnmount(() => {
    if (playTimer)
        clearInterval(playTimer);
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    void {};
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['rotate-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['play-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['rotate-button']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "wasted-island" },
    });
    /** @type {__VLS_StyleScopedClasses['wasted-island']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "controls" },
    });
    /** @type {__VLS_StyleScopedClasses['controls']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "slider-row" },
    });
    /** @type {__VLS_StyleScopedClasses['slider-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "slider-label" },
    });
    /** @type {__VLS_StyleScopedClasses['slider-label']} */ ;
    (__VLS_ctx.$t('docs.wastedLands.island.blight'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "range",
        min: "0",
        max: "4",
        step: "1",
        'data-testid': "blight-slider",
        'aria-label': (__VLS_ctx.$t('docs.wastedLands.island.blight')),
    });
    (__VLS_unwrap(stage, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "stage-label" },
    });
    /** @type {__VLS_StyleScopedClasses['stage-label']} */ ;
    (__VLS_unwrap(t, {})(`docs.wastedLands.island.stages.s${__VLS_unwrap(stage, {})}`));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "buttons" },
    });
    /** @type {__VLS_StyleScopedClasses['buttons']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (togglePlay) },
        type: "button",
        ...{ class: "play-button" },
    });
    /** @type {__VLS_StyleScopedClasses['play-button']} */ ;
    (__VLS_ctx.$t('docs.wastedLands.island.play'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (rotate(-1));
                // @ts-ignore
                [$t, $t, $t, stage, stage, t,];
            } },
        type: "button",
        ...{ class: "rotate-button" },
        'aria-label': (__VLS_ctx.$t('docs.wastedLands.island.rotateLeft')),
    });
    /** @type {__VLS_StyleScopedClasses['rotate-button']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (rotate(1));
                // @ts-ignore
                [$t,];
            } },
        type: "button",
        ...{ class: "rotate-button" },
        'aria-label': (__VLS_ctx.$t('docs.wastedLands.island.rotateRight')),
    });
    /** @type {__VLS_StyleScopedClasses['rotate-button']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "container",
        ...{ class: "map-host" },
    });
    /** @type {__VLS_StyleScopedClasses['map-host']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.canvas)({
        ref: "canvas",
        ...{ class: "docs-map-canvas" },
    });
    /** @type {__VLS_StyleScopedClasses['docs-map-canvas']} */ ;
    const __VLS_0 = DocsMapControls;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        zoomIn: (__VLS_unwrap(zoomIn, {})), zoomOut: (__VLS_unwrap(zoomOut, {})), wheelHint: (__VLS_unwrap(wheelHint, {})),
    }));
    const __VLS_2 = __VLS_1({
        zoomIn: (__VLS_unwrap(zoomIn, {})),
        zoomOut: (__VLS_unwrap(zoomOut, {})),
        wheelHint: (__VLS_unwrap(wheelHint, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "caption" },
        'data-testid': "island-caption",
    });
    /** @type {__VLS_StyleScopedClasses['caption']} */ ;
    (__VLS_unwrap(captionText, {}));
    // @ts-ignore
    [$t, zoomIn, zoomOut, wheelHint, captionText,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
