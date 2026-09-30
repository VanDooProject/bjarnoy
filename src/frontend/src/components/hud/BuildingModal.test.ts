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
import type { RenownResponse } from '../../api/types';

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

  describe('renown progress', () => {
    const renownOf = (over: Partial<RenownResponse> = {}): RenownResponse => ({
      total: 12340,
      settlementCount: 1,
      requiredForNextSettlement: 55000,
      canFoundAnother: false,
      perHour: 48,
      pendingFeastRenown: 0,
      ...over,
    });

    it('shows the total, target, hourly rate and an ETA at that rate', () => {
      const world = useWorldStore();
      rich(world);
      world.hud.renown = renownOf();
      const wrapper = mountModal();

      expect(wrapper.get('[data-testid="renown-line"]').text()).toBe('Renown 12,340 / 55,000 for settlement no. 2');
      expect(wrapper.get('[data-testid="renown-rate"]').text()).toContain('+48 renown per hour');
      expect(wrapper.get('[data-testid="renown-missing"]').text()).toContain('42,660');
      // 42 660 / 48 = 888.75 h = 37 d 0 h 45 min
      expect(wrapper.get('[data-testid="renown-eta"]').text()).toBe('About 37 d 0 h at this rate (without feasts)');
      expect(wrapper.find('[data-testid="renown-eta-feast"]').exists()).toBe(false);
    });

    it('uses hours and minutes for a near target', () => {
      const world = useWorldStore();
      rich(world);
      world.hud.renown = renownOf({ total: 54000 });
      const wrapper = mountModal();

      expect(wrapper.get('[data-testid="renown-eta"]').text()).toContain('20 h 50 min');
    });

    it('says so when the renown already covers the next settlement', () => {
      const world = useWorldStore();
      rich(world);
      world.hud.renown = renownOf({ total: 60000, canFoundAnother: true });
      const wrapper = mountModal();

      expect(wrapper.get('[data-testid="renown-enough"]').text()).toMatch(/already have enough renown/i);
      expect(wrapper.find('[data-testid="renown-eta"]').exists()).toBe(false);
    });

    it('adds the running feast to the outlook', () => {
      const world = useWorldStore();
      rich(world);
      world.hud.renown = renownOf({ total: 52000, pendingFeastRenown: 4629 });
      world.hud.feast = {
        startedAtGameTime: '2026-01-01T00:00:00Z',
        endsAtGameTime: '2026-01-01T12:00:00Z',
        endsInSeconds: 4 * 3600 + 12 * 60,
        renownGain: 4629,
      };
      world.hud.feastFetchedAt = Date.now();
      const wrapper = mountModal();

      expect(wrapper.get('[data-testid="feast-countdown"]').text()).toContain('+4629');
      // 3000 missing at 48/h = 62.5 h without; the feast lands after 4 h 12 min and covers it.
      expect(wrapper.get('[data-testid="renown-eta"]').text()).toContain('2 d 14 h');
      expect(wrapper.get('[data-testid="renown-eta-feast"]').text()).toContain('4 h 12 min');
    });

    it('demo mode shows no renown numbers', () => {
      flags.demo = true;
      const world = useWorldStore();
      rich(world);
      world.hud.renown = renownOf();
      const wrapper = mountModal();

      expect(wrapper.find('[data-testid="renown-progress"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="renown-demo"]').text()).toMatch(/live world/i);
    });
  });
});
