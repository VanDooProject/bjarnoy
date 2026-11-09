/// <reference types="../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, shallowRef, watch } from 'vue';
import { loadRouteLocation, useRoute, useRouter } from 'vue-router';
import AccountRestrictedBanner from './components/AccountRestrictedBanner.vue';
import ConnectionBanner from './components/hud/ConnectionBanner.vue';
import DemoModeBadge from './components/DemoModeBadge.vue';
import ProfileModal from './components/profile/ProfileModal.vue';
import LeaderboardModal from './components/leaderboard/LeaderboardModal.vue';
import GuildModal from './components/guild/GuildModal.vue';
import ReportsModal from './components/reports/ReportsModal.vue';
import SettingsModal from './components/settings/SettingsModal.vue';
import { useActivityHeartbeat } from './composables/useActivityHeartbeat';
import { isModalRouteName } from './lib/modalRoute';
// Mounted once, app-wide: it no-ops of its own accord (via authStore.isAuthenticated)
// for anonymous visitors, so it's safe to run on every view rather than only
// some authenticated-only shell — this app has no such shell separate from
// App.vue itself.
useActivityHeartbeat();
const route = useRoute();
const router = useRouter();
// The modal routes (own-profile/profile/leaderboards/guild/reports/
// report-detail/settings) render as a modal over whatever page was showing before —
// see lib/modalRoute.ts and each modal component (ProfileModal.vue/
// LeaderboardModal.vue/GuildModal.vue/ReportsModal.vue). Every other route renders through <router-view> exactly
// as before.
const isModalRoute = computed(() => isModalRouteName(route.name));
// Which modal component to render for the current modal route.
const ModalComponent = computed(() => {
    switch (route.name) {
        case 'own-profile':
        case 'profile':
            return ProfileModal;
        case 'leaderboards':
            return LeaderboardModal;
        case 'guild':
            return GuildModal;
        case 'reports':
        case 'report-detail':
            return ReportsModal;
        case 'settings':
            return SettingsModal;
        default:
            return null;
    }
});
// The page to keep showing underneath the open modal. `modalLocation()`
// stashes the caller's own full path in `history.state.backgroundView` when
// it opens a modal route — read that back here. A direct load, a reload, or
// a new tab opened from a link (no in-app navigation, so no stashed state)
// has nothing to go back to, so it falls back to the settlement view, per
// the spec ("newly opened tabs via link have settlement in the back").
//
// This must stay a *single* `<router-view>` element whose `route` prop
// merely changes value, never a `v-if`/`v-else` pair of separate
// `<router-view>`s — MapView.vue hosts a persistent Pixi renderer, and
// swapping which element is in the template (rather than just which route a
// prop points a stable element at) would remount it every time the modal
// opens or closes. See App.test.ts for the regression this guards.
function backgroundLocation() {
    // Via the router's own history object, not the global `window.history` —
    // works the same way against a `createMemoryHistory` router in tests. See
    // lib/modalRoute.ts's own comment.
    const state = router.options.history.state;
    const backgroundView = typeof state.backgroundView === 'string' ? state.backgroundView : null;
    return router.resolve(backgroundView ?? '/settlement');
}
// A route's lazy `component: () => import(...)` is only swapped for the
// loaded component once a real navigation to it has run. `resolve()` does
// no loading, so on a direct load of a modal-route URL the '/settlement'
// background still holds the bare loader function — and <router-view>
// would render that function's Promise as text. `loadRouteLocation` loads
// it first. A background we navigated away from is already loaded, and is
// taken synchronously: waiting even one tick would briefly point the
// <router-view> at the modal route itself and remount the page under it.
function isLoaded(location) {
    return location.matched.every((record) => Object.values(record.components ?? {}).every((component) => typeof component !== 'function'));
}
const backgroundRoute = shallowRef(null);
watch(
// Re-read on every navigation, including ones that only change history
// state (pushing a modal route itself doesn't change any other route's
// own fullPath).
() => route.fullPath, () => {
    if (!isModalRoute.value)
        return;
    const location = backgroundLocation();
    if (isLoaded(location)) {
        // `resolve()`'s return type allows an unmatched `name: null` in
        // general, but every path this ever resolves (a stashed
        // backgroundView, or the '/settlement' fallback) is a real, named
        // route — `<router-view>`'s own `route` prop wants the matched shape.
        backgroundRoute.value = location;
        return;
    }
    void loadRouteLocation(location).then((loaded) => {
        if (isModalRoute.value)
            backgroundRoute.value = loaded;
    });
}, { immediate: true });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(isModalRoute, {});
    __VLS_withDotValue(backgroundRoute, {});
    __VLS_withDotValue(ModalComponent, {});
    const __VLS_0 = AccountRestrictedBanner;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    // @ts-ignore
    }));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    const __VLS_5 = ConnectionBanner;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
    // @ts-ignore
    }));
    const __VLS_7 = __VLS_6({}, ...__VLS_functionalComponentArgsRest(__VLS_6));
    const __VLS_10 = DemoModeBadge;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
    // @ts-ignore
    }));
    const __VLS_12 = __VLS_11({}, ...__VLS_functionalComponentArgsRest(__VLS_11));
    if (!isModalRoute.value || backgroundRoute.value) {
        let __VLS_15;
        /** @ts-ignore @type { | typeof __VLS_components.routerView | typeof __VLS_components.RouterView | typeof __VLS_components['router-view']} */
        routerView;
        // @ts-ignore
        const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
            // @ts-ignore
            route: (isModalRoute.value ? backgroundRoute.value : undefined),
        }));
        const __VLS_17 = __VLS_16({
            route: (isModalRoute.value ? backgroundRoute.value : undefined),
        }, ...__VLS_functionalComponentArgsRest(__VLS_16));
    }
    if (ModalComponent.value) {
        const __VLS_20 = (ModalComponent.value);
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
        // @ts-ignore
        }));
        const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
    }
    // @ts-ignore
    [isModalRoute, isModalRoute, backgroundRoute, backgroundRoute, ModalComponent, ModalComponent,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
