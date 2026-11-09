/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import SendingScene from './SendingScene.vue';
// No silence after the voice: the ravens scene starts as the narration ends and takes over in a long crossfade
// (its fadeInMs), while the sending's camera turn and ship are still moving.
export const meta = { id: 'sending', role: 'intro', durationMs: 10000, tailMs: 0 };
export default {};
const { defineProps, } = {};
const __VLS_export = await (async () => {
    const __VLS_props = defineProps();
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
        const __VLS_0 = SendingScene;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            paused: (__VLS_ctx.paused),
        }));
        const __VLS_2 = __VLS_1({
            paused: (__VLS_ctx.paused),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        // @ts-ignore
        [paused,];
        return {};
    };
    void [__VLS_template];
    return (await import('vue')).defineComponent({
        __typeProps: {},
    });
})();
