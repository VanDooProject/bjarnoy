// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLayout from './AdminLayout.vue';
import { useAdminWorldStore } from '../../stores/adminWorld';
import type { AdminWorldResponse } from '../../api/types';

// AdminLayout renders <router-link> tabs and its own <router-view> for
// child tabs — a real (memory-history) router resolves those, same
// reasoning as MessagesView.test.ts's testRouter(). AdminLayout itself is
// mounted directly below rather than registered as a route component: doing
// both would make its own <router-view> match its own route and render a
// second nested copy of itself.
function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: ['worlds', 'users', 'settlements', 'reports', 'activity'].map((tab) => ({
      path: `/admin/${tab}`,
      component: { template: '<div />' },
    })),
  });
}

const { adminListWorlds } = vi.hoisted(() => ({ adminListWorlds: vi.fn() }));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: { adminListWorlds } };
});

function world(overrides: Partial<AdminWorldResponse> = {}): AdminWorldResponse {
  return {
    id: 'world-1',
    name: 'Midgard',
    status: 'active',
    maxPlayers: 100,
    playerCount: 1,
    speedFactor: 1,
    baseShieldDays: 7,
    startsAt: null,
    joinsClosed: false,
    endbossAt: null,
    endbossTriggeredAt: null,
    runState: 'running',
    runStateSince: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    beginnerRingsWithCapacity: 6,
    beginnerRingsTotal: 6,
    beginnerTotalExhaustion: false,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

async function mountLayout() {
  const router = testRouter();
  await router.push('/admin/worlds');
  await router.isReady();
  return mount(AdminLayout, { global: { plugins: [router] } });
}

describe('AdminLayout', () => {
  it('lists worlds in the header selector', async () => {
    adminListWorlds.mockResolvedValue([world({ id: 'world-1', name: 'Midgard' }), world({ id: 'world-2', name: 'Jotunheim' })]);

    const wrapper = await mountLayout();
    await flushPromises();

    const options = wrapper.findAll('select option');
    expect(options.map((o) => o.text())).toEqual(['Midgard', 'Jotunheim']);
  });

  it('shows a link to create a world instead of the selector when none exist', async () => {
    adminListWorlds.mockResolvedValue([]);

    const wrapper = await mountLayout();
    await flushPromises();

    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.text()).toContain('No worlds yet');
  });

  it('changing the selector persists the new selection', async () => {
    adminListWorlds.mockResolvedValue([world({ id: 'world-1', name: 'Midgard' }), world({ id: 'world-2', name: 'Jotunheim' })]);

    const wrapper = await mountLayout();
    await flushPromises();

    await wrapper.find('select').setValue('world-2');

    expect(useAdminWorldStore().selectedWorldId).toBe('world-2');
    expect(localStorage.getItem('bjarnoy.admin.selectedWorldId')).toBe('world-2');
  });
});
