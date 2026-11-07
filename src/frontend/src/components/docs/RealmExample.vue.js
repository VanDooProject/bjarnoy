/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The Extending the realm docs page's example map: a small island with the longhouse near its middle, drawn by the game's own
// HexMapRenderer through a StaticWorldModel (like WallExample.vue and LandMovementExample.vue). A step picker adds the towers one by
// one; every step re-claims the ground through the model itself (lib/docs/realmExample.ts), so the gold border is the real
// realm border the map draws round your own territory.
import { ref, watch } from 'vue';
import { useDocsMapRenderer } from '../../composables/useDocsMapRenderer';
import DocsMapControls from './DocsMapControls.vue';
import { StaticWorldModel } from '../../lib/map/StaticWorldModel';
import { REALM_EXAMPLE_PLAYER, REALM_EXAMPLE_STEPS, applyRealmExampleStep } from '../../lib/docs/realmExample';
const step = ref(0);
const world = new StaticWorldModel();
applyRealmExampleStep(world, step.value);
const container = ref(null);
const canvas = ref(null);
// useHexMapRenderer reads its options once, at mount: a later step goes through the same model's `setTiles` and the renderer's
// `forceRebuild`, as WastedIsland.vue does.
const { renderer, zoomIn, zoomOut, wheelHint } = useDocsMapRenderer(canvas, container, {
    worldModel: world,
    playerId: REALM_EXAMPLE_PLAYER,
    previewCenter: { q: 3, r: 0 },
});
watch(step, (next) => {
    applyRealmExampleStep(world, next);
    renderer.value?.forceRebuild();
});
const lastStep = REALM_EXAMPLE_STEPS.length - 1;
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    void {};
    /** @type {__VLS_StyleScopedClasses['step-slider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "realm-example" },
        'data-testid': "realm-example",
    });
    /** @type {__VLS_StyleScopedClasses['realm-example']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "container",
        ...{ class: "map-host" },
    });
    /** @type {__VLS_StyleScopedClasses['map-host']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.canvas)({
        ref: "canvas",
        ...{ class: "docs-map-canvas" },
        role: "img",
        'aria-label': (__VLS_ctx.$t('docs.realm.example.alt')),
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
        'data-testid': "realm-example-caption",
    });
    /** @type {__VLS_StyleScopedClasses['caption']} */ ;
    (__VLS_ctx.$t(`docs.realm.example.steps.${__VLS_unwrap(step, {}) + 1}`));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "step-slider" },
    });
    /** @type {__VLS_StyleScopedClasses['step-slider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "step-label" },
    });
    /** @type {__VLS_StyleScopedClasses['step-label']} */ ;
    (__VLS_ctx.$t('docs.realm.example.step'));
    (__VLS_unwrap(step, {}) + 1);
    (__VLS_unwrap(lastStep, {}) + 1);
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "range",
        min: "0",
        max: (__VLS_unwrap(lastStep, {})),
        step: "1",
        'data-testid': "realm-example-slider",
    });
    (__VLS_unwrap(step, {}));
    // @ts-ignore
    [$t, $t, $t, zoomIn, zoomOut, wheelHint, step, step, step, lastStep, lastStep,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
