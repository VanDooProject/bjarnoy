/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// One palisade piece the way the game draws it: the ground's `terrain` base frame with the piece's own
// `buildings-static` top on it, layered into one picture. The sea end stands in water, so it uses its own
// base. A frame the atlas does not have simply leaves its layer out.
import { computed } from 'vue';
import AnimatedBuildingSprite from '../AnimatedBuildingSprite.vue';
import { findAtlasFrame } from '../../lib/map/atlas';
import { pieceFrameNames } from '../../lib/docs/palisadeDocs';
const { defineProps, withDefaults, } = {};
const props = withDefaults(defineProps(), { ground: 'grass' });
const layers = computed(() => {
    const names = pieceFrameNames(props.piece, props.dir, props.stage, props.ground);
    return {
        base: findAtlasFrame('buildings-static', names.ownBase) ?? findAtlasFrame('terrain', names.base),
        top: findAtlasFrame('buildings-static', names.top),
    };
});
const __VLS_defaults = { ground: 'grass' };
void __VLS_defaults;
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
    __VLS_withDotValue(layers, {});
    if (layers.value.top) {
        const __VLS_0 = AnimatedBuildingSprite;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            ...{ class: "wall-piece" }, layers: (layers.value),
        }));
        const __VLS_2 = __VLS_1({
            ...{ class: "wall-piece" },
            layers: (layers.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        /** @type {__VLS_StyleScopedClasses['wall-piece']} */ ;
    }
    // @ts-ignore
    [layers, layers,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
