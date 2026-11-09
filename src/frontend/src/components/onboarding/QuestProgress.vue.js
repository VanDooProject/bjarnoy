/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The counted progress of a quest, in one of three looks by quest kind
// (lib/quests.ts questProgressKind): pips for "build n", a bar for "train n",
// numbered level steps for "reach level n". Used by the card and the phone strip.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
const { defineProps, } = {};
const props = defineProps();
const { t } = useI18n({ useScope: 'global' });
const remaining = computed(() => Math.max(0, props.progress.target - props.progress.current));
const units = computed(() => Array.from({ length: props.progress.target }, (_, i) => i + 1));
const percent = computed(() => Math.min(100, (props.progress.current / Math.max(1, props.progress.target)) * 100));
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
    void {};
    /** @type {__VLS_StyleScopedClasses['qp']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['pips']} */ ;
    /** @type {__VLS_StyleScopedClasses['pips']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['on']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "qp" },
        ...{ class: ({ compact: __VLS_ctx.compact }) },
    });
    /** @type {__VLS_StyleScopedClasses['qp']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "qp-visual" },
        ...{ class: (`kind-${__VLS_ctx.kind}`) },
        'data-testid': "quest-progress-visual",
        'data-kind': (__VLS_ctx.kind),
    });
    /** @type {__VLS_StyleScopedClasses['qp-visual']} */ ;
    if (__VLS_ctx.kind === 'train') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "bar" },
        });
        /** @type {__VLS_StyleScopedClasses['bar']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ style: ({ width: `${__VLS_unwrap(percent, {})}%` }) },
        });
    }
    else if (__VLS_ctx.kind === 'build') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pips" },
        });
        /** @type {__VLS_StyleScopedClasses['pips']} */ ;
        const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(units, {})));
        for (const [n] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                key: (n),
                ...{ class: ({ on: n <= __VLS_ctx.progress.current }) },
            });
            /** @type {__VLS_StyleScopedClasses['on']} */ ;
            // @ts-ignore
            [compact, kind, kind, kind, kind, percent, units, progress,];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "steps" },
        });
        /** @type {__VLS_StyleScopedClasses['steps']} */ ;
        const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(units, {})));
        for (const [n] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                key: (n),
                ...{ class: ({ on: n <= __VLS_ctx.progress.current, cur: n === __VLS_ctx.progress.current, goal: n === __VLS_ctx.progress.target }) },
            });
            /** @type {__VLS_StyleScopedClasses['on']} */ ;
            /** @type {__VLS_StyleScopedClasses['cur']} */ ;
            /** @type {__VLS_StyleScopedClasses['goal']} */ ;
            (n);
            // @ts-ignore
            [units, progress, progress, progress,];
        }
    }
    if (!__VLS_ctx.compact) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "left" },
            'data-testid': "quest-progress-left",
        });
        /** @type {__VLS_StyleScopedClasses['left']} */ ;
        (__VLS_unwrap(t, {})(`quests.left.${__VLS_ctx.kind}`, { n: __VLS_unwrap(remaining, {}) }, __VLS_unwrap(remaining, {})));
    }
    // @ts-ignore
    [compact, kind, t, remaining, remaining,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
