/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import RavensScene from './RavensScene.vue';
// It ends on pale moonlight, which the host crossfades into the hold's pale fog.
// It comes in over the sending's last camera turn in a long crossfade (the ship stays one: see RavensScene).
export const meta = { id: 'ravens', role: 'intro', durationMs: 6000, fadeInMs: 1800 };
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
        const __VLS_0 = RavensScene;
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
