// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminWorldReseedView from './AdminWorldReseedView.vue';
import type { AdminWorldResponse, WorldSeedPreviewResponse } from '../../api/types';

const { adminListWorlds, adminPreviewWorldSeed, adminReseedWorld } = vi.hoisted(() => ({
  adminListWorlds: vi.fn(),
  adminPreviewWorldSeed: vi.fn(),
  adminReseedWorld: vi.fn(),
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    api: { adminListWorlds, adminPreviewWorldSeed, adminReseedWorld },
  };
});

const push = vi.fn();

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    useRoute: () => ({ params: { worldId: 'world-1' } }),
    useRouter: () => ({ push }),
  };
});

// The real canvas mounts a PixiJS renderer against a WebGL context jsdom does
// not have — the map's own rendering is e2e territory (see
// e2e/admin-world-reseed.spec.ts). What matters here is that this view hands
// it a model built from the preview response.
vi.mock('../../components/map/WorldMapCanvas.vue', () => ({
  default: {
    name: 'WorldMapCanvas',
    props: ['worldModel', 'playerId'],
    template: '<div class="map-container" />',
  },
}));

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

function preview(overrides: Partial<WorldSeedPreviewResponse> = {}): WorldSeedPreviewResponse {
  return {
    worldId: 'world-1',
    seed: 4242,
    radius: 30,
    islandCount: 1,
    landTileCount: 42,
    islands: [
      {
        index: 0,
        name: 'Skarnsey',
        q: 3,
        r: -1,
        tileCount: 42,
        startPositions: [{ q: 3, r: -1 }],
        riverTiles: [{ q: 3, r: -1, shape: 'spring', inDirections: [], outDirection: 'E' }],
      },
    ],
    ...overrides,
  };
}

/** Mounts the view with its world already loaded. */
async function mountView() {
  adminListWorlds.mockResolvedValue([world()]);
  const wrapper = mount(AdminWorldReseedView);
  await flushPromises();
  return wrapper;
}

/** Previews a seed through the UI, the only way to reach the commit panel. */
async function previewSeed(wrapper: Awaited<ReturnType<typeof mountView>>, seed = 4242) {
  adminPreviewWorldSeed.mockResolvedValue(preview({ seed }));
  await wrapper.find('#seed').setValue(String(seed));
  await wrapper.findAll('button').find((b) => b.text().includes('Preview seed'))!.trigger('click');
  await flushPromises();
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminWorldReseedView', () => {
  it('previews a candidate seed without offering to commit anything yet', async () => {
    const wrapper = await mountView();

    expect(wrapper.text()).toContain('Midgard');
    // Nothing to commit before a map has actually been looked at.
    expect(wrapper.find('#confirm-name').exists()).toBe(false);
    expect(wrapper.find('.map-container').exists()).toBe(false);

    await previewSeed(wrapper);

    expect(adminPreviewWorldSeed).toHaveBeenCalledWith('world-1', { seed: 4242 });
    expect(adminReseedWorld).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="preview-summary"]').text()).toContain('1 islands');
    expect(wrapper.find('.map-container').exists()).toBe(true);
  });

  it('renders the preview with the world-map renderer, seeded from the response', async () => {
    const wrapper = await mountView();
    await previewSeed(wrapper, 777);

    const canvas = wrapper.findComponent({ name: 'WorldMapCanvas' });
    const model = canvas.props('worldModel') as {
      seed: number;
      listIslands: () => { id: string; name: string }[];
      getRiverTile: (q: number, r: number) => unknown;
    };

    expect(model.seed).toBe(777);
    expect(model.listIslands()).toEqual([{ id: 'preview-0', name: 'Skarnsey', q: 3, r: -1 }]);
    // Rivers can't be derived client-side, so they have to come from the
    // preview response — terrain itself is generated from the seed.
    expect(model.getRiverTile(3, -1)).toBeTruthy();
  });

  it('starts with a randomized seed and can randomize it again', async () => {
    const wrapper = await mountView();

    const first = (wrapper.find('#seed').element as HTMLInputElement).value;
    expect(Number.isInteger(Number(first))).toBe(true);

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await wrapper.findAll('button').find((b) => b.text() === 'Randomize')!.trigger('click');
    expect((wrapper.find('#seed').element as HTMLInputElement).value).toBe(String(2 ** 30));
  });

  it('refuses to commit until the world name is retyped exactly', async () => {
    const wrapper = await mountView();
    await previewSeed(wrapper);

    const button = () => wrapper.findAll('button').find((b) => b.text().includes('Reseed world'))!;
    expect(button().attributes('disabled')).toBeDefined();

    await wrapper.find('#confirm-name').setValue('midgard');
    expect(button().attributes('disabled')).toBeDefined();

    await wrapper.find('#confirm-name').setValue('Midgard');
    expect(button().attributes('disabled')).toBeUndefined();
  });

  it('confirms once more, then commits the previewed seed and reports what it destroyed', async () => {
    const wrapper = await mountView();
    await previewSeed(wrapper, 9001);
    adminReseedWorld.mockResolvedValue({
      world: world({ playerCount: 0 }),
      seed: 9001,
      islandCount: 7,
      deletedSettlements: 2,
    });

    await wrapper.find('#confirm-name').setValue('Midgard');
    await wrapper.findAll('button').find((b) => b.text().includes('Reseed world'))!.trigger('click');
    await flushPromises();

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(adminReseedWorld).toHaveBeenCalledWith('world-1', { confirmWorldName: 'Midgard', seed: 9001 });
    expect(wrapper.find('[data-testid="reseed-done"]').text()).toContain('2 settlement(s) deleted');
  });

  it('does not commit when the extra confirmation is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const wrapper = await mountView();
    await previewSeed(wrapper);

    await wrapper.find('#confirm-name').setValue('Midgard');
    await wrapper.findAll('button').find((b) => b.text().includes('Reseed world'))!.trigger('click');
    await flushPromises();

    expect(adminReseedWorld).not.toHaveBeenCalled();
  });

  it('surfaces a refusal from the backend instead of pretending it worked', async () => {
    const { ApiError } = await import('../../api/client');
    const wrapper = await mountView();
    await previewSeed(wrapper);
    adminReseedWorld.mockRejectedValue(
      new ApiError(409, { title: 'Refused.', detail: 'The world has real players in it.' }),
    );

    await wrapper.find('#confirm-name').setValue('Midgard');
    await wrapper.findAll('button').find((b) => b.text().includes('Reseed world'))!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('The world has real players in it.');
    expect(wrapper.find('[data-testid="reseed-done"]').exists()).toBe(false);
  });
});
