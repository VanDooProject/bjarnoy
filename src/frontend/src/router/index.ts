import { createRouter, createWebHistory } from 'vue-router';
import { usePlayerStore } from '../stores/player';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: () => import('../views/LandingView.vue'),
    },
    {
      path: '/world',
      name: 'world',
      component: () => import('../views/WorldMapView.vue'),
    },
    {
      path: '/settlement',
      name: 'settlement',
      component: () => import('../views/SettlementView.vue'),
    },
    {
      path: '/impressum',
      name: 'impressum',
      component: () => import('../views/ImpressumView.vue'),
    },
  ],
});

router.beforeEach((to) => {
  const player = usePlayerStore();
  // zip 6a: founding (and the guided build-2-more-buildings onboarding that
  // follows it) only ever happens on the landing page now — the world map
  // never founds a settlement. So `/world` and `/settlement` both require an
  // already-founded settlement, and `/` itself is done being the founding
  // surface once onboarding is complete.
  if (to.name === 'landing' && player.hasFoundedSettlement && player.onboardingComplete) {
    return { name: 'settlement' };
  }
  if ((to.name === 'settlement' || to.name === 'world') && !player.hasFoundedSettlement) {
    return { name: 'landing' };
  }
  return true;
});
