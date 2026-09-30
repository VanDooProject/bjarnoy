// @vitest-environment jsdom
//
// Town Square feast action (economy.md section 6): cost/duration/gain, the
// disabled reasons, and the running countdown.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import BuildingModal from './BuildingModal.vue';
import { useWorldStore } from '../../stores/world';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';
import enApiErrors from '../../i18n/locales/en/apiErrors.json';
import type { Tile } from '../../lib/map/types';

const flags = vi.hoisted(() => ({ demo: false }));
vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return {
    ...actual,
    get DEMO_MODE() {
      return flags.demo;
    },
  };
});

const holdFeast = vi.hoisted(() => vi.fn());
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: { ...actual.api, holdFeast } };
});

const townSquare = (level = 3): Tile => ({ q: 2, r: 1, terrain: 'grass', buildingType: 'townsquare', buildingLevel: level }) as Tile;

function mountModal(tile: Tile = townSquare()) {
  return mount(BuildingModal, {
    props: { tile, mine: true, ownerLabel: null, busy: false },
    global: {
      plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue, apiErrors: enApiErrors })],
      stubs: { AtlasSprite: true },
    },
  });
}

function rich(world: ReturnType<typeof useWorldStore>) {
  world.hud.available = { wood: 5000, stone: 5000, food: 5000, iron: 0 };
}

describe('BuildingModal Town Square feast', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    flags.demo = false;
    holdFeast.mockReset();
  });

  it('shows the level-scaled cost, 12 hour duration and renown gain', () => {
    rich(useWorldStore());
    const wrapper = mountModal(townSquare(3));

    expect(wrapper.get('[data-testid="feast-cost"]').text()).toContain('1250');
    expect(wrapper.text()).toContain('12 h');
    expect(wrapper.get('[data-testid="feast-gain"]').text()).toContain('4629');
  });

  it('is not offered on other buildings or while the Town Square is still a foundation', () => {
    rich(useWorldStore());

    expect(mountModal({ ...townSquare(), buildingType: 'farm' }).find('[data-testid="feast"]').exists()).toBe(false);
    expect(mountModal(townSquare(0)).find('[data-testid="feast"]').exists()).toBe(false);
  });

  it('is disabled with the reason when the stock cannot pay for it', () => {
    const world = useWorldStore();
    world.hud.available = { wood: 100, stone: 100, food: 100, iron: 0 };
    const wrapper = mountModal();

    expect(wrapper.get('[data-testid="feast-button"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="feast-reason"]').text()).toMatch(/not enough resources/i);
  });

  it('holds a feast through the API when affordable', async () => {
    rich(useWorldStore());
    const world = useWorldStore();
    world.selectedSettlementId = 's1';
    holdFeast.mockResolvedValue({});
    const refresh = vi.spyOn(world, 'refreshLiveSettlement').mockResolvedValue();
    const wrapper = mountModal();

    await wrapper.get('[data-testid="feast-button"]').trigger('click');
    await flushPromises();

    expect(holdFeast).toHaveBeenCalledWith('s1', undefined);
    expect(refresh).toHaveBeenCalled();
  });

  it('shows a countdown and blocks a second feast while one runs', () => {
    const world = useWorldStore();
    rich(world);
    world.hud.feast = {
      startedAtGameTime: '2026-01-01T00:00:00Z',
      endsAtGameTime: '2026-01-01T12:00:00Z',
      endsInSeconds: 3725,
      renownGain: 4629,
    };
    world.hud.feastFetchedAt = Date.now();
    const wrapper = mountModal();

    expect(wrapper.get('[data-testid="feast-countdown"]').text()).toContain('1:02:0');
    expect(wrapper.get('[data-testid="feast-countdown"]').text()).toContain('+4629');
    expect(wrapper.get('[data-testid="feast-button"]').attributes('disabled')).toBeDefined();
  });

  it('demo mode shows the action disabled with an explanation instead of faking a feast', () => {
    flags.demo = true;
    rich(useWorldStore());
    const wrapper = mountModal();

    expect(wrapper.get('[data-testid="feast-button"]').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-testid="feast-reason"]').text()).toMatch(/live world/i);
  });
});
