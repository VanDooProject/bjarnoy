// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { RouterLinkStub, flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminWorldsView from './AdminWorldsView.vue';
import type { AdminWorldResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import adminWorlds from '../../i18n/locales/en/adminWorlds.json';
import { generationSettings } from '../../lib/map/testing/generationFixture';

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
    freeSpawnCount: 7,
    spawnCount: 40,
    speedFactor: 1,
    startsAt: null,
    joinsClosed: false,
    frozenIslesEnabled: false,
    hidden: false,
    hiddenFromJoin: false,
    endbossAt: null,
    endbossTriggeredAt: null,
    runState: 'running',
    runStateSince: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    seed: 1234,
    generation: generationSettings(),
    ...overrides,
  };
}

async function mountView(worlds: AdminWorldResponse[] = [world()]) {
  adminListWorlds.mockResolvedValue(worlds);
  const wrapper = mount(AdminWorldsView, {
    global: { stubs: { RouterLink: RouterLinkStub }, plugins: [createTestI18n({ adminWorlds })] },
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
    const wrapper = await mountView([
      world(),
      world({ id: 'world-2', name: 'Utgard', runState: 'paused', seed: 5678 }),
    ]);

    expect(wrapper.text()).toContain('Midgard');
    expect(wrapper.text()).toContain('Utgard');
    expect(wrapper.text()).toContain('2 / 500');
    // Free spawn spots, separate from player slots: expansions take them too.
    expect(wrapper.text()).toContain('7 / 40');
    expect(wrapper.text()).toContain('paused');
    // The world's active generation seed, surfaced so an admin can tell what
    // seed produced the current map without having to regenerate it first.
    expect(wrapper.text()).toContain('1234');
    expect(wrapper.text()).toContain('5678');
  });

  async function pickRunState(wrapper: Awaited<ReturnType<typeof mountView>>, value: string) {
    await wrapper.find('.run-state select').setValue(value);
  }

  const applyButton = (wrapper: Awaited<ReturnType<typeof mountView>>) => wrapper.find('button.apply-run-state');

  it('preselects the current run state and keeps Apply disabled until the selection differs', async () => {
    const wrapper = await mountView([world({ runState: 'maintenance' })]);

    expect((wrapper.find('.run-state select').element as HTMLSelectElement).value).toBe('maintenance');
    expect(wrapper.findAll('.run-state option').map((o) => o.text())).toEqual([
      'Running',
      'Paused',
      'Maintenance',
      'Locked',
    ]);
    expect(applyButton(wrapper).attributes('disabled')).toBeDefined();

    await pickRunState(wrapper, 'locked');
    expect(applyButton(wrapper).attributes('disabled')).toBeUndefined();

    await pickRunState(wrapper, 'maintenance');
    expect(applyButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it('says since when the world is in its run state', async () => {
    const wrapper = await mountView([
      world({ runState: 'locked', runStateSince: new Date(Date.now() - 3 * 3_600_000).toISOString() }),
    ]);

    const text = wrapper.find('.run-state-since').text();
    expect(text).toMatch(/^Locked since \d{4}-\d{2}-\d{2} \d{2}:\d{2} \(3 h.*ago\)$/);
  });

  it('confirms, then applies the picked run state through the matching action', async () => {
    const wrapper = await mountView();
    adminSetWorldRunState.mockResolvedValue(world({ runState: 'paused' }));

    await pickRunState(wrapper, 'paused');
    await applyButton(wrapper).trigger('click');
    await flushPromises();

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(adminSetWorldRunState).toHaveBeenCalledWith('world-1', { action: 'pause', graceMinutes: undefined });
    // The dropdown follows the world's new state and Apply goes back to disabled.
    expect((wrapper.find('.run-state select').element as HTMLSelectElement).value).toBe('paused');
    expect(applyButton(wrapper).attributes('disabled')).toBeDefined();
  });

  it.each([
    ['maintenance', 'maintenance'],
    ['locked', 'lock'],
  ])('maps %s to the %s action', async (state, action) => {
    const wrapper = await mountView();
    adminSetWorldRunState.mockResolvedValue(world({ runState: state }));

    await pickRunState(wrapper, state);
    await applyButton(wrapper).trigger('click');
    await flushPromises();

    expect(adminSetWorldRunState).toHaveBeenCalledWith('world-1', { action, graceMinutes: undefined });
  });

  it('shows the grace minutes only when resuming a world that is not running, and sends them', async () => {
    const wrapper = await mountView([world({ runState: 'paused' })]);
    adminSetWorldRunState.mockResolvedValue(world({ runState: 'running' }));

    expect(wrapper.find('.grace').exists()).toBe(false);
    await pickRunState(wrapper, 'locked');
    expect(wrapper.find('.grace').exists()).toBe(false);

    await pickRunState(wrapper, 'running');
    await wrapper.find('.grace input').setValue('15');
    await applyButton(wrapper).trigger('click');
    await flushPromises();

    expect(adminSetWorldRunState).toHaveBeenCalledWith('world-1', { action: 'resume', graceMinutes: 15 });
  });

  it('hides the grace minutes for a running world', async () => {
    const wrapper = await mountView();
    await pickRunState(wrapper, 'running');
    expect(wrapper.find('.grace').exists()).toBe(false);
  });

  it('leaves the run state alone when the confirmation is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = await mountView();

    await pickRunState(wrapper, 'locked');
    await applyButton(wrapper).trigger('click');
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
      radius: 4000,
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

  it('saves the frozen isles flag alongside the other settings', async () => {
    const wrapper = await mountView();
    adminUpdateWorldSettings.mockResolvedValue(world({ frozenIslesEnabled: true }));

    const checkbox = wrapper.find('input#frozen-world-1');
    expect((checkbox.element as HTMLInputElement).checked).toBe(false);
    await checkbox.setValue(true);

    await wrapper.find('.actions button').trigger('click');
    await flushPromises();

    expect(adminUpdateWorldSettings).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({ frozenIslesEnabled: true }),
    );
  });

  it('shows dates as text in the UI language layout and sends them back as ISO', async () => {
    const startsAt = new Date(2026, 2, 5, 19, 30);
    const wrapper = await mountView([world({ startsAt: startsAt.toISOString() })]);
    adminUpdateWorldSettings.mockResolvedValue(world());

    const field = wrapper.find('input#starts-world-1');
    expect((field.element as HTMLInputElement).value).toBe('2026-03-05 19:30');
    expect((field.element as HTMLInputElement).placeholder).toBe('YYYY-MM-DD HH:mm');

    await wrapper.find('input#endboss-world-1').setValue('2026-04-01 08:15');
    await wrapper.find('.actions button').trigger('click');
    await flushPromises();

    expect(adminUpdateWorldSettings).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({
        startsAt: startsAt.toISOString(),
        endbossAt: new Date(2026, 3, 1, 8, 15).toISOString(),
      }),
    );
  });

  it('clears a date when its field is emptied', async () => {
    const wrapper = await mountView([world({ startsAt: new Date(2026, 2, 5, 19, 30).toISOString() })]);
    adminUpdateWorldSettings.mockResolvedValue(world());

    await wrapper.find('input#starts-world-1').setValue('');
    await wrapper.find('.actions button').trigger('click');
    await flushPromises();

    expect(adminUpdateWorldSettings).toHaveBeenCalledWith('world-1', expect.objectContaining({ startsAt: null }));
  });

  it('shows an inline error for an unreadable date and does not save', async () => {
    const wrapper = await mountView();

    await wrapper.find('input#starts-world-1').setValue('05.03.2026 19:30');
    expect(wrapper.find('.datetime-error').text()).toContain('YYYY-MM-DD HH:mm');

    await wrapper.find('.actions button').trigger('click');
    await flushPromises();

    expect(adminUpdateWorldSettings).not.toHaveBeenCalled();
    expect(wrapper.find('.panel .error').exists()).toBe(true);
  });

  it('edits the world name and both visibility flags alongside the other settings', async () => {
    const wrapper = await mountView();
    adminUpdateWorldSettings.mockResolvedValue(world({ name: 'Asgard', hidden: true, hiddenFromJoin: true }));

    // The name is the first field of the panel.
    expect(wrapper.find('.panel .fields input').attributes('id')).toBe('name-world-1');
    const name = wrapper.find('input#name-world-1');
    expect((name.element as HTMLInputElement).value).toBe('Midgard');
    await name.setValue('  Asgard  ');
    await wrapper.find('input#hidden-world-1').setValue(true);
    await wrapper.find('input#hidden-join-world-1').setValue(true);

    await wrapper.find('.actions button').trigger('click');
    await flushPromises();

    expect(adminUpdateWorldSettings).toHaveBeenCalledWith(
      'world-1',
      expect.objectContaining({ name: 'Asgard', hidden: true, hiddenFromJoin: true }),
    );
  });

  it('refuses a panel name shorter than three characters without calling the API', async () => {
    const wrapper = await mountView();

    await wrapper.find('input#name-world-1').setValue(' ab ');
    await wrapper.find('.actions button').trigger('click');
    await flushPromises();

    expect(adminUpdateWorldSettings).not.toHaveBeenCalled();
    expect(wrapper.find('.panel .error').text()).toContain('at least three characters');
  });

  it('shows the hidden flags as columns of the overview table', async () => {
    const wrapper = await mountView([
      world(),
      world({ id: 'world-2', name: 'Utgard', hidden: true, hiddenFromJoin: true }),
    ]);

    const headers = wrapper.findAll('thead th').map((th) => th.text());
    const hiddenCol = headers.indexOf('Hidden');
    const joinCol = headers.indexOf('Hidden from join');
    expect(hiddenCol).toBeGreaterThan(-1);
    expect(joinCol).toBeGreaterThan(-1);

    const [visible, hidden] = wrapper.findAll('tbody tr').map((tr) => tr.findAll('td').map((td) => td.text()));
    expect([visible[hiddenCol], visible[joinCol]]).toEqual(['No', 'No']);
    expect([hidden[hiddenCol], hidden[joinCol]]).toEqual(['Yes', 'Yes']);
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
