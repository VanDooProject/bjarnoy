/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, watch } from 'vue';
import { introText } from './introText';
import FeatureList from './FeatureList.vue';
import ImpressumLink from './ImpressumLink.vue';
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const t = (key, params) => introText(props.locale, `landing.${key}`, params);
const pct = computed(() => Math.floor(Math.min(1, Math.max(0, props.loadFraction)) * 100));
const ready = computed(() => props.loadFraction >= 1);
const armed = ref(false);
const loadState = computed(() => (ready.value ? 'ready' : armed.value ? 'armed' : 'loading'));
const mapLabel = computed(() => (ready.value ? t('map') : armed.value ? t('mapArmed', { pct: pct.value }) : t('mapLoading', { pct: pct.value })));
function onMap() {
    if (ready.value)
        emit('map');
    else
        armed.value = !armed.value;
}
watch(ready, (isReady) => {
    if (isReady && armed.value) {
        armed.value = false;
        emit('map');
    }
});
// the game's name is not translated
const TITLE = 'BJARNØY';
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
    __VLS_withDotValue(ready, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['landing-page']} */ ;
    /** @type {__VLS_StyleScopedClasses['copy']} */ ;
    /** @type {__VLS_StyleScopedClasses['usps']} */ ;
    /** @type {__VLS_StyleScopedClasses['usps']} */ ;
    /** @type {__VLS_StyleScopedClasses['ctas']} */ ;
    /** @type {__VLS_StyleScopedClasses['sw']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['saga']} */ ;
    /** @type {__VLS_StyleScopedClasses['map']} */ ;
    /** @type {__VLS_StyleScopedClasses['map']} */ ;
    /** @type {__VLS_StyleScopedClasses['legal']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-page']} */ ;
    /** @type {__VLS_StyleScopedClasses['left']} */ ;
    /** @type {__VLS_StyleScopedClasses['copy']} */ ;
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    /** @type {__VLS_StyleScopedClasses['ctas']} */ ;
    /** @type {__VLS_StyleScopedClasses['usps']} */ ;
    /** @type {__VLS_StyleScopedClasses['usps']} */ ;
    /** @type {__VLS_StyleScopedClasses['legal']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-page']} */ ;
    /** @type {__VLS_StyleScopedClasses['left']} */ ;
    /** @type {__VLS_StyleScopedClasses['copy']} */ ;
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    /** @type {__VLS_StyleScopedClasses['tag']} */ ;
    /** @type {__VLS_StyleScopedClasses['ctas']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['mlink']} */ ;
    /** @type {__VLS_StyleScopedClasses['rtag']} */ ;
    /** @type {__VLS_StyleScopedClasses['usps']} */ ;
    /** @type {__VLS_StyleScopedClasses['usps']} */ ;
    /** @type {__VLS_StyleScopedClasses['legal']} */ ;
    /** @type {__VLS_StyleScopedClasses['left']} */ ;
    /** @type {__VLS_StyleScopedClasses['copy']} */ ;
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    /** @type {__VLS_StyleScopedClasses['tag']} */ ;
    /** @type {__VLS_StyleScopedClasses['ctas']} */ ;
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['map']} */ ;
    /** @type {__VLS_StyleScopedClasses['mlink']} */ ;
    /** @type {__VLS_StyleScopedClasses['usps']} */ ;
    /** @type {__VLS_StyleScopedClasses['usps']} */ ;
    /** @type {__VLS_StyleScopedClasses['legal']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "landing-page" },
        'data-testid': "landing-page",
    });
    /** @type {__VLS_StyleScopedClasses['landing-page']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "left" },
    });
    /** @type {__VLS_StyleScopedClasses['left']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "copy" },
    });
    /** @type {__VLS_StyleScopedClasses['copy']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({
        ...{ class: "title" },
    });
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    (__VLS_unwrap(TITLE, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "tag" },
    });
    /** @type {__VLS_StyleScopedClasses['tag']} */ ;
    (__VLS_unwrap(t, {})('tagline'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ctas" },
    });
    /** @type {__VLS_StyleScopedClasses['ctas']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "sw" },
    });
    /** @type {__VLS_StyleScopedClasses['sw']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (__VLS_unwrap(emit, {})('hear'));
                // @ts-ignore
                [TITLE, t, emit,];
            } },
        type: "button",
        ...{ class: "btn saga" },
        'data-testid': "landing-hear",
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['saga']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
        width: "18",
        height: "18",
        viewBox: "0 0 24 24",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M7 4l13 8-13 8z",
        fill: "currentColor",
    });
    (__VLS_unwrap(t, {})('hear'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (__VLS_unwrap(emit, {})('muted'));
                // @ts-ignore
                [t, emit,];
            } },
        type: "button",
        ...{ class: "mlink" },
        'data-testid': "landing-muted",
    });
    /** @type {__VLS_StyleScopedClasses['mlink']} */ ;
    (__VLS_unwrap(t, {})('muted'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (onMap) },
        type: "button",
        ...{ class: "btn map" },
        ...{ class: (__VLS_unwrap(loadState, {})) },
        'aria-pressed': (ready.value ? undefined : __VLS_unwrap(armed, {})),
        'data-testid': "landing-map",
        'data-load-state': (__VLS_unwrap(loadState, {})),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['map']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "lbl" },
    });
    /** @type {__VLS_StyleScopedClasses['lbl']} */ ;
    (__VLS_unwrap(mapLabel, {}));
    if (ready.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "rtag" },
        });
        /** @type {__VLS_StyleScopedClasses['rtag']} */ ;
        (__VLS_unwrap(t, {})('ready'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "bar" },
        ...{ style: ({ width: ready.value ? '0%' : `${__VLS_unwrap(pct, {})}%` }) },
    });
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    const __VLS_0 = FeatureList;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "usps" }, locale: (__VLS_ctx.locale),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "usps" },
        locale: (__VLS_ctx.locale),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['usps']} */ ;
    const __VLS_5 = ImpressumLink;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        // @ts-ignore
        ...{ class: "legal" }, locale: (__VLS_ctx.locale),
    }));
    const __VLS_7 = __VLS_6({
        ...{ class: "legal" },
        locale: (__VLS_ctx.locale),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    /** @type {__VLS_StyleScopedClasses['legal']} */ ;
    // @ts-ignore
    [t, t, loadState, loadState, ready, ready, ready, armed, mapLabel, pct, locale, locale,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
