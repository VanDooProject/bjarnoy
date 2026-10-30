// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import { useHudNavEntries } from './useHudNavEntries';
import { usePlayerStore } from '../stores/player';
import { useAuthStore } from '../stores/auth';
import { useReportsStore } from '../stores/reports';

const stub = { template: '<div />' };
function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'landing', component: stub },
      { path: '/settlement', name: 'settlement', component: stub },
      { path: '/world', name: 'world', component: stub },
      { path: '/leaderboards', name: 'leaderboards', component: stub },
      { path: '/messages', name: 'messages', component: stub },
      { path: '/reports', name: 'reports', component: stub },
      { path: '/guild', name: 'guild', component: stub },
      { path: '/docs', name: 'docs', component: stub },
    ],
  });
}

async function setup(path: string) {
  const router = testRouter();
  await router.push(path);
  await router.isReady();
  const scope = effectScope();
  // useRoute/useRouter inject from the app, so run inside a mounted app's provide context.
  const { createApp } = await import('vue');
  const app = createApp({ render: () => null });
  app.use(router);
  app.use(createPinia());
  setActivePinia(app.config.globalProperties.$pinia);
  let api!: ReturnType<typeof useHudNavEntries>;
  app.runWithContext(() => scope.run(() => { api = useHudNavEntries(); }));
  return { api, router, scope };
}

function login() {
  useAuthStore().user = {
    id: 'u', userName: 'ragnar', role: 'player', status: 'active', displayName: null, isPremium: false, preferredLocale: null,
  };
}

describe('useHudNavEntries', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('lists the destinations an anonymous, unfounded visitor may use, landing included off the landing route', async () => {
    const { api } = await setup('/docs');
    expect(api.entries.value.map((e) => e.id)).toEqual(['reports', 'guild', 'docs', 'landing']);
  });

  it('hides the landing link once a settlement is founded', async () => {
    const { api } = await setup('/docs');
    expect(api.entries.value.map((e) => e.id)).toContain('landing');
    usePlayerStore().hasFoundedSettlement = true;
    expect(api.entries.value.map((e) => e.id)).not.toContain('landing');
  });

  it('hides the landing link on the landing route itself', async () => {
    const { api } = await setup('/');
    expect(api.entries.value.map((e) => e.id)).not.toContain('landing');
  });

  it('shows every entry but landing to a founded, logged-in player, and splits primary from secondary', async () => {
    const { api } = await setup('/settlement');
    usePlayerStore().hasFoundedSettlement = true;
    login();
    expect(api.entries.value.map((e) => e.id)).toEqual(['settlement', 'world', 'leaderboards', 'messages', 'reports', 'guild', 'docs']);
    expect(api.primary.value.map((e) => e.id)).toEqual(['settlement', 'world']);
    expect(api.secondary.value.map((e) => e.id)).toEqual(['leaderboards', 'messages', 'reports', 'guild', 'docs']);
  });

  it('marks the entry of the current route active', async () => {
    const { api } = await setup('/guild');
    expect(api.entries.value.find((e) => e.active)?.id).toBe('guild');
  });

  it('carries the unread reports count as the reports badge', async () => {
    const { api } = await setup('/docs');
    const reports = useReportsStore();
    reports.lastSeenAt = null;
    expect(api.entries.value.find((e) => e.id === 'reports')?.badge).toBe(0);
    reports.items = [{ id: 'r1', occurredAt: '2026-01-01T00:00:00Z' }] as never;
    expect(api.entries.value.find((e) => e.id === 'reports')?.badge).toBe(1);
  });

  it('navigates to the entry target', async () => {
    const { api, router } = await setup('/docs');
    api.entries.value.find((e) => e.id === 'guild')!.go();
    await new Promise((r) => setTimeout(r, 0));
    expect(router.currentRoute.value.name).toBe('guild');
  });
});
