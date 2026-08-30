// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminWorldsView from './AdminWorldsView.vue';
import type { AdminWorldResponse } from '../../api/types';

const { adminListWorlds, adminCreateWorld, adminUpdateWorldSettings, adminSetWorldRunState } = vi.hoisted(
  () => ({
    adminListWorlds: vi.fn(),
    adminCreateWorld: vi.fn(),
    adminUpdateWorldSettings: vi.fn(),
    adminSetWorldRunState: vi.fn(),
  }),
);

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    api: { adminListWorlds, adminCreateWorld, adminUpdateWorldSettings, adminSetWorldRunState },
  };
});

function world(overrides: Partial<AdminWorldResponse> = {}): AdminWorldResponse {
  return {
    id: 'world-1',
    name: 'Midgard',
    status: 'active',
    maxPlayers: 500,
    playerCount: 3,
    speedFactor: 1,
    startsAt: null,
    joinsClosed: false,
    endbossAt: null,
    endbossTriggeredAt: null,
    runState: 'running',
    runStateSince: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('AdminWorldsView', () => {
  it('creates a world and adds it to the list', async () => {
    adminListWorlds.mockResolvedValue([world()]);
    adminCreateWorld.mockResolvedValue(world({ id: 'world-2', name: 'Alfheim', maxPlayers: 200 }));

    const wrapper = mount(AdminWorldsView);
    await flushPromises();

    await wrapper.find('.create input[type="text"]').setValue('Alfheim');
    const numbers = wrapper.findAll('.create input[type="number"]');
    await numbers[0]!.setValue('77');
    await numbers[2]!.setValue('200');
    await wrapper.find('.create').trigger('submit');
    await flushPromises();

    expect(adminCreateWorld).toHaveBeenCalledWith({
      name: 'Alfheim',
      seed: 77,
      radius: 60,
      maxPlayers: 200,
    });
    expect(wrapper.text()).toContain('Alfheim');
  });

  it('leaves the seed out entirely when the field is blank, so the backend draws one', async () => {
    adminListWorlds.mockResolvedValue([]);
    adminCreateWorld.mockResolvedValue(world({ id: 'world-2', name: 'Alfheim' }));

    const wrapper = mount(AdminWorldsView);
    await flushPromises();

    await wrapper.find('.create input[type="text"]').setValue('Alfheim');
    await wrapper.find('.create').trigger('submit');
    await flushPromises();

    expect(adminCreateWorld).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alfheim', seed: undefined }),
    );
  });

  it('refuses a name too short to be a world name without calling the API', async () => {
    adminListWorlds.mockResolvedValue([]);

    const wrapper = mount(AdminWorldsView);
    await flushPromises();

    await wrapper.find('.create input[type="text"]').setValue('ab');
    await wrapper.find('.create').trigger('submit');
    await flushPromises();

    expect(adminCreateWorld).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('at least three characters');
  });
});
