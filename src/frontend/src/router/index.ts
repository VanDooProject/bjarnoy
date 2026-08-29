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
      // Own profile — needs a logged-in user to know whose it is.
      path: '/profile',
      name: 'own-profile',
      component: () => import('../views/ProfileView.vue'),
      meta: { requiresAuth: true },
    },
    {
      // Another player's public profile, by username.
      path: '/profile/:userName',
      name: 'profile',
      component: () => import('../views/ProfileView.vue'),
    },
    {
      path: '/leaderboards',
      name: 'leaderboards',
      component: () => import('../views/LeaderboardView.vue'),
    },
    {
      path: '/guild',
      name: 'guild',
      component: () => import('../views/GuildView.vue'),
    },
    {
      // Issue #40 phase 3: battle-reports inbox, and the same view's detail
      // mode when a report id is in the URL (so a report can be deep-linked/
      // shared, e.g. from a future notification) — see ReportsView.vue.
      path: '/reports',
      name: 'reports',
      component: () => import('../views/ReportsView.vue'),
    },
    {
      path: '/reports/:reportId',
      name: 'report-detail',
      component: () => import('../views/ReportsView.vue'),
    },
    {
      // Issue #40 phase 7: the premium fight simulator — the one endpoint in
      // this game that actually requires login (every other troop endpoint
      // works anonymously), so it needs `requiresAuth` even though most
      // routes here don't. Being logged in doesn't mean being premium
      // though — SimulatorView.vue itself handles the 403 for that, since
      // there's no client-side premium flag to gate on ahead of time.
      path: '/simulator',
      name: 'simulator',
      component: () => import('../views/SimulatorView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/messages',
      name: 'messages',
      component: () => import('../views/MessagesView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/messages/:userId',
      name: 'conversation',
      component: () => import('../views/ConversationView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/impressum',
      name: 'impressum',
      component: () => import('../views/ImpressumView.vue'),
    },
    {
      path: '/docs',
      name: 'docs',
      component: () => import('../views/DocsView.vue'),
    },
    {
      path: '/tech-tree',
      name: 'tech-tree',
      component: () => import('../views/TechTreeView.vue'),
    },
    {
      path: '/docs/tiles',
      name: 'tile-docs',
      component: () => import('../views/TileDocsView.vue'),
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
        {
          path: 'settlements',
          name: 'admin-settlements',
          component: () => import('../views/admin/AdminSettlementsView.vue'),
        },
        {
          path: 'reports',
          name: 'admin-reports',
          component: () => import('../views/admin/AdminReportsView.vue'),
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
