<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';
import AccountRestrictedBanner from './components/AccountRestrictedBanner.vue';
import DemoModeBadge from './components/DemoModeBadge.vue';
import ProfileModal from './components/profile/ProfileModal.vue';
import { useActivityHeartbeat } from './composables/useActivityHeartbeat';

// Mounted once, app-wide: it no-ops of its own accord (via authStore.isAuthenticated)
// for anonymous visitors, so it's safe to run on every view rather than only
// some authenticated-only shell — this app has no such shell separate from
// App.vue itself.
useActivityHeartbeat();

const route = useRoute();
const router = useRouter();

// The profile routes (own-profile/profile) render as a modal over whatever
// page was showing before — see lib/profileRoute.ts and ProfileModal.vue.
// Every other route renders through <router-view> exactly as before.
const isProfileRoute = computed(() => route.name === 'own-profile' || route.name === 'profile');

// The page to keep showing underneath the profile modal. `profileLocation()`
// stashes the caller's own full path in `history.state.backgroundView` when
// it opens a profile — read that back here. A direct load, a reload, or a
// new tab opened from a link (no in-app navigation, so no stashed state) has
// nothing to go back to, so it falls back to the settlement view, per the
// spec ("newly opened tabs via link have settlement in the back").
//
// This must stay a *single* `<router-view>` element whose `route` prop
// merely changes value, never a `v-if`/`v-else` pair of separate
// `<router-view>`s — MapView.vue hosts a persistent Pixi renderer, and
// swapping which element is in the template (rather than just which route a
// prop points a stable element at) would remount it every time the modal
// opens or closes. See App.test.ts for the regression this guards.
const backgroundRoute = computed(() => {
  // Read reactively via `route.fullPath` so this recomputes on every
  // navigation, including ones that only change history state (pushing the
  // profile route itself doesn't change any other route's own fullPath).
  void route.fullPath;
  // Via the router's own history object, not the global `window.history` —
  // works the same way against a `createMemoryHistory` router in tests. See
  // lib/profileRoute.ts's own comment.
  const state = router.options.history.state as { backgroundView?: unknown };
  const backgroundView = typeof state.backgroundView === 'string' ? state.backgroundView : null;
  // `resolve()`'s return type allows an unmatched `name: null` in general,
  // but every path this ever resolves (a stashed backgroundView, or the
  // '/settlement' fallback) is a real, named route — `<router-view>`'s own
  // `route` prop just wants the narrower, already-matched shape.
  return router.resolve(backgroundView ?? '/settlement') as RouteLocationNormalizedLoaded;
});
</script>

<template>
  <AccountRestrictedBanner />
  <DemoModeBadge />
  <router-view :route="isProfileRoute ? backgroundRoute : undefined" />
  <ProfileModal v-if="isProfileRoute" />
</template>
