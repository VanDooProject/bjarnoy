/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The avatar-mark tooltip from the design handoff "2a", replacing the old
// forced end-of-flow nickname popup: shown once onboarding is done, until
// the player either registers or dismisses it. "Name your jarl" routes to
// /register (a real account — the anonymous local nickname the removed
// modal set doesn't actually follow the player to another device, but a
// registered account does; the avatar's own anonymous-state click already
// goes there too, see HudNav.vue).
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '../../stores/player';
import { usePreloadRoute } from '../../composables/usePreloadRoute';
const { defineProps, } = {};
const __VLS_props = defineProps();
const player = usePlayerStore();
const router = useRouter();
const { t } = useI18n({ useScope: 'global' });
// Loaded while the nudge is up, so "Name your jarl" opens the form at once.
usePreloadRoute('/register');
function nameYourJarl() {
    router.push('/register');
}
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
    __VLS_withDotValue(player, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['nudge']} */ ;
    /** @type {__VLS_StyleScopedClasses['later']} */ ;
    /** @type {__VLS_StyleScopedClasses['nudge']} */ ;
    /** @type {__VLS_StyleScopedClasses['nudge']} */ ;
    /** @type {__VLS_StyleScopedClasses['in-drawer']} */ ;
    /** @type {__VLS_StyleScopedClasses['notch']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "nudge panel" },
        ...{ class: ({ 'in-drawer': __VLS_ctx.inDrawer }) },
        'data-testid': "profile-nudge",
    });
    /** @type {__VLS_StyleScopedClasses['nudge']} */ ;
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['in-drawer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "notch" },
    });
    /** @type {__VLS_StyleScopedClasses['notch']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    (__VLS_unwrap(t, {})('onboarding.profileNudge.eyebrow'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "title" },
    });
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    (__VLS_unwrap(t, {})('onboarding.profileNudge.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "body" },
    });
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    (__VLS_unwrap(t, {})('onboarding.profileNudge.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "actions" },
    });
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (nameYourJarl) },
        type: "button",
        ...{ class: "cta" },
        'data-testid': "profile-nudge-cta",
    });
    /** @type {__VLS_StyleScopedClasses['cta']} */ ;
    (__VLS_unwrap(t, {})('onboarding.profileNudge.cta'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (player.value.dismissProfileNudge());
                // @ts-ignore
                [inDrawer, t, t, t, t, player,];
            } },
        type: "button",
        ...{ class: "later" },
        'data-testid': "profile-nudge-later",
    });
    /** @type {__VLS_StyleScopedClasses['later']} */ ;
    (__VLS_unwrap(t, {})('onboarding.profileNudge.later'));
    // @ts-ignore
    [t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
