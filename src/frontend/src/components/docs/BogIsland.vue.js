/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The Bog Lands docs page's example map: a real island the bog generator made (see bogIsland.ts), drawn with the
// game's own HexMapRenderer through a StaticWorldModel, so its moss, creeks, lake shores and mouth are exactly
// what a world shows. Hovering a hex names it.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDocsMapRenderer } from '../../composables/useDocsMapRenderer';
import DocsMapControls from './DocsMapControls.vue';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import { BOG_ISLAND_RIVERS, bogIslandTileNameKey, buildBogIslandTiles } from '../../lib/docs/bogIsland';
const { t } = useI18n({ useScope: 'global' });
const world = new StaticWorldModel(buildBogIslandTiles());
world.setRivers(BOG_ISLAND_RIVERS);
const hovered = ref(null);
const container = ref(null);
const canvas = ref(null);
const { zoomIn, zoomOut, wheelHint } = useDocsMapRenderer(canvas, container, {
    worldModel: world,
    previewCenter: { q: 0, r: 0 },
    onHoverChange: (info) => {
        hovered.value = info;
    },
});
const captionText = computed(() => {
    const info = hovered.value;
    if (!info)
        return t('docs.bogLands.example.hoverHint');
    const { q, r } = info.coord;
    const key = bogIslandTileNameKey(world.getTile(q, r), world.getRiverTile(q, r));
    return key ? t(key) : t('docs.bogLands.example.hoverHint');
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "bog-island" },
    });
    /** @type {__VLS_StyleScopedClasses['bog-island']} */ ;
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
        'data-testid': "bog-island-caption",
    });
    /** @type {__VLS_StyleScopedClasses['caption']} */ ;
    (__VLS_unwrap(captionText, {}));
    // @ts-ignore
    [zoomIn, zoomOut, wheelHint, captionText,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
