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
  if (to.name === 'settlement' && !usePlayerStore().hasFoundedSettlement) {
    return { name: 'world' };
  }
  return true;
});
