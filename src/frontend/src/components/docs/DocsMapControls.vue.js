/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The overlay every inline docs map carries (composables/useDocsMapRenderer.ts hands over what it needs): "+" / "−" buttons top
// right, and a "Ctrl + scroll to zoom" pill shown for a moment after a plain wheel was left to the page. Place it inside the
// map host (`position: relative`), after the canvas.
import { fadeChip } from '../../lib/hud/chipMotion';
const { defineProps, } = {};
const __VLS_props = defineProps();
// Glyphs, not words: the buttons are named by their aria-label.
const PLUS = '+';
const MINUS = '\u2212';
const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
function enter(el, done) {
    void fadeChip(el, 'in').then(done);
}
function leave(el, done) {
    void fadeChip(el, 'out').then(done);
}
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
    __VLS_withDotValue(isApple, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['zoom-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['zoom-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "map-controls" },
    });
    /** @type {__VLS_StyleScopedClasses['map-controls']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "zoom-buttons" },
    });
    /** @type {__VLS_StyleScopedClasses['zoom-buttons']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onPointerdown: () => { } },
        ...{ onClick: (...[$event]) => {
                void $event;
                return (__VLS_ctx.zoomIn());
                // @ts-ignore
                [zoomIn,];
            } },
        type: "button",
        ...{ class: "zoom-btn" },
        'data-testid': "docs-map-zoom-in",
        'aria-label': (__VLS_ctx.$t('docs.mapZoom.zoomIn')),
    });
    /** @type {__VLS_StyleScopedClasses['zoom-btn']} */ ;
    (__VLS_unwrap(PLUS, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onPointerdown: () => { } },
        ...{ onClick: (...[$event]) => {
                void $event;
                return (__VLS_ctx.zoomOut());
                // @ts-ignore
                [$t, PLUS, zoomOut,];
            } },
        type: "button",
        ...{ class: "zoom-btn" },
        'data-testid': "docs-map-zoom-out",
        'aria-label': (__VLS_ctx.$t('docs.mapZoom.zoomOut')),
    });
    /** @type {__VLS_StyleScopedClasses['zoom-btn']} */ ;
    (__VLS_unwrap(MINUS, {}));
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
    Transition;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ 'onEnter': {} }, ...{ 'onLeave': {} }, css: (false),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onEnter': {} },
        ...{ 'onLeave': {} },
        css: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    const __VLS_6 = {
        /** @type {typeof __VLS_5.enter} */
        onEnter: (enter),
    };
    void __VLS_6;
    const __VLS_7 = {
        /** @type {typeof __VLS_5.leave} */
        onLeave: (leave),
    };
    void __VLS_7;
    var __VLS_3;
    var __VLS_4;
    const { default: __VLS_8 } = __VLS_nonNull(__VLS_3.slots);
    if (__VLS_ctx.wheelHint) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "wheel-hint" },
            'data-testid': "docs-map-wheel-hint",
        });
        /** @type {__VLS_StyleScopedClasses['wheel-hint']} */ ;
        (isApple.value ? __VLS_ctx.$t('docs.mapZoom.hintCmd') : __VLS_ctx.$t('docs.mapZoom.hintCtrl'));
    }
    // @ts-ignore
    [$t, $t, $t, MINUS, wheelHint, isApple,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
