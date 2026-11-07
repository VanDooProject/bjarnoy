/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, inject } from 'vue';
import LongshipScene from './LongshipScene.vue';
import { INTRO_BEAT } from './types';
// The hold and the landfall are one scene: the coast arrives and the fog closes on the running hold.
// Hold: --loop-period drives the scene's ambient loops; it has no seam, so it can end at any moment.
// Its shortest run is the time to read its narration (the host passes that to the sequencer);
// durationMs is only the fallback for that.
export const meta = { id: 'hold', role: 'hold', durationMs: 4000, loopMs: 12000, scene: 'longship' };
// Landfall: the fog is solid at 2.8 s, then the host fades the intro out over 1 s onto the map's fog.
export const landfallMeta = { id: 'landfall', role: 'exit', durationMs: 3800, scene: 'longship' };
export default {};
const { defineProps, } = {};
const __VLS_export = await (async () => {
    const __VLS_props = defineProps();
    const beat = inject(INTRO_BEAT, null);
    const landfall = computed(() => beat?.value === 'landfall');
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
        const __VLS_0 = LongshipScene;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            paused: (__VLS_ctx.paused), landfall: (__VLS_unwrap(landfall, {})),
        }));
        const __VLS_2 = __VLS_1({
            paused: (__VLS_ctx.paused),
            landfall: (__VLS_unwrap(landfall, {})),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        // @ts-ignore
        [paused, landfall,];
        return {};
    };
    void [__VLS_template];
    return (await import('vue')).defineComponent({
        __typeProps: {},
    });
})();
