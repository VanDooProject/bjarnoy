/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The Wasted Lands docs page's Utgard example: a real wasted island from the world generator (lib/docs/utgardExample.ts) with Utgard on it,
// two lines of Utgard wall round it with gates, and Jötun watchtowers outside the inner one, drawn by the game's own HexMapRenderer through a
// StaticWorldModel like WallExample.vue. The renderer picks every wall hex's piece and rotation from its neighbours. Hovering a hex
// names it.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDocsMapRenderer } from '../../composables/useDocsMapRenderer';
import DocsMapControls from './DocsMapControls.vue';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import { UTGARD_CENTRE, buildUtgardExampleStreams, buildUtgardExampleTiles, utgardExampleKindOf, } from '../../lib/docs/utgardExample';
const { t } = useI18n({ useScope: 'global' });
const world = new StaticWorldModel(buildUtgardExampleTiles());
world.setRivers(buildUtgardExampleStreams());
const NAME_KEY = {
    utgard: 'docs.wastedLands.island.giantWasted',
    volcano: 'docs.wastedLands.island.giantVolcano',
    camp: 'docs.wildlifeCamps.title',
    wall: 'docs.wastedLands.defences.walls.heading',
    gate: 'docs.wastedLands.defences.pieces.gate',
    tower: 'docs.wastedLands.defences.watchtower.heading',
    mountain: 'docs.wastedLands.tiles.mountain.wasted',
    lava: 'docs.wastedLands.tiles.river.wasted',
    wasteland: 'docs.wastedLands.tiles.grass.wasted',
    coast: 'docs.tiles.entries.coastalWater.title',
};
const hovered = ref(null);
const container = ref(null);
const canvas = ref(null);
const { zoomIn, zoomOut, wheelHint } = useDocsMapRenderer(canvas, container, {
    worldModel: world,
    previewCenter: UTGARD_CENTRE,
    onHoverChange: (info) => {
        hovered.value = info;
    },
});
const captionText = computed(() => {
    const info = hovered.value;
    if (!info)
        return t('docs.wastedLands.defences.example.hoverHint');
    return t(NAME_KEY[utgardExampleKindOf(world.getTile(info.coord.q, info.coord.r), world.getRiverTile(info.coord.q, info.coord.r))]);
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "utgard-example" },
        'data-testid': "utgard-example",
    });
    /** @type {__VLS_StyleScopedClasses['utgard-example']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "container",
        ...{ class: "map-host" },
    });
    /** @type {__VLS_StyleScopedClasses['map-host']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.canvas)({
        ref: "canvas",
        ...{ class: "docs-map-canvas" },
        role: "img",
        'aria-label': (__VLS_ctx.$t('docs.wastedLands.defences.example.alt')),
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
        'data-testid': "utgard-example-caption",
    });
    /** @type {__VLS_StyleScopedClasses['caption']} */ ;
    (__VLS_unwrap(captionText, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "note" },
    });
    /** @type {__VLS_StyleScopedClasses['note']} */ ;
    (__VLS_ctx.$t('docs.wastedLands.defences.example.caption'));
    // @ts-ignore
    [$t, $t, zoomIn, zoomOut, wheelHint, captionText,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
