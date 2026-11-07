/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Content for the mobile-only pull-down drawer (see TopBar.vue's `drawer`
// slot / composables/useHudDrawer.ts): the nav links HudNav shows on desktop
// but has no room for on mobile. The entries themselves (list, visibility,
// targets, unread badge) come from composables/useHudNavEntries.ts, the same
// source HudNav.vue renders from.
//
// The resource list used to live here too, duplicating ResourceBar's own
// pills still visible in the collapsed bar above — wasted space for the
// same numbers twice. ResourceBar.vue's pills expand in place instead once
// the drawer opens (see its `isExpanded`), so this only needs the links.
//
// Mobile HUD bar rework, phase 2: an account section, mirroring HudNav.vue's
// own account-menu/ReturningPlayerMenu logic rather than importing either
// (same "second, mobile-only surface" reasoning as the nav links above).
// Logged in, Profile/Log out land here unconditionally — the avatar leaves
// every phone bar, not just this one (HudNav.vue's own comment). Anonymous,
// there are no account entries here: ReturningPlayerMenu's own trigger is on
// screen on every phone bar (inline, or as a floating chip on the in-game bar
// — see HudNav.vue) and carries "Name your jarl" / "Log in" / the world list,
// so listing them here too would be the same actions twice. Only the
// account-creation nudge lands here on a `hasResourceBar` bar, where it has
// no room to float.
import { computed, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { usePlayerStore } from '../../stores/player';
import { useLogout } from '../../composables/useLogout';
import { useHudNavEntries } from '../../composables/useHudNavEntries';
import { isHudDrawerPending } from '../../composables/hudDrawerPendingState';
import { profileLocation } from '../../lib/profileRoute';
import LocaleSwitcher from '../LocaleSwitcher.vue';
import ProfileNudge from '../onboarding/ProfileNudge.vue';
import HudNavLink from './HudNavLink.vue';
const { defineProps, defineEmits, withDefaults, } = {};
const props = withDefaults(defineProps(), { hasResourceBar: false });
const emit = defineEmits();
const router = useRouter();
const auth = useAuthStore();
const player = usePlayerStore();
const { logout } = useLogout();
const { entries } = useHudNavEntries();
const { t } = useI18n({ useScope: 'global' });
function onEntryClick(entry) {
    entry.go();
    emit('close');
}
const profileHref = computed(() => router.resolve('/profile').href);
function goToProfile() {
    router.push(profileLocation(router));
    emit('close');
}
async function onLogoutClick() {
    emit('close');
    await logout();
}
// Same gate as HudNav.vue's own `showProfileNudge` — duplicated rather than
// imported for the same "second, mobile-only surface" reason as everything
// else in this file (see its own top-of-file comment).
const unclaimedRealm = computed(() => props.hasResourceBar &&
    player.hasFoundedSettlement &&
    player.onboardingComplete &&
    !auth.isAuthenticated &&
    !player.nickname);
const showProfileNudge = computed(() => unclaimedRealm.value && !player.profileNudgeDismissed);
// hudDrawerPendingState.ts: TopBar.vue's own grip handle reads this to show
// an attention dot once the nudge has nowhere else left to be seen (only
// true on a `hasResourceBar` bar — see `showProfileNudge` above, which is
// already gated on that).
watch(showProfileNudge, (pending) => { isHudDrawerPending.value = pending; }, { immediate: true });
onBeforeUnmount(() => { isHudDrawerPending.value = false; });
const __VLS_defaults = { hasResourceBar: false };
void __VLS_defaults;
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
    __VLS_withDotValue(auth, {});
    __VLS_withDotValue(showProfileNudge, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['drawer-account']} */ ;
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
        ...{ class: "drawer-links" },
    });
    /** @type {__VLS_StyleScopedClasses['drawer-links']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(entries, {})));
    for (const [entry] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        const __VLS_1 = HudNavLink || HudNavLink;
        // @ts-ignore
        const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
            // @ts-ignore
            ...{ 'onNavigate': {} }, key: (entry.id), href: (entry.href), ...{ class: "link" }, ...{ class: ({ active: entry.active }) },
        }));
        const __VLS_3 = __VLS_2({
            ...{ 'onNavigate': {} },
            key: (entry.id),
            href: (entry.href),
            ...{ class: "link" },
            ...{ class: ({ active: entry.active }) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_2));
        let __VLS_6;
        const __VLS_7 = {
            /** @type {typeof __VLS_6.navigate} */
            onNavigate: (...[$event]) => {
                void $event;
                return (onEntryClick(entry));
                // @ts-ignore
                [entries,];
            },
        };
        void __VLS_7;
        /** @type {__VLS_StyleScopedClasses['link']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        var __VLS_4;
        var __VLS_5;
        const { default: __VLS_8 } = __VLS_nonNull(__VLS_4.slots);
        (__VLS_unwrap(t, {})(entry.labelKey));
        if (entry.badge > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "badge" },
            });
            /** @type {__VLS_StyleScopedClasses['badge']} */ ;
            (entry.badge);
        }
        // @ts-ignore
        [t,];
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "drawer-locale" },
    });
    /** @type {__VLS_StyleScopedClasses['drawer-locale']} */ ;
    const __VLS_9 = LocaleSwitcher;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent1(__VLS_9, new __VLS_9({
        // @ts-ignore
        inDrawer: true,
    }));
    const __VLS_11 = __VLS_10({
        inDrawer: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "drawer-account" },
    });
    /** @type {__VLS_StyleScopedClasses['drawer-account']} */ ;
    if (auth.value.isAuthenticated) {
        const __VLS_14 = HudNavLink || HudNavLink;
        // @ts-ignore
        const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({
            // @ts-ignore
            ...{ 'onNavigate': {} }, href: (__VLS_unwrap(profileHref, {})), ...{ class: "link" }, dataTestid: "drawer-account-profile",
        }));
        const __VLS_16 = __VLS_15({
            ...{ 'onNavigate': {} },
            href: (__VLS_unwrap(profileHref, {})),
            ...{ class: "link" },
            dataTestid: "drawer-account-profile",
        }, ...__VLS_functionalComponentArgsRest(__VLS_15));
        let __VLS_19;
        const __VLS_20 = {
            /** @type {typeof __VLS_19.navigate} */
            onNavigate: (goToProfile),
        };
        void __VLS_20;
        /** @type {__VLS_StyleScopedClasses['link']} */ ;
        var __VLS_17;
        var __VLS_18;
        const { default: __VLS_21 } = __VLS_nonNull(__VLS_17.slots);
        (__VLS_unwrap(t, {})('hud.accountMenu.profile'));
        // @ts-ignore
        [t, auth, profileHref,];
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (onLogoutClick) },
            type: "button",
            ...{ class: "link" },
            'data-testid': "drawer-account-logout",
        });
        /** @type {__VLS_StyleScopedClasses['link']} */ ;
        (__VLS_unwrap(t, {})('hud.accountMenu.logout'));
    }
    else if (showProfileNudge.value) {
        const __VLS_22 = ProfileNudge;
        // @ts-ignore
        const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
            // @ts-ignore
            inDrawer: true,
        }));
        const __VLS_24 = __VLS_23({
            inDrawer: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    }
    // @ts-ignore
    [t, showProfileNudge,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
