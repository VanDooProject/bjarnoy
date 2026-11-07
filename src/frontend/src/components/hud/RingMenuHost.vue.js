/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The one place a ring menu is mounted and unmounted: a <Transition> that
// holds the DOM while the bubbles are pulled into the hub and the hub fades
// (or, after a confirmed build, the chosen bubble drops onto the hex).
// `retractRing` makes the leaving ring click-through first, so a map drag
// started on it still begins immediately, and respects the motion settings
// (it resolves at once with motion off). MapView and LandingView both put
// their <RingMenu v-if> in this host's slot, so the close animation can't
// exist in one view and be missing in the other.
import { retractRing } from '../../lib/map/ringMotion';
const { defineEmits, } = {};
const emit = defineEmits();
function onLeave(el, done) {
    const finish = () => {
        emit('retracted');
        done();
    };
    retractRing(el).then(finish, finish);
}
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
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
    Transition;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ 'onLeave': {} }, css: (false),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onLeave': {} },
        css: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    const __VLS_6 = {
        /** @type {typeof __VLS_5.leave} */
        onLeave: (onLeave),
    };
    void __VLS_6;
    var __VLS_3;
    var __VLS_4;
    const { default: __VLS_7 } = __VLS_nonNull(__VLS_3.slots);
    var __VLS_8 = {};
    var __VLS_9 = __VLS_8;
    return {
        __VLS_Slots: {},
    };
};
void [__VLS_template, {}];
const __VLS_base = (await import('vue')).defineComponent({
    __typeEmits: {},
});
const __VLS_export = {};
export default {};
