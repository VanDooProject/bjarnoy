/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// "Join another world" (UI half — store/API already landed, see
// stores/world.ts's `joinWorld` and api/client.ts's `listJoinableWorlds`/
// `getWorldMembership`). Reachable from ReturningPlayerMenu.vue, anonymous
// or logged in alike (see router/index.ts — no `requiresAuth`): an
// anonymous visitor already has a stable local id (stores/player.ts) they
// can found a new realm under, or already hold a realm under, in any world.
// The list-fetching-and-rendering logic itself now lives in
// components/hud/WorldList.vue (shared with ReturningPlayerMenu.vue's
// dropdown) — this view is just the page chrome around it.
import { useI18n } from 'vue-i18n';
import TopBar from '../components/hud/TopBar.vue';
import LocaleSwitcher from '../components/LocaleSwitcher.vue';
import WorldList from '../components/hud/WorldList.vue';
import { useAuthStore } from '../stores/auth';
const { t } = useI18n({ useScope: 'global' });
const auth = useAuthStore();
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(auth, {});
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "world-picker" },
    });
    /** @type {__VLS_StyleScopedClasses['world-picker']} */ ;
    const __VLS_0 = TopBar || TopBar;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        docked: true, title: "Bjarnoy",
    }));
    const __VLS_2 = __VLS_1({
        docked: true,
        title: "Bjarnoy",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    const __VLS_6 = LocaleSwitcher;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    // @ts-ignore
    }));
    const __VLS_8 = __VLS_7({}, ...__VLS_functionalComponentArgsRest(__VLS_7));
    __VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
        ...{ class: "content" },
    });
    /** @type {__VLS_StyleScopedClasses['content']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "head" },
    });
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_unwrap(t, {})('worlds.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "lede" },
    });
    /** @type {__VLS_StyleScopedClasses['lede']} */ ;
    (__VLS_unwrap(t, {})('worlds.lede'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "panel list" },
    });
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['list']} */ ;
    const __VLS_11 = WorldList;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
    // @ts-ignore
    }));
    const __VLS_13 = __VLS_12({}, ...__VLS_functionalComponentArgsRest(__VLS_12));
    if (!auth.value.isAuthenticated) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "login-nudge" },
        });
        /** @type {__VLS_StyleScopedClasses['login-nudge']} */ ;
        (__VLS_unwrap(t, {})('worlds.loginNudge'));
    }
    // @ts-ignore
    [t, t, t, auth,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
