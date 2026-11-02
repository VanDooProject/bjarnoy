<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { loadRouteLocation, useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';
import AccountRestrictedBanner from './components/AccountRestrictedBanner.vue';
import ConnectionBanner from './components/hud/ConnectionBanner.vue';
import DemoModeBadge from './components/DemoModeBadge.vue';
import ProfileModal from './components/profile/ProfileModal.vue';
import LeaderboardModal from './components/leaderboard/LeaderboardModal.vue';
import GuildModal from './components/guild/GuildModal.vue';
import ReportsModal from './components/reports/ReportsModal.vue';
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
// report-detail) render as a modal over whatever page was showing before —
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
  const state = router.options.history.state as { backgroundView?: unknown };
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
function isLoaded(location: RouteLocationNormalizedLoaded | ReturnType<typeof router.resolve>) {
  return location.matched.every((record) =>
    Object.values(record.components ?? {}).every((component) => typeof component !== 'function'),
  );
}

const backgroundRoute = shallowRef<RouteLocationNormalizedLoaded | null>(null);
watch(
  // Re-read on every navigation, including ones that only change history
  // state (pushing a modal route itself doesn't change any other route's
  // own fullPath).
  () => route.fullPath,
  () => {
    if (!isModalRoute.value) return;
    const location = backgroundLocation();
    if (isLoaded(location)) {
      // `resolve()`'s return type allows an unmatched `name: null` in
      // general, but every path this ever resolves (a stashed
      // backgroundView, or the '/settlement' fallback) is a real, named
      // route — `<router-view>`'s own `route` prop wants the matched shape.
      backgroundRoute.value = location as RouteLocationNormalizedLoaded;
      return;
    }
    void loadRouteLocation(location).then((loaded) => {
      if (isModalRoute.value) backgroundRoute.value = loaded;
    });
  },
  { immediate: true },
);
</script>

<template>
  <AccountRestrictedBanner />
  <ConnectionBanner />
  <DemoModeBadge />
  <!-- Nothing behind the modal until a directly-loaded background has loaded. -->
  <router-view v-if="!isModalRoute || backgroundRoute" :route="isModalRoute ? backgroundRoute! : undefined" />
  <component :is="ModalComponent" v-if="ModalComponent" />
</template>
