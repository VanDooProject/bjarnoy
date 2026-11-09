/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { useI18n } from 'vue-i18n';
import './introButton.css';
import { introMounted } from './introSignal';
import { mountLandingIntro } from './startLandingIntro';
const { t } = useI18n({ useScope: 'global' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(introMounted, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['play-intro']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
    Transition;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        name: "play-intro-fade",
    }));
    const __VLS_2 = __VLS_1({
        name: "play-intro-fade",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    if (!introMounted.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    __VLS_withDotValue(introMounted, {});
                    if (!(!introMounted.value))
                        throw 0;
                    return (__VLS_unwrap(mountLandingIntro, {})({ playNow: true }));
                    // @ts-ignore
                    [introMounted, mountLandingIntro,];
                } },
            type: "button",
            ...{ class: "intro-btn play-intro" },
            'data-testid': "play-intro",
        });
        /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['play-intro']} */ ;
        (__VLS_unwrap(t, {})('intro.playIntro'));
    }
    // @ts-ignore
    [t,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
