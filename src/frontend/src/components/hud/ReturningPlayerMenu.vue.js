/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// "I already have a realm" / "or want to join another world" — the entry
// point for a returning/anonymous visitor to either log in or pick a
// different world to join. Replaces two previous, separate things:
// LandingView's pre-founding `.have-realm-link` and HudNav's anonymous-state
// avatar (which only ever routed to /register) — this is now also where the
// account-creation nudge (ProfileNudge.vue, design handoff "2a" frame 5)
// anchors, via the `nudge` slot, since the avatar circle it used to glow
// around no longer exists in the anonymous state.
//
// docs/plans/returning-player-world-switching.md's click-count decision:
// the dropdown used to be a 2-row menu (Log in / Join another world) that
// routed to a separate /worlds page (WorldPickerView.vue) for the actual
// world list — three clicks to switch worlds, the common case this control
// exists for. It now opens straight to the world list itself
// (WorldList.vue, `compact`, shared with WorldPickerView.vue's full-page
// use) — two clicks. "Log in" stays reachable in the same single click that
// opened the dropdown, just not the first thing the panel shows.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import WorldList from './WorldList.vue';
import { useWorldStore } from '../../stores/world';
import HudMenuLocaleRow from './HudMenuLocaleRow.vue';
import { usePreloadRoute } from '../../composables/usePreloadRoute';
const { defineProps, withDefaults, } = {};
const props = withDefaults(defineProps(), {
    nudging: false,
    unclaimedRealm: false,
    chip: false,
});
const { t } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();
const world = useWorldStore();
const open = ref(false);
// The "Name your jarl" row (and the trigger's label) lead to /register for an unclaimed realm:
// loaded ahead so that row opens the form at once.
usePreloadRoute('/register', () => props.unclaimedRealm);
const rootEl = ref(null);
// "Log in" carries the currently-joined world along as context (login↔world
// linkage in the plan doc above): logging in from within a specific world's
// context lets LoginView.vue offer to found/return to that world right
// after authenticating, instead of logging in generically and having to
// navigate back afterward. `worldStore.worldId` is null pre-founding (no
// world bootstrapped client-side yet) — that case just links to plain
// `/login` with no query params. `worldName` rides along too so LoginView
// can show it without a second API round-trip.
const loginTarget = computed(() => {
    if (!world.worldId)
        return '/login';
    const query = { worldId: world.worldId };
    if (world.worldName)
        query.worldName = world.worldName;
    return { path: '/login', query };
});
function toggle() {
    open.value = !open.value;
}
function close() {
    open.value = false;
}
function go(to) {
    close();
    router.push(to);
}
function onDocumentPointerDown(event) {
    if (!open.value)
        return;
    const target = event.target;
    if (rootEl.value && target && !rootEl.value.contains(target))
        close();
}
function onDocumentKeydown(event) {
    if (event.key === 'Escape')
        close();
}
onMounted(() => {
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('keydown', onDocumentKeydown);
});
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onDocumentKeydown);
});
// A navigation while the panel is open (e.g. the browser back button, or
// some other control on the page) should close it same as clicking a row
// would — it makes no sense pinned open over a different route.
watch(() => route.fullPath, close);
const __VLS_defaults = {
    nudging: false,
    unclaimedRealm: false,
    chip: false,
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
    __VLS_withDotValue(open, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['caret']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['caret']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-nudging']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger-sub']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger-main']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger-main']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger-main--short']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "rootEl",
        ...{ class: "returning-player-menu" },
    });
    /** @type {__VLS_StyleScopedClasses['returning-player-menu']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (toggle) },
        type: "button",
        ...{ class: "trigger" },
        ...{ class: ({ 'is-nudging': __VLS_ctx.nudging, 'trigger--chip': __VLS_ctx.chip }) },
        'aria-haspopup': "menu",
        'aria-expanded': (open.value),
        'data-testid': "returning-player-trigger",
    });
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-nudging']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger--chip']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "trigger-text" },
    });
    /** @type {__VLS_StyleScopedClasses['trigger-text']} */ ;
    if (__VLS_ctx.unclaimedRealm) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "trigger-main" },
        });
        /** @type {__VLS_StyleScopedClasses['trigger-main']} */ ;
        (__VLS_unwrap(t, {})('hud.returningPlayer.nameJarlTrigger'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "trigger-sub" },
        });
        /** @type {__VLS_StyleScopedClasses['trigger-sub']} */ ;
        (__VLS_unwrap(t, {})('hud.returningPlayer.nameJarlTriggerSub'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "trigger-main trigger-main--full" },
        });
        /** @type {__VLS_StyleScopedClasses['trigger-main']} */ ;
        /** @type {__VLS_StyleScopedClasses['trigger-main--full']} */ ;
        (__VLS_unwrap(t, {})('hud.returningPlayer.trigger'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "trigger-main trigger-main--short" },
        });
        /** @type {__VLS_StyleScopedClasses['trigger-main']} */ ;
        /** @type {__VLS_StyleScopedClasses['trigger-main--short']} */ ;
        (__VLS_unwrap(t, {})('hud.returningPlayer.logIn'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "trigger-sub" },
        });
        /** @type {__VLS_StyleScopedClasses['trigger-sub']} */ ;
        (__VLS_unwrap(t, {})('hud.returningPlayer.triggerSub'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "caret" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['caret']} */ ;
    if (__VLS_ctx.nudging) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "nudge-dot" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['nudge-dot']} */ ;
    }
    var __VLS_0 = {};
    if (open.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "panel menu" },
            role: "menu",
            'data-testid': "returning-player-menu",
        });
        /** @type {__VLS_StyleScopedClasses['panel']} */ ;
        /** @type {__VLS_StyleScopedClasses['menu']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ class: "notch" },
        });
        /** @type {__VLS_StyleScopedClasses['notch']} */ ;
        if (__VLS_ctx.unclaimedRealm) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(open.value))
                            throw 0;
                        if (!(__VLS_ctx.unclaimedRealm))
                            throw 0;
                        return (go('/register'));
                        // @ts-ignore
                        [nudging, nudging, chip, open, open, unclaimedRealm, unclaimedRealm, t, t, t, t, t,];
                    } },
                type: "button",
                role: "menuitem",
                ...{ class: "row name-jarl-row" },
                'data-testid': "returning-player-name-jarl",
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            /** @type {__VLS_StyleScopedClasses['name-jarl-row']} */ ;
            (__VLS_unwrap(t, {})('hud.returningPlayer.nameJarlTrigger'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(open.value))
                        throw 0;
                    return (go(__VLS_unwrap(loginTarget, {})));
                    // @ts-ignore
                    [t, loginTarget,];
                } },
            type: "button",
            role: "menuitem",
            ...{ class: "row login-row" },
            'data-testid': "returning-player-login",
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        /** @type {__VLS_StyleScopedClasses['login-row']} */ ;
        (__VLS_unwrap(t, {})('hud.returningPlayer.logIn'));
        var __VLS_2 = {
            close: (close),
        };
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ class: "divider" },
            role: "separator",
        });
        /** @type {__VLS_StyleScopedClasses['divider']} */ ;
        const __VLS_4 = HudMenuLocaleRow;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent1(__VLS_4, new __VLS_4({
        // @ts-ignore
        }));
        const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
        const __VLS_9 = WorldList;
        // @ts-ignore
        const __VLS_10 = __VLS_asFunctionalComponent1(__VLS_9, new __VLS_9({
            // @ts-ignore
            compact: true,
        }));
        const __VLS_11 = __VLS_10({
            compact: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    }
    var __VLS_14 = {};
    var __VLS_1 = __VLS_0, __VLS_3 = __VLS_2, __VLS_15 = __VLS_14;
    // @ts-ignore
    [t,];
    return {
        __VLS_Slots: {},
    };
};
void [__VLS_template, {}];
const __VLS_base = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
const __VLS_export = {};
export default {};
