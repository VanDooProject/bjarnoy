// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminWorldReseedView from './AdminWorldReseedView.vue';
import type {
  AdminWorldResponse,
  WorldReviewResponse,
  WorldReviewSummary,
  WorldSeedPreviewResponse,
  WorldSeedReviewResponse,
} from '../../api/types';
import { generationResponse, generationSettings } from '../../lib/map/testing/generationFixture';
import { DEFAULT_GENERATION } from '../../lib/map/worldGenerator';
import { createTestI18n } from '../../test/i18n';
import adminWorldReseed from '../../i18n/locales/en/adminWorldReseed.json';
import adminWorldReview from '../../i18n/locales/en/adminWorldReview.json';

const global = { plugins: [createTestI18n({ adminWorldReseed, adminWorldReview })] };

const { adminListWorlds, adminPreviewWorldSeed, adminReseedWorld, adminReviewWorldSeeds, panTo } = vi.hoisted(() => ({
  adminListWorlds: vi.fn(),
  adminPreviewWorldSeed: vi.fn(),
  adminReseedWorld: vi.fn(),
  adminReviewWorldSeeds: vi.fn(),
  panTo: vi.fn(),
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    api: { adminListWorlds, adminPreviewWorldSeed, adminReseedWorld, adminReviewWorldSeeds },
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
    // The real component exposes its HexMapRenderer as `renderer`; the review panel pans it.
    setup: () => ({ renderer: { panTo } }),
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
    freeSpawnCount: 7,
    spawnCount: 40,
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

function summary(overrides: Partial<WorldReviewSummary> = {}): WorldReviewSummary {
  return {
    seed: 4242,
    radius: 1000,
    greenIslands: 1,
    wastedIslands: 0,
    landTiles: 42,
    landingSpots: 1,
    islandsWithLandingCandidate: 1,
    islandsWithoutLandingSpots: 0,
    islandsMissingBog: 1,
    cutOffRegions: 1,
    cutOffTiles: 12,
    cutOffShare: 0.0134,
    worstIslandCutOffShare: 0.2,
    bogRuleViolations: 0,
    inlandRiverMouths: 0,
    wastedNearGreen: 0,
    errors: 0,
    warnings: 2,
    infos: 0,
    ...overrides,
  };
}

function review(overrides: Partial<WorldReviewResponse> = {}): WorldReviewResponse {
  return {
    summary: summary(),
    findings: [
      { kind: 'missingBog', severity: 'warn', island: 0, q: 3, r: -1, size: 42, message: '42 land tiles and 3 landing candidates, but no bog' },
      { kind: 'cutOffLand', severity: 'warn', island: 0, q: 4, r: -2, size: 12, message: '12 walkable hexes cut off' },
    ],
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
    review: review(),
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
    expect(value('islandLargeShare')).toBe('0.07');
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

  describe('world review', () => {
    it('shows the candidate\'s review counts and findings beside the preview map', async () => {
      const wrapper = await mountView();
      await previewSeed(wrapper);

      const panel = wrapper.find('[data-testid="world-review"]');
      expect(panel.exists()).toBe(true);
      expect(panel.find('[data-testid="review-warnings"]').text()).toBe('2 warnings');
      expect(panel.find('[data-testid="review-islandsMissingBog"]').text()).toBe('1');
      expect(panel.find('[data-testid="review-cutOffShare"]').text()).toBe('1.3%');
      const rows = panel.findAll('[data-testid="review-finding"]');
      expect(rows).toHaveLength(2);
      expect(rows[0]!.text()).toContain('Warning');
      expect(rows[0]!.text()).toContain('Missing bog');
      expect(rows[0]!.text()).toContain('no bog');
    });

    it('centres the preview map on a finding when it is clicked', async () => {
      const wrapper = await mountView();
      await previewSeed(wrapper);

      const rows = wrapper.findAll('[data-testid="review-finding"]');
      await rows[1]!.trigger('click');

      expect(panTo).toHaveBeenCalledWith({ q: 4, r: -2 });
      expect(wrapper.findAll('[data-testid="review-finding"]')[1]!.classes()).toContain('selected');
    });

    it('filters the findings by severity and says so when a seed is clean', async () => {
      const wrapper = await mountView();
      await previewSeed(wrapper);

      await wrapper.find('[data-testid="review-filter"]').setValue('error');
      expect(wrapper.findAll('[data-testid="review-finding"]')).toHaveLength(0);
      expect(wrapper.find('[data-testid="review-empty"]').exists()).toBe(true);
    });

    it('renders a long findings list a page at a time', async () => {
      const findings = Array.from({ length: 130 }, (_, i) => ({
        kind: 'cutOffLand' as const,
        severity: 'info' as const,
        island: i,
        q: i,
        r: 0,
        size: 6,
        message: `region ${i}`,
      }));
      adminListWorlds.mockResolvedValue([world()]);
      const wrapper = mount(AdminWorldReseedView, { global });
      await flushPromises();
      adminPreviewWorldSeed.mockResolvedValue(preview({ review: review({ findings }) }));
      await wrapper.findAll('button').find((b) => b.text().includes('Preview seed'))!.trigger('click');
      await flushPromises();

      expect(wrapper.findAll('[data-testid="review-finding"]')).toHaveLength(100);
      await wrapper.find('[data-testid="review-show-all"]').trigger('click');
      expect(wrapper.findAll('[data-testid="review-finding"]')).toHaveLength(130);
    });
  });

  describe('seed scan', () => {
    function scanResponse(): WorldSeedReviewResponse {
      return {
        worldId: 'world-1',
        radius: 1000,
        seeds: [summary({ seed: 12, warnings: 1 }), summary({ seed: 10, errors: 1, islandsMissingBog: 2 })],
        generation: generationResponse(),
      };
    }

    it('reviews the seed range with the generation form and lists the seeds best first as the backend ranked them', async () => {
      const wrapper = await mountView();
      adminReviewWorldSeeds.mockResolvedValue(scanResponse());

      await wrapper.find('[data-testid="scan-from"]').setValue('10');
      await wrapper.find('[data-testid="scan-count"]').setValue('3');
      await wrapper.find('[data-testid="scan-seeds"]').trigger('click');
      await flushPromises();

      expect(adminReviewWorldSeeds).toHaveBeenCalledWith(
        'world-1',
        expect.objectContaining({ seedFrom: 10, count: 3, generation: expect.objectContaining({ islandCellSize: DEFAULT_GENERATION.islandCellSize }) }),
      );
      const rows = wrapper.findAll('[data-testid="scan-row"]');
      expect(rows.map((r) => r.find('td').text())).toEqual(['12', '10']);
      expect(rows[1]!.findAll('td')[1]!.classes()).toContain('bad');
    });

    it('previews a scanned seed from its row', async () => {
      const wrapper = await mountView();
      adminReviewWorldSeeds.mockResolvedValue(scanResponse());
      await wrapper.find('[data-testid="scan-from"]').setValue('10');
      await wrapper.find('[data-testid="scan-seeds"]').trigger('click');
      await flushPromises();

      adminPreviewWorldSeed.mockResolvedValue(preview({ seed: 12 }));
      await wrapper.findAll('[data-testid="scan-preview"]')[0]!.trigger('click');
      await flushPromises();

      expect(adminPreviewWorldSeed).toHaveBeenCalledWith('world-1', expect.objectContaining({ seed: 12 }));
      expect((wrapper.find('#seed').element as HTMLInputElement).value).toBe('12');
      expect(wrapper.find('[data-testid="world-review"]').exists()).toBe(true);
    });

    it('refuses a count outside 1-8 without calling the backend', async () => {
      const wrapper = await mountView();

      await wrapper.find('[data-testid="scan-from"]').setValue('10');
      await wrapper.find('[data-testid="scan-count"]').setValue('9');
      await wrapper.find('[data-testid="scan-seeds"]').trigger('click');
      await flushPromises();

      expect(adminReviewWorldSeeds).not.toHaveBeenCalled();
      expect(wrapper.find('[data-testid="scan-error"]').text()).toBe('Count must be between 1 and 8.');
    });
  });
});
