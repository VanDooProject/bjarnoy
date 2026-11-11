// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import SendArmyPicker from './SendArmyPicker.vue';
import { useWorldStore } from '../../stores/world';
import { useAuthStore } from '../../stores/auth';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import unitSnapshot from '../../data/unit-catalogue.json';
import type { ArmyResponse, UnitDefinitionResponse } from '../../api/types';
import { clearRouteCache } from '../../lib/map/routeQueue';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return { ...actual, DEMO_MODE: false };
});
// The pathfinder is the map's own and has its suites; here every hex is plain ground, a route costs its hex distance.
// The searches are sliced generators the route queue works off in the background, so the rows start out pending (see `routesArrive`).
vi.mock('../../lib/map/hexPath', () => ({
  findPathSteps: function* (from: { q: number; r: number }, to: { q: number; r: number }) {
    yield;
    return [from, to];
  },
  findSeaPathSteps: function* (from: { q: number; r: number }, to: { q: number; r: number }) {
    yield;
    return [from, to];
  },
  pathCost: (path: { q: number; r: number }[]) => Math.abs(path[1]!.q - path[0]!.q) + Math.abs(path[1]!.r - path[0]!.r),
}));
vi.mock('../../lib/map/movementContext', () => ({ gamePathContext: () => ({}) }));

function army(id: string, overrides: Partial<ArmyResponse> = {}, arrivesAt = '2020-01-01T05:00:00Z'): ArmyResponse {
  return {
    id,
    settlementId: 'home-1',
    mission: 'move',
    targetSettlementId: null,
    atHome: false,
    supporting: false,
    position: { q: 10, r: 0 },
    provisions: 5000,
    totalSpeed: 2,
    totalUpkeepPerHour: 10,
    visionRadius: 2,
    stacks: [{ unit: 'spearman', count: 10 }],
    movement: {
      departedAt: '2020-01-01T00:00:00Z',
      path: [
        { q: 0, r: 0 },
        { q: 10, r: 0 },
      ],
      cumulativeHours: [0, 5],
      edgeHours: [0, 2.5],
      arrivesAt,
      returnPath: [],
      returnCumulativeHours: [],
      returnEdgeHours: [],
      turnAroundAt: '2099-01-01T00:00:00Z',
      returnArrivesAt: '2099-01-02T00:00:00Z',
      isReturning: false,
    },
    ...overrides,
  };
}

const inOneHour = () => new Date(Date.now() + 3_600_000).toISOString();

/** Lets the route queue run its background searches to the end and the rows re-render with the answers. */
async function routesArrive() {
  // The queue works on 0 ms timers: wait on the DOM until no row is still checking, not on a wall-clock guess.
  await vi.waitFor(() => expect(mounted?.text()).not.toContain('Checking the route'));
  await nextTick();
}

let mounted: VueWrapper | null = null;
function mountPicker() {
  const wrapper = mount(SendArmyPicker, { global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] } });
  mounted = wrapper;
  return wrapper;
}

function setup(armies: ArmyResponse[], garrison = [{ unit: 'spearman', count: 8 }], premium = false) {
  const world = useWorldStore();
  useUnitCatalogueStore().definitions = unitSnapshot.data as UnitDefinitionResponse[];
  const auth = useAuthStore();
  auth.user = { id: 'u1', userName: 'ragnar', role: 'player', status: 'active', displayName: null, isPremium: premium, preferredLocale: null };
  world.selectedSettlementId = 'home-1';
  world.hud.settlementName = 'Bjarnoy';
  world.hud.garrison = garrison;
  world.armies = armies;
  world.openSendPicker({ q: 4, r: 0 });
  return world;
}

