/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The Walls docs page's example: a short wall laid out on a few hexes and drawn by the game's own HexMapRenderer through a
// StaticWorldModel, the way BogIsland.vue draws its island. Only the hexes are placed (lib/docs/palisadeDocs.ts); the renderer
// picks every wall hex's piece and rotation from its neighbours exactly as a world does, sea end included.
import { ref } from 'vue';
import { useDocsMapRenderer } from '../../composables/useDocsMapRenderer';
import DocsMapControls from './DocsMapControls.vue';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import { exampleWallHexes, exampleWallTiles } from '../../lib/docs/palisadeDocs';
const world = new StaticWorldModel(exampleWallTiles());
const pieceCount = exampleWallHexes().length;
const container = ref(null);
const canvas = ref(null);
const { zoomIn, zoomOut, wheelHint } = useDocsMapRenderer(canvas, container, {
    worldModel: world,
    // The middle of the wall: the gate's far side, where the run turns towards the sea.
    previewCenter: { q: 1, r: 0 },
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "wall-example" },
    });
    /** @type {__VLS_StyleScopedClasses['wall-example']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "container",
        ...{ class: "map-host" },
    });
    /** @type {__VLS_StyleScopedClasses['map-host']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.canvas)({
        ref: "canvas",
        ...{ class: "docs-map-canvas" },
        role: "img",
        'aria-label': (__VLS_ctx.$t('docs.walls.example.alt', { count: __VLS_unwrap(pieceCount, {}) })),
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
    // @ts-ignore
    [$t, pieceCount, zoomIn, zoomOut, wheelHint,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
