/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// HexMapRenderer.mount()'s tile-art loading state (see MapLoadState in
// HexMapRenderer.ts), surfaced as a small UI: a centred overlay while
// nothing is drawable yet ('terrain'), a thin sweeping bar along the map's
// top edge while terrain is up but building art is still loading ('buildings'), and nothing once
// everything has settled ('ready') — after a short fade so the transition
// doesn't just snap away. World-mode mounts never reach 'terrain'/
// 'buildings' at all (see startTextureLoad), so this renders nothing for
// them from the very first tick.
import { onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { prefersReducedMotion } from '../../lib/motion';
const { defineProps, } = {};
const props = defineProps();
const { t } = useI18n({ useScope: 'global' });
// Checked once at setup, same as WastedIsland.vue's own reducedMotion — this
// is a fixed, per-session device preference, not something that needs a
// live-updating watcher for a loading indicator that's on screen for at most
// a few seconds.
const reducedMotion = prefersReducedMotion();
const FADE_MS = 250;
// 'ready' has nothing of its own to draw — it fades out whatever the last
// real phase showed, then this goes false and the template unmounts for
// real. Kept as its own ref (not derived from `props.state.phase`) so it
// survives the phase already having flipped to 'ready' during the fade.
const lastPhase = ref(props.state.phase === 'buildings' ? 'buildings' : 'terrain');
// Renders nothing at all if construction starts already 'ready' (world mode)
// — never shown, never faded.
const visible = ref(props.state.phase !== 'ready');
const hiding = ref(false);
let fadeTimer = null;
function clearFadeTimer() {
    if (fadeTimer !== null) {
        clearTimeout(fadeTimer);
        fadeTimer = null;
    }
}
watch(() => props.state.phase, (phase) => {
    if (phase === 'ready') {
        if (hiding.value)
            return; // already fading out
        hiding.value = true;
        fadeTimer = setTimeout(() => {
            visible.value = false;
            fadeTimer = null;
        }, FADE_MS);
        return;
    }
    lastPhase.value = phase;
    clearFadeTimer();
    hiding.value = false;
    visible.value = true;
}, { immediate: true });
onUnmounted(clearFadeTimer);
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
    __VLS_withDotValue(visible, {});
    __VLS_withDotValue(lastPhase, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['overlay']} */ ;
    /** @type {__VLS_StyleScopedClasses['top-bar-sweep']} */ ;
    /** @type {__VLS_StyleScopedClasses['map-loading--reduced']} */ ;
    /** @type {__VLS_StyleScopedClasses['hex--pulse']} */ ;
    /** @type {__VLS_StyleScopedClasses['hex--pulse']} */ ;
    /** @type {__VLS_StyleScopedClasses['top-bar-sweep']} */ ;
    /** @type {__VLS_StyleScopedClasses['map-loading']} */ ;
    if (visible.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "map-loading" },
            ...{ class: ([`map-loading--${lastPhase.value}`, { 'map-loading--hiding': __VLS_unwrap(hiding, {}), 'map-loading--reduced': __VLS_unwrap(reducedMotion, {}) }]) },
            role: "status",
            'aria-live': "polite",
        });
        /** @type {__VLS_StyleScopedClasses['map-loading']} */ ;
        /** @type {__VLS_StyleScopedClasses['map-loading--hiding']} */ ;
        /** @type {__VLS_StyleScopedClasses['map-loading--reduced']} */ ;
        if (lastPhase.value === 'terrain') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "overlay" },
            });
            /** @type {__VLS_StyleScopedClasses['overlay']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
                ...{ class: "hex hex--pulse" },
                viewBox: "0 0 100 100",
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['hex']} */ ;
            /** @type {__VLS_StyleScopedClasses['hex--pulse']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
                points: "50,4 93,27 93,73 50,96 7,73 7,27",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "label" },
            });
            /** @type {__VLS_StyleScopedClasses['label']} */ ;
            (__VLS_unwrap(t, {})('hud.mapLoading.terrain'));
            if (__VLS_ctx.state.progress !== undefined) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "progress-track" },
                });
                /** @type {__VLS_StyleScopedClasses['progress-track']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                    ...{ class: "progress-fill" },
                    ...{ style: ({ width: `${Math.round(__VLS_ctx.state.progress * 100)}%` }) },
                });
                /** @type {__VLS_StyleScopedClasses['progress-fill']} */ ;
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "top-bar" },
            });
            /** @type {__VLS_StyleScopedClasses['top-bar']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                ...{ class: "top-bar-sweep" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['top-bar-sweep']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "visually-hidden" },
            });
            /** @type {__VLS_StyleScopedClasses['visually-hidden']} */ ;
            (__VLS_unwrap(t, {})('hud.mapLoading.buildings'));
        }
    }
    // @ts-ignore
    [visible, lastPhase, lastPhase, hiding, reducedMotion, t, t, state, state,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
