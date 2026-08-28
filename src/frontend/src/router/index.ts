import { createRouter, createWebHistory } from 'vue-router';
import { resolveAuthGuard } from './authGuard';
import { useAuthStore } from '../stores/auth';
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
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
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
    {
      path: '/admin',
      component: () => import('../views/admin/AdminLayout.vue'),
      meta: { requiresAdmin: true },
      children: [
        { path: '', redirect: '/admin/worlds' },
        {
          path: 'worlds',
          name: 'admin-worlds',
          component: () => import('../views/admin/AdminWorldsView.vue'),
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('../views/admin/AdminUsersView.vue'),
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  // Awaited once (see `ensureInitialized`) so a page reload restores a
  // logged-in user from the stored refresh token before this guard has to
  // decide anything — otherwise a reload would always look unauthenticated
  // for one tick and bounce a logged-in user to /login.
  const auth = useAuthStore();
  await auth.ensureInitialized();

  const authRedirect = resolveAuthGuard(to, auth);
  if (authRedirect !== true) return authRedirect;

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
