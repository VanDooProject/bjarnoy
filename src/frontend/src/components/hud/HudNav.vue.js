/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Issue #16 "header": "nav links WORLD MAP / REPORTS / ALLIANCE, and a
// round avatar badge" — Alliance now links to GuildView (the guild/alliance
// system) and Reports to ReportsView (issue #41's moderation-report inbox),
// both real features now. The avatar carries the player's nickname initials
// (or the game's own initials as a fallback), replacing the plain nickname
// pill TopBar used to show.
import { computed, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { usePlayerStore } from '../../stores/player';
import { useReportsStore } from '../../stores/reports';
import { useHudNavEntries } from '../../composables/useHudNavEntries';
import { useLogout } from '../../composables/useLogout';
import { isHudDrawerOpen } from '../../composables/hudDrawerOpenState';
import { useIsMobile } from '../../composables/useIsMobile';
import { fadeChip } from '../../lib/hud/chipMotion';
import { profileLocation } from '../../lib/profileRoute';
import { settingsLocation } from '../../lib/modalRoute';
import { DEMO_MODE } from '../../config';
import HudMenuLocaleRow from './HudMenuLocaleRow.vue';
import ProfileNudge from '../onboarding/ProfileNudge.vue';
import ReturningPlayerMenu from './ReturningPlayerMenu.vue';
import HudNavLink from './HudNavLink.vue';
const { defineProps, withDefaults, } = {};
const props = withDefaults(defineProps(), {
    hasDrawer: true,
    hasResourceBar: false,
    floating: false,
});
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const player = usePlayerStore();
const reports = useReportsStore();
const { logout } = useLogout();
const { primary, secondary } = useHudNavEntries();
const { t } = useI18n({ useScope: 'global' });
// Issue #40 phase 3: a lightweight "new reports" badge. HudNav is mounted
// for as long as TopBar is (settlement/world map views), so its own
// mount/unmount is a reasonable lifetime for the reports store's poll —
// see stores/reports.ts's own comment on why this isn't folded into
// stores/world.ts's poll loop.
function syncPolling() {
    if (!DEMO_MODE && player.settlementId) {
        reports.startPolling(player.settlementId, player.id);
    }
    else {
        reports.stopPolling();
    }
}
onMounted(syncPolling);
onUnmounted(() => reports.stopPolling());
watch(() => player.settlementId, syncPolling);
const initials = computed(() => {
    if (!player.nickname)
        return 'BJ';
    const parts = player.nickname.trim().split(/\s+/);
    return parts
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? '')
        .join('');
});
// Design handoff "2a" frame 5: the profile-mark nudge that replaces the old
// forced end-of-flow nickname modal — shown once onboarding is actually
// done (player.onboardingComplete, set the moment guidance.complete fires
// in LandingView.vue, not just while the completion banner happens to be on
// screen), for as long as the player stays anonymous and hasn't dismissed
// it. HudNav is mounted on both the landing page and the settlement view,
// so this follows the player there too until they act on it.
// A founded, onboarded realm with no jarl (account) behind it yet — the
// nudge below shows for exactly these players until dismissed, and
// ReturningPlayerMenu relabels its trigger to "Name your jarl" for them for
// good (including after "Later"), so registering stays one click away.
const unclaimedRealm = computed(() => player.hasFoundedSettlement &&
    player.onboardingComplete &&
    !auth.isAuthenticated &&
    !player.nickname);
