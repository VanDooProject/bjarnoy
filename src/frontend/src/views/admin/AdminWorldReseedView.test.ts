// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminWorldReseedView from './AdminWorldReseedView.vue';
import type { AdminWorldResponse, WorldSeedPreviewResponse } from '../../api/types';
import { generationResponse, generationSettings } from '../../lib/map/testing/generationFixture';
import { DEFAULT_GENERATION } from '../../lib/map/worldGenerator';
import { createTestI18n } from '../../test/i18n';
import adminWorldReseed from '../../i18n/locales/en/adminWorldReseed.json';

const global = { plugins: [createTestI18n({ adminWorldReseed })] };

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

const DEFAULT_SETTINGS = generationSettings();

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
    frozenIslesEnabled: false,
    endbossAt: null,
    endbossTriggeredAt: null,
    runState: 'running',
    runStateSince: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    seed: 1234,
    generation: DEFAULT_SETTINGS,
    ...overrides,
  };
}

function preview(overrides: Partial<WorldSeedPreviewResponse> = {}): WorldSeedPreviewResponse {
  return {
    worldId: 'world-1',
    seed: 4242,
    radius: 1000,
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
        giants: [{ family: 'giantmountain', q: 5, r: -2, orientation: 'NE' }],
        camps: [],
        bogTiles: [],
        wasted: false,
      },
    ],
    generation: generationResponse(),
    ...overrides,
  };
}

