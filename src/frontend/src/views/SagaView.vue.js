/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
// The saga page: the story of the intro in six steps, and the link to watch it again.
const STEPS = [0, 1, 2, 3, 4, 5];
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    void {};
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "saga" }, title: (__VLS_ctx.$t('docs.saga.title')), caption: "DOCS · SAGA", intro: (__VLS_ctx.$t('docs.saga.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "saga" },
        title: (__VLS_ctx.$t('docs.saga.title')),
        caption: "DOCS · SAGA",
        intro: (__VLS_ctx.$t('docs.saga.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['saga']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.ol, __VLS_intrinsics.ol)({
        ...{ class: "steps" },
        'data-testid': "saga-steps",
    });
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    const __VLS_6 = __VLS_tryAsConstant((__VLS_unwrap(STEPS, {})));
    for (const [i] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            key: (i),
        });
        (__VLS_ctx.$t(`docs.saga.steps[${i}]`));
        // @ts-ignore
        [$t, $t, $t, STEPS,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "watch" },
    });
    /** @type {__VLS_StyleScopedClasses['watch']} */ ;
    const __VLS_7 = DocsPageLink || DocsPageLink;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        // @ts-ignore
        to: "/docs/saga/replay", dataTestid: "saga-watch",
    }));
    const __VLS_9 = __VLS_8({
        to: "/docs/saga/replay",
        dataTestid: "saga-watch",
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    var __VLS_10;
    const { default: __VLS_12 } = __VLS_nonNull(__VLS_10.slots);
    (__VLS_ctx.$t('docs.saga.watch'));
    // @ts-ignore
    [$t,];
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
