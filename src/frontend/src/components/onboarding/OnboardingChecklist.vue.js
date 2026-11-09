/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The landing page's guided-onboarding progress: a stepper line of three hex nodes (step number, a check once
// done) joined by a thin line, each with its building's name under it; the current step also says what to do. A
// step reads "done" the instant its building is actually standing (see onboardingGuidance.ts), not by a fixed
// step counter. Pulled out of LandingView.vue so the derivation (onboardingGuidance.ts) and the render can each
// be tested on their own. One element per node and one per connecting line segment, so each can be animated.
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildingName } from '../../i18n/catalogueNames';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { TOUCH_QUERY } from '../../lib/breakpoints';
import { motionPreferences } from '../../lib/perf/motionPreferences';
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const { t } = useI18n({ useScope: 'global' });
const isTouch = useMediaQuery(TOUCH_QUERY);
function nameFor(key) {
    return key === 'longhouse' ? t('landing.tray.longhouseName') : buildingName(key);
}
// Progress animation. Only a real state change plays it, never the first render. Per step the classes are:
// `just-done` (the node flips to its tick), `line-in` (the ember runs along the line into the step and fills it),
// `ignite` (the step becomes current: glow, colours, instruction). They stay until the next change, so nothing
// restarts mid-way; the timings live in the CSS custom properties on `.steps`. With the HUD motion setting off
// (which also follows the device's reduced-motion setting, see motionPreferences) nothing of it plays and states
// just fade.
const reduced = computed(() => !motionPreferences.hudEnabled);
const fx = ref(props.guidance.rows.map(() => ''));
const allDone = ref(false);
watch(() => props.guidance.rows.map((row) => row.state), (now, before) => {
    if (reduced.value) {
        fx.value = now.map(() => '');
        allDone.value = false;
        return;
    }
    const next = now.map(() => new Set());
    before.forEach((was, i) => {
        if (was === 'done' || now[i] !== 'done')
            return;
        next[i].add('just-done');
        if (i + 1 < now.length) {
            next[i + 1].add('line-in');
            if (now[i + 1] === 'current')
                next[i + 1].add('ignite');
        }
    });
    fx.value = next.map((classes) => [...classes].join(' '));
    allDone.value = now.every((state) => state === 'done') && before.some((state) => state !== 'done');
});
/** What to do now; only the current step says it. */
function instructionFor(row) {
    if (row.key === 'longhouse')
        return isTouch.value ? t('landing.tray.tapToPlace') : t('landing.tray.clickToPlace');
    return isTouch.value ? t('landing.tray.tapEmptyHex') : t('landing.tray.clickEmptyHex');
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
    __VLS_withDotValue(fx, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['step']} */ ;
    /** @type {__VLS_StyleScopedClasses['fill']} */ ;
    /** @type {__VLS_StyleScopedClasses['fill']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['check']} */ ;
    /** @type {__VLS_StyleScopedClasses['current']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['current']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['current']} */ ;
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    /** @type {__VLS_StyleScopedClasses['done']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['done']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['done']} */ ;
    /** @type {__VLS_StyleScopedClasses['num']} */ ;
    /** @type {__VLS_StyleScopedClasses['done']} */ ;
    /** @type {__VLS_StyleScopedClasses['check']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-reduced']} */ ;
    /** @type {__VLS_StyleScopedClasses['current']} */ ;
    /** @type {__VLS_StyleScopedClasses['glow']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-reduced']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['just-done']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['just-done']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['just-done']} */ ;
    /** @type {__VLS_StyleScopedClasses['check']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-reduced']} */ ;
    /** @type {__VLS_StyleScopedClasses['ember']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-reduced']} */ ;
    /** @type {__VLS_StyleScopedClasses['line-in']} */ ;
    /** @type {__VLS_StyleScopedClasses['fill']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-reduced']} */ ;
    /** @type {__VLS_StyleScopedClasses['glow']} */ ;
    /** @type {__VLS_StyleScopedClasses['ignite']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['ignite']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['ignite']} */ ;
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-reduced']} */ ;
    /** @type {__VLS_StyleScopedClasses['ignite']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-reduced']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['all-done']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-reduced']} */ ;
    /** @type {__VLS_StyleScopedClasses['step']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['all-done']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-reduced']} */ ;
    /** @type {__VLS_StyleScopedClasses['step']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['step']} */ ;
    /** @type {__VLS_StyleScopedClasses['node']} */ ;
    /** @type {__VLS_StyleScopedClasses['check']} */ ;
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
        ...{ class: "steps" },
        ...{ class: ({ 'is-reduced': __VLS_unwrap(reduced, {}), 'all-done': __VLS_unwrap(allDone, {}) }) },
        'data-testid': "onboarding-checklist",
        'aria-label': (__VLS_unwrap(t, {})('landing.tray.stepOf', { step: __VLS_ctx.guidance.step, total: __VLS_ctx.guidance.totalSteps })),
    });
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-reduced']} */ ;
    /** @type {__VLS_StyleScopedClasses['all-done']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_ctx.guidance.rows));
    for (const [row, index] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        const __VLS_1 = (row.state === 'current' && __VLS_ctx.canFocus ? 'button' : 'div');
        // @ts-ignore
        const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
            // @ts-ignore
            ...{ 'onClick': {} }, key: (row.key), ...{ class: "step" }, ...{ class: ([row.state, fx.value[index]]) }, type: (row.state === 'current' && __VLS_ctx.canFocus ? 'button' : undefined), dataTestid: (row.state === 'current' && __VLS_ctx.canFocus ? 'onboarding-focus' : undefined),
        }));
        const __VLS_3 = __VLS_2({
            ...{ 'onClick': {} },
            key: (row.key),
            ...{ class: "step" },
            ...{ class: ([row.state, fx.value[index]]) },
            type: (row.state === 'current' && __VLS_ctx.canFocus ? 'button' : undefined),
            dataTestid: (row.state === 'current' && __VLS_ctx.canFocus ? 'onboarding-focus' : undefined),
        }, ...__VLS_functionalComponentArgsRest(__VLS_2));
        let __VLS_6;
        const __VLS_7 = {
            /** @type {typeof __VLS_6.click} */
            onClick: (...[$event]) => {
                void $event;
                return (row.state === 'current' && __VLS_ctx.canFocus && __VLS_unwrap(emit, {})('focus'));
                // @ts-ignore
                [reduced, allDone, t, guidance, guidance, guidance, canFocus, canFocus, canFocus, canFocus, fx, emit,];
            },
        };
        void __VLS_7;
        /** @type {__VLS_StyleScopedClasses['step']} */ ;
        var __VLS_4;
        var __VLS_5;
        const { default: __VLS_8 } = __VLS_nonNull(__VLS_4.slots);
        if (index > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "seg" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['seg']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                ...{ class: "fill" },
            });
            /** @type {__VLS_StyleScopedClasses['fill']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                ...{ class: "ember" },
            });
            /** @type {__VLS_StyleScopedClasses['ember']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
            ...{ class: "glow" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['glow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "node" },
        });
        /** @type {__VLS_StyleScopedClasses['node']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "num" },
        });
        /** @type {__VLS_StyleScopedClasses['num']} */ ;
        (index + 1);
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            ...{ class: "check" },
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['check']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M5 12.5l4.5 4.5L19 7.5",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({
            ...{ class: "name" },
        });
        /** @type {__VLS_StyleScopedClasses['name']} */ ;
        (nameFor(row.key));
        if (row.state === 'current') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "sub" },
            });
            /** @type {__VLS_StyleScopedClasses['sub']} */ ;
            (instructionFor(row));
        }
        // @ts-ignore
        [];
        // @ts-ignore
        [];
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