/** Mounts the view with its world already loaded. */
async function mountView(loadedWorld: AdminWorldResponse = world()) {
  adminListWorlds.mockResolvedValue([loadedWorld]);
  const wrapper = mount(AdminWorldReseedView, { global });
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
  it("shows the world's currently active seed, and updates it once a reseed commits", async () => {
    const wrapper = await mountView(world({ seed: 555 }));

    expect(wrapper.find('[data-testid="current-seed"]').text()).toContain('555');

    await previewSeed(wrapper, 9001);
    adminReseedWorld.mockResolvedValue({
      world: world({ playerCount: 0, seed: 9001 }),
      seed: 9001,
      islandCount: 7,
      deletedSettlements: 2,
    });

    await wrapper.find('#confirm-name').setValue('Midgard');
    await wrapper.findAll('button').find((b) => b.text().includes('Reseed world'))!.trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="current-seed"]').text()).toContain('9001');
  });

  it('previews a candidate seed without offering to commit anything yet', async () => {
    const wrapper = await mountView();

    expect(wrapper.text()).toContain('Midgard');
    // Nothing to commit before a map has actually been looked at.
    expect(wrapper.find('#confirm-name').exists()).toBe(false);
    expect(wrapper.find('.map-container').exists()).toBe(false);

    await previewSeed(wrapper);

    expect(adminPreviewWorldSeed).toHaveBeenCalledWith('world-1', {
      seed: 4242,
      generation: DEFAULT_SETTINGS,
    });
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

  it('builds the preview model from the generation the candidate was generated with, not the defaults', async () => {
    const wrapper = await mountView();
    const generation = { ...generationResponse(), worldRadius: 2500, islandMinWidth: 33, islandCellSize: 300 };
    adminPreviewWorldSeed.mockResolvedValue(preview({ seed: 555, generation }));
    await wrapper.find('#seed').setValue('555');
    await wrapper.findAll('button').find((b) => b.text() === 'Preview seed')!.trigger('click');
    await flushPromises();

    const model = wrapper.findComponent({ name: 'WorldMapCanvas' }).props('worldModel') as {
      generation: typeof generation;
    };
    expect(model.generation).toEqual(generation);
    expect(model.generation).not.toEqual(DEFAULT_GENERATION);
  });

  it("passes the preview's giants to the model and marks a wasted island's river tiles wasted", async () => {
    const wrapper = await mountView();
    const base = preview({ seed: 42 });
    adminPreviewWorldSeed.mockResolvedValue({
      ...base,
      islands: [
        ...base.islands,
        {
          ...base.islands[0],
          index: 1,
          name: 'Utgard',
          q: 40,
          r: 0,
          riverTiles: [{ q: 40, r: 0, shape: 'spring', inDirections: [], outDirection: 'E' }],
          giants: [],
          camps: [],
          bogTiles: [],
          wasted: true,
        },
      ],
    });
    await wrapper.find('#seed').setValue('42');
    await wrapper.findAll('button').find((b) => b.text() === 'Preview seed')!.trigger('click');
    await flushPromises();

    const model = wrapper.findComponent({ name: 'WorldMapCanvas' }).props('worldModel') as {
      getRiverTile: (q: number, r: number) => { wasted?: boolean } | undefined;
      giantAnchorAt: (c: { q: number; r: number }) => { q: number; r: number } | null;
    };
    expect(model.giantAnchorAt({ q: 5, r: -2 })).toEqual({ q: 5, r: -2 });
    expect(model.getRiverTile(3, -1)?.wasted).toBeFalsy();
    expect(model.getRiverTile(40, 0)?.wasted).toBe(true);
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
    expect(adminReseedWorld).toHaveBeenCalledWith('world-1', {
      confirmWorldName: 'Midgard',
      seed: 9001,
      generation: DEFAULT_SETTINGS,
    });
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

  it("pre-fills the generation form with the world's current values", async () => {
    const wrapper = await mountView();

    expect((wrapper.find('#gen-islandMinWidth').element as HTMLInputElement).value).toBe('21');
    expect((wrapper.find('#gen-islandMaxWidth').element as HTMLInputElement).value).toBe('40');
    expect((wrapper.find('#gen-minimumIslandTiles').element as HTMLInputElement).value).toBe('6');
  });

  it("pre-fills the island-shape form fields with the world's current values", async () => {
    const wrapper = await mountView();

    const value = (id: string) => (wrapper.find(`#gen-${id}`).element as HTMLInputElement).value;
    expect(value('islandMinSegments')).toBe('5');
    expect(value('islandMaxSegments')).toBe('9');
    expect(value('islandMinElongation')).toBe('5');
    expect(value('islandMaxElongation')).toBe('8');
    expect(value('islandMinBend')).toBe('0.12');
    expect(value('islandMaxBend')).toBe('0.35');
    expect(value('islandCoastWarp')).toBe('9.5');
    expect(value('islandCoastWarpScale')).toBe('42');
    expect(value('islandCoastNoise')).toBe('1');
    expect(value('islandCoastNoiseScale')).toBe('49');
    expect(value('islandSmallShare')).toBe('0.3');
    expect(value('islandLargeShare')).toBe('0.12');
  });

  it('sends an edited island-shape parameter to the preview endpoint', async () => {
    const wrapper = await mountView();

    await wrapper.find('#gen-islandMaxSegments').setValue('7');
    await previewSeed(wrapper);

    expect(adminPreviewWorldSeed).toHaveBeenCalledWith('world-1', {
      seed: 4242,
      generation: { ...DEFAULT_SETTINGS, islandMaxSegments: 7 },
    });
  });

  it('sends an edited generation parameter to the preview endpoint', async () => {
    const wrapper = await mountView();

    await wrapper.find('#gen-islandMinWidth').setValue('25.5');
    await previewSeed(wrapper);

    expect(adminPreviewWorldSeed).toHaveBeenCalledWith('world-1', {
      seed: 4242,
      generation: { ...DEFAULT_SETTINGS, islandMinWidth: 25.5 },
    });
  });

  it('disables committing once a generation field changes after the preview it would commit', async () => {
    const wrapper = await mountView();
    await previewSeed(wrapper);
    await wrapper.find('#confirm-name').setValue('Midgard');

    const reseedButton = () => wrapper.findAll('button').find((b) => b.text().includes('Reseed world'))!;
    expect(reseedButton().attributes('disabled')).toBeUndefined();

    await wrapper.find('#gen-islandChance').setValue('0.6');
    expect(reseedButton().attributes('disabled')).toBeDefined();

    // Re-previewing with the new value re-enables it.
    await previewSeed(wrapper);
    expect(reseedButton().attributes('disabled')).toBeUndefined();
  });

  it('restores the generation form to the world\'s current values on "Reset to current"', async () => {
    const wrapper = await mountView();

    await wrapper.find('#gen-islandMinWidth').setValue('25.5');
    await wrapper.find('[data-testid="reset-generation"]').trigger('click');

    expect((wrapper.find('#gen-islandMinWidth').element as HTMLInputElement).value).toBe('21');
  });
});
