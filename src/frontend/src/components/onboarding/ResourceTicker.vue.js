/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The rising "+N {resource}/h" label (design handoff "2a", frames 2/4/5):
// fires once a guided building is actually placed, at its own real output
// (buildingEconomy.ts's buildingStatsFor — the same formula the hover
// tooltip and build card use), not a fabricated number. One-shot per tick,
// self-removing on `animationend` rather than looping — like the landfall
// burst, the mockup's own keyframe only repeats because it's a static
// preview frame.
import { useI18n } from 'vue-i18n';
import { resourceName } from '../../i18n/catalogueNames';
const { defineProps, defineEmits, } = {};
const __VLS_props = defineProps();
const emit = defineEmits();
const { t } = useI18n({ useScope: 'global' });
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
    void {};
    /** @type {__VLS_StyleScopedClasses['tick']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_ctx.ticks));
    for (const [tick] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onAnimationend: (...[$event]) => {
                    void $event;
                    return (__VLS_unwrap(emit, {})('expire', tick.id));
                    // @ts-ignore
                    [ticks, emit,];
                } },
            key: (tick.id),
            ...{ class: "tick" },
            ...{ style: ({ left: `${tick.x}px`, top: `${tick.y}px`, '--tint': `var(--${tick.resource})` }) },
        });
        /** @type {__VLS_StyleScopedClasses['tick']} */ ;
        (__VLS_unwrap(t, {})('hud.hoverTooltip.outputResourceRate', { amount: tick.amount, resource: __VLS_unwrap(resourceName, {})(tick.resource) }));
        // @ts-ignore
        [t, resourceName,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
