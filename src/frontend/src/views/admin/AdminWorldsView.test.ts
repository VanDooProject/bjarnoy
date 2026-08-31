// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils';
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
    playerCount: 2,
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

async function mountView(worlds: AdminWorldResponse[] = [world()]) {
  adminListWorlds.mockResolvedValue(worlds);
  const wrapper = mount(AdminWorldsView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminWorldsView', () => {
  it('lists every world with its admin-only fields', async () => {
    const wrapper = await mountView([world(), world({ id: 'world-2', name: 'Utgard', runState: 'paused' })]);

    expect(wrapper.text()).toContain('Midgard');
    expect(wrapper.text()).toContain('Utgard');
    expect(wrapper.text()).toContain('2 / 500');
    expect(wrapper.text()).toContain('paused');
  });

  it('confirms before changing a world run state', async () => {
    const wrapper = await mountView();
    adminSetWorldRunState.mockResolvedValue(world({ runState: 'paused' }));

    await wrapper.findAll('button').find((b) => b.text() === 'Pause')!.trigger('click');
    await flushPromises();

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(adminSetWorldRunState).toHaveBeenCalledWith('world-1', { action: 'pause', graceMinutes: undefined });
  });

  it('leaves the run state alone when the confirmation is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = await mountView();

    await wrapper.findAll('button').find((b) => b.text() === 'Lock')!.trigger('click');
    await flushPromises();

    expect(adminSetWorldRunState).not.toHaveBeenCalled();
  });

  // Issue #133: reseeding is destructive enough to live behind its own route,
  // where the candidate map is previewed before anything is committed — this
  // view only points at it.
  it('links each world to its own reseed page', async () => {
    const wrapper = await mountView([world(), world({ id: 'world-2', name: 'Utgard' })]);

    const links = wrapper.findAllComponents(RouterLinkStub);
    expect(links.map((link) => link.props('to'))).toEqual([
      '/admin/worlds/world-1/reseed',
      '/admin/worlds/world-2/reseed',
    ]);
    expect(links[0].text()).toContain('Reseed map');
  });

  it('creates a world and adds it to the list', async () => {
    const wrapper = await mountView([world()]);
    adminCreateWorld.mockResolvedValue(world({ id: 'world-2', name: 'Alfheim', maxPlayers: 200 }));

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
    const wrapper = await mountView([]);
    adminCreateWorld.mockResolvedValue(world({ id: 'world-2', name: 'Alfheim' }));

    await wrapper.find('.create input[type="text"]').setValue('Alfheim');
    await wrapper.find('.create').trigger('submit');
    await flushPromises();

    expect(adminCreateWorld).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alfheim', seed: undefined }),
    );
  });

  it('refuses a name too short to be a world name without calling the API', async () => {
    const wrapper = await mountView([]);

    await wrapper.find('.create input[type="text"]').setValue('ab');
    await wrapper.find('.create').trigger('submit');
    await flushPromises();

    expect(adminCreateWorld).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('at least three characters');
  });
});