describe('SendArmyPicker', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    clearRouteCache();
  });

  it('lists home first, then the armies, and dims the ones that cannot go with the reason', async () => {
    const returning = army('ret');
    returning.movement!.isReturning = true;
    setup([returning, army('stand'), army('sup', { supporting: true, movement: null })]);

    const wrapper = mountPicker();
    await routesArrive();

    const rows = wrapper.findAll('.send-row');
    expect(rows.map((r) => r.attributes('data-source'))).toEqual(['home:home-1', 'stand', 'ret', 'sup']);
    expect(rows[1]!.classes()).not.toContain('is-off');
    expect(rows[2]!.classes()).toContain('is-off');
    expect(rows[2]!.text()).toContain('Returning home');
    expect(rows[3]!.text()).toContain('recall it first');
    expect((rows[3]!.get('.send-row-head').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('a row names its realm, what it is and the mission it flies, with the travel time under the mission', async () => {
    setup([army('stand')]);

    const wrapper = mountPicker();
    await routesArrive();

    const home = wrapper.get('[data-source="home:home-1"]');
    expect(home.get('.send-row-title').text()).toBe('Bjarnoy');
    expect(home.get('.send-row-sub').text()).toBe('Home · 8 units');
    expect(home.get('.send-row-mission').text()).toBe('Move');
    const field = wrapper.get('[data-source="stand"]');
    expect(field.get('.send-row-title').text()).toBe('Bjarnoy');
    expect(field.get('.send-row-sub').text()).toBe('Army · 10 units at (10, 0)');
    expect(field.get('.send-row-mission').text()).toBe('Move');
    expect(field.get('.send-row-eta').text()).toMatch(/\d+ (min|h)/);
  });

  it('an empty home stays listed, disabled, as "Home · no units"', async () => {
    setup([], []);

    const wrapper = mountPicker();
    await routesArrive();

    const home = wrapper.get('[data-source="home:home-1"]');
    expect(home.get('.send-row-sub').text()).toBe('Home · no units');
    expect(home.classes()).toContain('is-off');
    expect((home.get('.send-row-head').element as HTMLButtonElement).disabled).toBe(true);
  });

  describe('with several realms', () => {
    function withOtherRealm() {
      const world = setup([army('stand')]);
      world.otherRealms = [
        {
          realmId: 'far-1',
          name: 'Vik',
          garrison: [{ unit: 'spearman', count: 3 }],
          garrisonSpots: [],
          buildings: [],
          availableFood: 50,
          armies: [army('far-army', { settlementId: 'far-1' })],
        },
      ];
      return world;
    }

    it("lists the other realm's home and army after the open realm's rows, each under its realm's name", async () => {
      withOtherRealm();

      const wrapper = mountPicker();
      await routesArrive();

      const rows = wrapper.findAll('.send-row');
      expect(rows.map((r) => r.attributes('data-source'))).toEqual(['home:home-1', 'stand', 'far-army', 'home:far-1']);
      expect(rows.map((r) => r.get('.send-row-title').text())).toEqual(['Bjarnoy', 'Bjarnoy', 'Vik', 'Vik']);
      expect(rows[3]!.get('.send-row-sub').text()).toBe('Home · 3 units');
    });

    it('the title names no mission on a hex of the player\'s own realm, where the rows mix Move and Support', async () => {
      const world = withOtherRealm();
      const wrapper = mountPicker();
      expect(wrapper.get('.send-picker-title-text').text()).toBe('Move → Hex (4, 0)');

      world.openSendPicker({ q: 4, r: 0 }, { targetRealmId: 'home-1', targetBuildingCoord: { q: 4, r: 0 } });
      await nextTick();

      expect(wrapper.get('.send-picker-title-text').text()).toBe('Send army → Hex (4, 0)');
    });

    it('on a hex of the open realm the other realm supports and the open realm moves', async () => {
      const world = withOtherRealm();
      world.openSendPicker({ q: 4, r: 0 }, { targetRealmId: 'home-1', targetBuildingCoord: { q: 4, r: 0 } });

      const wrapper = mountPicker();
      await routesArrive();

      const missions = Object.fromEntries(wrapper.findAll('.send-row').map((r) => [r.attributes('data-source'), r.get('.send-row-mission')]));
      expect(missions['home:home-1']!.text()).toBe('Move');
      expect(missions['stand']!.text()).toBe('Move');
      expect(missions['home:far-1']!.text()).toBe('Support');
      expect(missions['home:far-1']!.attributes('data-mission')).toBe('support');
      expect(missions['far-army']!.text()).toBe('Support');
    });

    it("picking the other realm's home hands over to its dispatch form and leaves the open realm open", async () => {
      const world = withOtherRealm();
      world.openSendPicker({ q: 4, r: 0 }, { targetRealmId: 'home-1', targetBuildingCoord: { q: 4, r: 0 } });

      const wrapper = mountPicker();
      await routesArrive();
      await wrapper.get('[data-source="home:far-1"] .send-row-head').trigger('click');

      expect(world.sendPicker).toBeNull();
      expect(world.dispatchDraft).toMatchObject({ mission: 'support', targetSettlementId: 'home-1', sourceRealmId: 'far-1' });
      expect(world.selectedSettlementId).toBe('home-1');
    });
  });

  it('a marching army shows the premium lock and cannot be selected without premium', async () => {
    const world = setup([army('march', {}, inOneHour())]);

    const wrapper = mountPicker();
    await routesArrive();
    const row = wrapper.get('[data-source="march"]');

    expect(row.text()).toContain('Premium: redirect while marching');
    expect((row.get('.send-row-head').element as HTMLButtonElement).disabled).toBe(true);
    await row.get('.send-row-head').trigger('click');
    expect(world.sendPicker?.selectedId).toBeNull();
  });

  it('with premium a marching army is selectable and moves whole, with no steppers', async () => {
    setup([army('march', {}, inOneHour())], [], true);

    const wrapper = mountPicker();
    await routesArrive();
    await wrapper.get('[data-source="march"] .send-row-head').trigger('click');

    expect(wrapper.find('.send-stepper').exists()).toBe(false);
    expect(wrapper.get('[data-testid="split-note"]').text()).toBe('Whole army moves.');
  });

  it('selecting a standing army defaults to all units; trimming one tells how many keep standing and the button says what happens', async () => {
    const world = setup([army('stand')]);

    const wrapper = mountPicker();
    await routesArrive();
    await wrapper.get('[data-source="stand"] .send-row-head').trigger('click');
    expect(wrapper.get('[data-testid="split-note"]').text()).toBe('Whole army moves.');
    expect(wrapper.get('.send-go').text()).toMatch(/^Move · 10 units · \d+ (min|h)/);

    const minus = wrapper.get('.send-stepper .stepper-btn');
    for (let i = 0; i < 10; i++) await minus.trigger('click');

    expect(world.fieldOrderDraft?.units?.spearman).toBe(0);
    expect(wrapper.get('[data-testid="split-note"]').text()).toBe('Pick at least one unit.');
    expect((wrapper.get('.send-go').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('the split note counts the units that go and the ones that keep standing', async () => {
    const world = setup([army('stand')]);
    const wrapper = mountPicker();
    await routesArrive();
    await wrapper.get('[data-source="stand"] .send-row-head').trigger('click');

    world.setFieldOrderUnitCount('spearman', 4);
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-testid="split-note"]').text()).toBe('Splits: 4 go, 6 keep standing.');
    expect(wrapper.get('.send-go').text()).toContain('4 units');
  });

  it('the send button is disabled when the leaving part cannot afford the way home', async () => {
    // The army stands at (10, 0), the picker targets (4, 0) and the way home ends at (0, 0): 6 + 4 hexes, all plain ground.
    // The food it needs is that walk at the spearman's catalogue speed times the stack's catalogue upkeep; leave a bit less.
    const spearman = (unitSnapshot.data as UnitDefinitionResponse[]).find((u) => u.type === 'spearman')!;
    const count = 10;
    const walkHours = (6 + 4) / spearman.speed;
    const neededFood = walkHours * spearman.upkeepPerHour * count;
    setup([army('stand', { provisions: neededFood - 1 })]);

    const wrapper = mountPicker();
    await routesArrive();

    expect(wrapper.get('[data-source="stand"]').text()).toContain('Not enough food for the way home');
    expect((wrapper.get('[data-source="stand"] .send-row-head').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a row whose route is still being searched as checking, then selectable once the route is in', async () => {
    const world = setup([army('stand')]);

    const wrapper = mountPicker();
    const row = wrapper.get('[data-source="stand"]');

    expect(row.classes()).toContain('is-off');
    expect(row.text()).toContain('Checking the route…');
    expect(row.text()).not.toContain("Can't get there");
    expect((row.get('.send-row-head').element as HTMLButtonElement).disabled).toBe(true);

    await routesArrive();

    expect(row.classes()).not.toContain('is-off');
    expect(row.text()).not.toContain('Checking the route…');
    expect(row.get('.send-row-eta').text()).toMatch(/\d+ (min|h)/);
    await row.get('.send-row-head').trigger('click');
    expect(world.sendPicker?.selectedId).toBe('stand');
  });

  it('the home row hands over to the dispatch form for the garrison', async () => {
    const world = setup([army('stand')]);

    const wrapper = mountPicker();
    await routesArrive();
    await wrapper.get('[data-source="home:home-1"] .send-row-head').trigger('click');

    expect(world.sendPicker).toBeNull();
    expect(world.dispatchDraft?.route).toEqual([{ q: 4, r: 0 }]);
  });

  it('closing drops the order being composed', async () => {
    const world = setup([army('stand')]);
    const wrapper = mountPicker();
    await routesArrive();
    await wrapper.get('[data-source="stand"] .send-row-head').trigger('click');

    await wrapper.get('.send-picker-close').trigger('click');

    expect(world.sendPicker).toBeNull();
    expect(world.fieldOrderDraft).toBeNull();
  });
});
