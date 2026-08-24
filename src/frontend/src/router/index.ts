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
      path: '/settlement',
      name: 'settlement',
      component: () => import('../views/SettlementView.vue'),
    },
  ],
});

router.beforeEach((to) => {
  if (to.name === 'settlement' && !usePlayerStore().hasFoundedSettlement) {
    return { name: 'landing' };
  }
  return true;
});
