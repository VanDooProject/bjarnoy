// The one rule for whether HudNav.vue (desktop bar) and MobileHudDrawer.vue
// (phone drawer) offer a "Landing" link — kept here so the two surfaces
// can't drift apart again.
//
// - never on the landing route itself (landing-page-defects.md L1: a
//   self-link is a click to nowhere);
// - never once the player has founded a settlement: the landing page is the
//   pitch + onboarding entry for players with nothing yet, and a founded
//   player opening `/` only lands back in their own onboarding/settlement
//   flow — a "Landing" link there reads as "start over" and offers nothing.
import { computed, type ComputedRef } from 'vue';
import { useRoute } from 'vue-router';
import { usePlayerStore } from '../stores/player';

export function showsLandingLink(routeName: unknown, hasFoundedSettlement: boolean): boolean {
  return routeName !== 'landing' && !hasFoundedSettlement;
}

export function useLandingLink(): ComputedRef<boolean> {
  const route = useRoute();
  const player = usePlayerStore();
  return computed(() => showsLandingLink(route.name, player.hasFoundedSettlement));
}