const showProfileNudge = computed(() => unclaimedRealm.value && !player.profileNudgeDismissed);
// The in-game phone chip sits where the HUD drawer also draws — it steps
// aside while that is open. Phone only: on desktop the
// trigger is inline in the bar and nothing covers it.
const isMobile = useIsMobile();
const chipStepsAside = computed(() => props.hasResourceBar && isMobile.value && isHudDrawerOpen.value);
// Shown while anonymous (gone once registered), except while stepping aside.
// Every enter has a leave: the chip fades out/in (lib/hud/chipMotion.ts,
// through the HUD motion gate) rather than popping — on registration too.
const showReturningPlayerMenu = computed(() => !auth.isAuthenticated && !chipStepsAside.value);
function onChipEnter(el, done) {
    void fadeChip(el, 'in').then(done, done);
}
function onChipLeave(el, done) {
    void fadeChip(el, 'out').then(done, done);
}
// Player logout/login gate: the authenticated avatar is now a small account
// dropdown (Profile / Log out) rather than a direct link to /profile,
// mirroring ReturningPlayerMenu's own trigger/panel open-close pattern
// (click to open, closes on outside click or Escape) since this is the same
// kind of small anchored panel.
const accountMenuOpen = ref(false);
const accountMenuRoot = ref(null);
function toggleAccountMenu() {
    accountMenuOpen.value = !accountMenuOpen.value;
}
function closeAccountMenu() {
    accountMenuOpen.value = false;
}
// The Reports unread count stays visible on the closed menu's trigger.
const unreadBadge = computed(() => secondary.value.find((e) => e.id === 'reports')?.badge ?? 0);
function onMenuEntryClick(entry, close) {
    close();
    entry.go();
}
const profileHref = computed(() => router.resolve('/profile').href);
function goToProfile() {
    closeAccountMenu();
    router.push(profileLocation(router));
}
const settingsHref = computed(() => router.resolve('/settings').href);
function goToSettings() {
    closeAccountMenu();
    router.push(settingsLocation(router));
}
async function onLogoutClick() {
    closeAccountMenu();
    await logout();
}
function onAccountMenuPointerDown(event) {
    if (!accountMenuOpen.value)
        return;
    const target = event.target;
    if (accountMenuRoot.value && target && !accountMenuRoot.value.contains(target))
        closeAccountMenu();
}
function onAccountMenuKeydown(event) {
    if (event.key === 'Escape')
        closeAccountMenu();
}
onMounted(() => {
    document.addEventListener('pointerdown', onAccountMenuPointerDown, true);
    document.addEventListener('keydown', onAccountMenuKeydown);
});
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onAccountMenuPointerDown, true);
    document.removeEventListener('keydown', onAccountMenuKeydown);
});
// A navigation while the menu is open should close it, same as
// ReturningPlayerMenu does for its own panel.
watch(() => route.fullPath, closeAccountMenu);
const __VLS_defaults = {
    hasDrawer: true,
    hasResourceBar: false,
    floating: false,
};
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
    __VLS_withDotValue(auth, {});
    __VLS_withDotValue(accountMenuOpen, {});
    __VLS_withDotValue(secondary, {});
    __VLS_withDotValue(showReturningPlayerMenu, {});
    __VLS_withDotValue(showProfileNudge, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-nav']} */ ;
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-nav']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-nav--no-drawer']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-nav']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-nav--no-drawer']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-nav--no-drawer']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-nav--with-resources']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-nav--no-drawer']} */ ;
    /** @type {__VLS_StyleScopedClasses['account-menu']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['menu-entries']} */ ;
    /** @type {__VLS_StyleScopedClasses['row-entry']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
        ...{ class: "hud-nav" },
        ...{ class: ({
                'hud-nav--no-drawer': !__VLS_ctx.hasDrawer,
                'hud-nav--with-resources': __VLS_ctx.hasResourceBar,
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['hud-nav']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-nav--no-drawer']} */ ;
    /** @type {__VLS_StyleScopedClasses['hud-nav--with-resources']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(primary, {})));
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
                return (entry.go());
                // @ts-ignore
                [hasDrawer, hasResourceBar, primary,];
            },
        };
        void __VLS_7;
        /** @type {__VLS_StyleScopedClasses['link']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        var __VLS_4;
        var __VLS_5;
        const { default: __VLS_8 } = __VLS_nonNull(__VLS_4.slots);
        (__VLS_unwrap(t, {})(entry.labelKey));
        // @ts-ignore
        [t,];
        // @ts-ignore
        [];
    }
    if (auth.value.isAuthenticated) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "accountMenuRoot",
            ...{ class: "account-menu" },
        });
        /** @type {__VLS_StyleScopedClasses['account-menu']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (toggleAccountMenu) },
            type: "button",
            ...{ class: "avatar avatar-button" },
            'aria-haspopup': "menu",
            'aria-expanded': (accountMenuOpen.value),
            title: (__VLS_unwrap(t, {})('hud.nav.profileTitle')),
            'data-testid': "account-menu-trigger",
        });
        /** @type {__VLS_StyleScopedClasses['avatar']} */ ;
        /** @type {__VLS_StyleScopedClasses['avatar-button']} */ ;
        (__VLS_unwrap(initials, {}));
        if (__VLS_unwrap(unreadBadge, {}) > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "badge avatar-badge" },
                'data-testid': "account-menu-badge",
            });
            /** @type {__VLS_StyleScopedClasses['badge']} */ ;
            /** @type {__VLS_StyleScopedClasses['avatar-badge']} */ ;
            (__VLS_unwrap(unreadBadge, {}));
        }
        if (accountMenuOpen.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "panel menu account-panel" },
                role: "menu",
                'data-testid': "account-menu",
            });
            /** @type {__VLS_StyleScopedClasses['panel']} */ ;
            /** @type {__VLS_StyleScopedClasses['menu']} */ ;
            /** @type {__VLS_StyleScopedClasses['account-panel']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                ...{ class: "notch" },
            });
            /** @type {__VLS_StyleScopedClasses['notch']} */ ;
            if (secondary.value.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "menu-entries" },
                });
                /** @type {__VLS_StyleScopedClasses['menu-entries']} */ ;
                const __VLS_9 = __VLS_tryAsConstant((secondary.value));
                for (const [entry] of __VLS_vFor(__VLS_nonNull(__VLS_9))) {
                    const __VLS_10 = HudNavLink || HudNavLink;
                    // @ts-ignore
                    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
                        // @ts-ignore
                        ...{ 'onNavigate': {} }, key: (entry.id), href: (entry.href), role: "menuitem", ...{ class: "row row-entry" }, ...{ class: ({ active: entry.active }) }, dataTestid: (`menu-entry-${entry.id}`),
                    }));
                    const __VLS_12 = __VLS_11({
                        ...{ 'onNavigate': {} },
                        key: (entry.id),
                        href: (entry.href),
                        role: "menuitem",
                        ...{ class: "row row-entry" },
                        ...{ class: ({ active: entry.active }) },
                        dataTestid: (`menu-entry-${entry.id}`),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
                    let __VLS_15;
                    const __VLS_16 = {
                        /** @type {typeof __VLS_15.navigate} */
                        onNavigate: (...[$event]) => {
                            void $event;
                            if (!(auth.value.isAuthenticated))
                                throw 0;
                            if (!(accountMenuOpen.value))
                                throw 0;
                            if (!(secondary.value.length))
                                throw 0;
                            return (onMenuEntryClick(entry, closeAccountMenu));
                            // @ts-ignore
                            [t, auth, accountMenuOpen, accountMenuOpen, initials, unreadBadge, unreadBadge, secondary, secondary,];
                        },
                    };
                    void __VLS_16;
                    /** @type {__VLS_StyleScopedClasses['row']} */ ;
                    /** @type {__VLS_StyleScopedClasses['row-entry']} */ ;
                    /** @type {__VLS_StyleScopedClasses['active']} */ ;
                    var __VLS_13;
                    var __VLS_14;
                    const { default: __VLS_17 } = __VLS_nonNull(__VLS_13.slots);
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
                __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                    ...{ class: "divider" },
                    role: "separator",
                });
                /** @type {__VLS_StyleScopedClasses['divider']} */ ;
            }
            const __VLS_18 = HudMenuLocaleRow;
            // @ts-ignore
            const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
            // @ts-ignore
            }));
            const __VLS_20 = __VLS_19({}, ...__VLS_functionalComponentArgsRest(__VLS_19));
            const __VLS_23 = HudNavLink || HudNavLink;
            // @ts-ignore
            const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
                // @ts-ignore
                ...{ 'onNavigate': {} }, href: (__VLS_unwrap(profileHref, {})), role: "menuitem", ...{ class: "row" }, dataTestid: "account-menu-profile",
            }));
            const __VLS_25 = __VLS_24({
                ...{ 'onNavigate': {} },
                href: (__VLS_unwrap(profileHref, {})),
                role: "menuitem",
                ...{ class: "row" },
                dataTestid: "account-menu-profile",
            }, ...__VLS_functionalComponentArgsRest(__VLS_24));
            let __VLS_28;
            const __VLS_29 = {
                /** @type {typeof __VLS_28.navigate} */
                onNavigate: (goToProfile),
            };
            void __VLS_29;
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            var __VLS_26;
            var __VLS_27;
            const { default: __VLS_30 } = __VLS_nonNull(__VLS_26.slots);
            (__VLS_unwrap(t, {})('hud.accountMenu.profile'));
            // @ts-ignore
            [t, profileHref,];
            const __VLS_31 = HudNavLink || HudNavLink;
            // @ts-ignore
            const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
                // @ts-ignore
                ...{ 'onNavigate': {} }, href: (__VLS_unwrap(settingsHref, {})), role: "menuitem", ...{ class: "row" }, dataTestid: "account-menu-settings",
            }));
            const __VLS_33 = __VLS_32({
                ...{ 'onNavigate': {} },
                href: (__VLS_unwrap(settingsHref, {})),
                role: "menuitem",
                ...{ class: "row" },
                dataTestid: "account-menu-settings",
            }, ...__VLS_functionalComponentArgsRest(__VLS_32));
            let __VLS_36;
            const __VLS_37 = {
                /** @type {typeof __VLS_36.navigate} */
                onNavigate: (goToSettings),
            };
            void __VLS_37;
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            var __VLS_34;
            var __VLS_35;
            const { default: __VLS_38 } = __VLS_nonNull(__VLS_34.slots);
            (__VLS_unwrap(t, {})('hud.accountMenu.settings'));
            // @ts-ignore
            [t, settingsHref,];
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (onLogoutClick) },
                type: "button",
                role: "menuitem",
                ...{ class: "row" },
                'data-testid': "account-menu-logout",
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            (__VLS_unwrap(t, {})('hud.accountMenu.logout'));
        }
    }
    let __VLS_39;
    /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
    Transition;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent1(__VLS_39, new __VLS_39({
        // @ts-ignore
        ...{ 'onEnter': {} }, ...{ 'onLeave': {} }, css: (false),
    }));
    const __VLS_41 = __VLS_40({
        ...{ 'onEnter': {} },
        ...{ 'onLeave': {} },
        css: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    let __VLS_44;
    const __VLS_45 = {
        /** @type {typeof __VLS_44.enter} */
        onEnter: (onChipEnter),
    };
    void __VLS_45;
    const __VLS_46 = {
        /** @type {typeof __VLS_44.leave} */
        onLeave: (onChipLeave),
    };
    void __VLS_46;
    var __VLS_42;
    var __VLS_43;
    const { default: __VLS_47 } = __VLS_nonNull(__VLS_42.slots);
    if (showReturningPlayerMenu.value) {
        const __VLS_48 = ReturningPlayerMenu || ReturningPlayerMenu;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
            // @ts-ignore
            nudging: (showProfileNudge.value), unclaimedRealm: (__VLS_unwrap(unclaimedRealm, {})), chip: (__VLS_ctx.floating || __VLS_ctx.hasResourceBar),
        }));
        const __VLS_50 = __VLS_49({
            nudging: (showProfileNudge.value),
            unclaimedRealm: (__VLS_unwrap(unclaimedRealm, {})),
            chip: (__VLS_ctx.floating || __VLS_ctx.hasResourceBar),
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        var __VLS_51;
        const { default: __VLS_53 } = __VLS_nonNull(__VLS_51.slots);
        {
            const { 'trigger-badge': __VLS_54 } = __VLS_nonNull(__VLS_51.slots);
            if (__VLS_unwrap(unreadBadge, {}) > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "badge avatar-badge" },
                    'data-testid': "returning-player-badge",
                });
                /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                /** @type {__VLS_StyleScopedClasses['avatar-badge']} */ ;
                (__VLS_unwrap(unreadBadge, {}));
            }
            // @ts-ignore
            [hasResourceBar, t, unreadBadge, unreadBadge, showReturningPlayerMenu, showProfileNudge, unclaimedRealm, floating,];
        }
        {
            const { entries: __VLS_55 } = __VLS_nonNull(__VLS_51.slots);
            const [{ close }] = __VLS_vSlot(__VLS_nonNull(__VLS_55));
            if (secondary.value.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "menu-entries" },
                });
                /** @type {__VLS_StyleScopedClasses['menu-entries']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                    ...{ class: "divider" },
                    role: "separator",
                });
                /** @type {__VLS_StyleScopedClasses['divider']} */ ;
                const __VLS_56 = __VLS_tryAsConstant((secondary.value));
                for (const [entry] of __VLS_vFor(__VLS_nonNull(__VLS_56))) {
                    const __VLS_57 = HudNavLink || HudNavLink;
                    // @ts-ignore
                    const __VLS_58 = __VLS_asFunctionalComponent1(__VLS_57, new __VLS_57({
                        // @ts-ignore
                        ...{ 'onNavigate': {} }, key: (entry.id), href: (entry.href), role: "menuitem", ...{ class: "row row-entry" }, ...{ class: ({ active: entry.active }) }, dataTestid: (`menu-entry-${entry.id}`),
                    }));
                    const __VLS_59 = __VLS_58({
                        ...{ 'onNavigate': {} },
                        key: (entry.id),
                        href: (entry.href),
                        role: "menuitem",
                        ...{ class: "row row-entry" },
                        ...{ class: ({ active: entry.active }) },
                        dataTestid: (`menu-entry-${entry.id}`),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_58));
                    let __VLS_62;
                    const __VLS_63 = {
                        /** @type {typeof __VLS_62.navigate} */
                        onNavigate: (...[$event]) => {
                            void $event;
                            if (!(showReturningPlayerMenu.value))
                                throw 0;
                            if (!(secondary.value.length))
                                throw 0;
                            return (onMenuEntryClick(entry, close));
                            // @ts-ignore
                            [secondary, secondary,];
                        },
                    };
                    void __VLS_63;
                    /** @type {__VLS_StyleScopedClasses['row']} */ ;
                    /** @type {__VLS_StyleScopedClasses['row-entry']} */ ;
                    /** @type {__VLS_StyleScopedClasses['active']} */ ;
                    var __VLS_60;
                    var __VLS_61;
                    const { default: __VLS_64 } = __VLS_nonNull(__VLS_60.slots);
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
            }
            // @ts-ignore
            [];
        }
        {
            const { nudge: __VLS_65 } = __VLS_nonNull(__VLS_51.slots);
            if (showProfileNudge.value) {
                const __VLS_66 = ProfileNudge;
                // @ts-ignore
                const __VLS_67 = __VLS_asFunctionalComponent1(__VLS_66, new __VLS_66({
                // @ts-ignore
                }));
                const __VLS_68 = __VLS_67({}, ...__VLS_functionalComponentArgsRest(__VLS_67));
            }
            // @ts-ignore
            [showProfileNudge,];
        }
        // @ts-ignore
        [];
    }
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
