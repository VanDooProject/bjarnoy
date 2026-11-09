/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// One HUD navigation link (top bar, avatar menu, mobile drawer): a real
// `<a href>` so Ctrl/Cmd/middle click opens the destination in a new tab,
// while a plain click stays in the app and runs the caller's own navigation
// (which may carry history state, e.g. a modal route's background view).
import { isPlainLeftClick } from '../../lib/navClick';
const { defineProps, defineEmits, } = {};
const __VLS_props = defineProps();
const emit = defineEmits();
function onClick(event) {
    if (!isPlainLeftClick(event))
        return;
    event.preventDefault();
    emit('navigate');
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
        ...{ onClick: (onClick) },
        href: (__VLS_ctx.href),
    });
    var __VLS_0 = {};
    var __VLS_1 = __VLS_0;
    // @ts-ignore
    [href,];
    return {
        __VLS_Slots: {},
    };
};
void [__VLS_template, {}];
const __VLS_base = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
const __VLS_export = {};
export default {};
