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
    props: { tile, mine: true, ownerLabel: null },
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

describe('BuildingModal actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    flags.demo = false;
  });

  it('is info-only on an empty claimed tile: a pointer to the ring, no cost line, no action button', () => {
    rich(useWorldStore());
    const wrapper = mountModal({ q: 1, r: 1, terrain: 'forest' } as Tile);

    expect(wrapper.text()).toContain('Tap the hex to place a building');
    expect(wrapper.text()).not.toMatch(/build cost/i);
    expect(wrapper.find('button.primary').exists()).toBe(false);
  });

  it('still offers the upgrade action on a built tile', async () => {
    rich(useWorldStore());
    const wrapper = mountModal({ q: 1, r: 1, terrain: 'grass', buildingType: 'farm', buildingLevel: 1 } as Tile);

    const button = wrapper.get('button.primary');
    expect(button.text()).toContain('Upgrade to level 2');
    await button.trigger('click');
    expect(wrapper.emitted('upgrade')).toHaveLength(1);
  });

  const runningUpgrade = {
    id: 'order-1', q: 1, r: 1, building: 'farm', kind: 'build' as const, targetLevel: 3, state: 'building' as const, slotCost: 1,
    completesAtGameTime: null, completesInSeconds: 60, totalSeconds: 60,
  };

  it('offers no upgrade while the hex already has its one order (the server would refuse it)', () => {
    const world = useWorldStore();
    rich(world);
    world.hud.queue = [runningUpgrade];
    const wrapper = mountModal({ q: 1, r: 1, terrain: 'grass', buildingType: 'farm', buildingLevel: 2 } as Tile);

    expect(wrapper.get('[data-testid="hex-busy-note"]').text()).toBe('This hex already has an order');
    expect(wrapper.find('button.primary').exists()).toBe(false);
  });

  it('with stacking allowed, offers the level after the running upgrade', () => {
    const world = useWorldStore();
    rich(world);
    world.hud.construction = { ...world.hud.construction, maxOrdersPerHex: 2 };
    world.hud.queue = [runningUpgrade];
    const wrapper = mountModal({ q: 1, r: 1, terrain: 'grass', buildingType: 'farm', buildingLevel: 2 } as Tile);

    expect(wrapper.get('button.primary').text()).toContain('Upgrade to level 4');
  });
});

describe('BuildingModal outside the realm', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    flags.demo = false;
  });

  const farm = (): Tile => ({ q: 4, r: 0, terrain: 'grass', buildingType: 'farm', buildingLevel: 5 }) as Tile;

  function placeOutside(world: ReturnType<typeof useWorldStore>, seconds: number | null) {
    world.hud.queueFetchedAt = Date.now();
    world.hud.buildings = [
      { q: 4, r: 0, type: 'farm', level: 5, outsideRealmSince: '2026-11-01T10:00:00Z', nextLevelLossInSeconds: seconds },
    ];
  }

  it('shows one line with the time to the next lost level and offers no upgrade', () => {
    const world = useWorldStore();
    rich(world);
    placeOutside(world, 26 * 3600);
    const wrapper = mountModal(farm());

    const line = wrapper.get('[data-testid="outside-realm"]').text();
    expect(line).toContain('Outside your realm');
    expect(line).toContain('no function');
    expect(line).toContain('loses a level in 1 day, 2 hours');
    expect(wrapper.find('.actions').exists()).toBe(false);
    expect(wrapper.find('.stats').exists()).toBe(false);
  });

  it('still says it has no function when the server gave no time', () => {
    const world = useWorldStore();
    placeOutside(world, null);

    expect(mountModal(farm()).get('[data-testid="outside-realm"]').text()).toContain('no function');
  });

  it('shows nothing of it for a building inside the realm', () => {
    const world = useWorldStore();
    rich(world);
    world.hud.buildings = [{ q: 4, r: 0, type: 'farm', level: 5 }];
    const wrapper = mountModal(farm());

    expect(wrapper.find('[data-testid="outside-realm"]').exists()).toBe(false);
    expect(wrapper.find('.actions').exists()).toBe(true);
  });

  it('hides the Town Square feast while the square is outside the realm', () => {
    const world = useWorldStore();
    rich(world);
    world.hud.queueFetchedAt = Date.now();
    world.hud.buildings = [{ q: 2, r: 1, type: 'townsquare', level: 3, outsideRealmSince: '2026-11-01T10:00:00Z', nextLevelLossInSeconds: 3600 }];

    expect(mountModal(townSquare(3)).find('[data-testid="feast"]').exists()).toBe(false);
  });
});
