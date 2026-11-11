// @vitest-environment jsdom
//
// The building HUD layer: one persistent marker per own building, the zoom tier deciding whether the box shows, the
// toggle (switch button and the H key behind the renderer's own key guard) and the right-most-on-top stacking. The
// renderer is a stand-in that only answers the four things the layer reads.
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import BuildingHudLayer, { type BuildingHudRenderer } from './BuildingHudLayer.vue';
import { useWorldStore } from '../../stores/world';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

// The live building list (`hud.buildings`) is the source under test; the demo reads the local model instead.
vi.mock('../../config', () => ({ DEMO_MODE: false, API_BASE_URL: '/api/v1' }));

let frames: FrameRequestCallback[] = [];
/** Runs the placement loop once, like one animation frame. */
function runFrame() {
  const callbacks = frames;
  frames = [];
  callbacks.forEach((cb) => cb(0));
}

function fakeRenderer(overrides: Partial<BuildingHudRenderer> = {}) {
  const renderer = {
    // Screen x grows with q, so the stacking order is easy to predict.
    dialScreenPoint: (coord: { q: number; r: number }) => ({ x: 100 + coord.q * 80, y: 300 + coord.r * 10 }),
    cameraZoom: 1,
    settlementBaseZoom: 1,
    keyDrivesMap: vi.fn(() => true),
    ...overrides,
  };
  return renderer as BuildingHudRenderer & { cameraZoom: number; keyDrivesMap: ReturnType<typeof vi.fn> };
}

function mountLayer(renderer: BuildingHudRenderer) {
  return mount(BuildingHudLayer, {
    props: { renderer },
    attachTo: document.body,
    global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
  });
}

function seedBuildings() {
  const world = useWorldStore();
  world.selectedSettlementId = 'settlement-1';
  world.hud.buildings = [
    { q: 3, r: 0, type: 'barracks', level: 2 },
    { q: 1, r: 0, type: 'longhouse', level: 1 },
    { q: 2, r: 0, type: 'tower', level: 10 },
    // A wall segment has no level to show.
    { q: 4, r: 0, type: 'palisade', level: 1 },
  ];
  return world;
}

const keyDown = (key: string, init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));

describe('BuildingHudLayer', () => {
  let wrapper: VueWrapper | undefined;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.unstubAllGlobals();
  });

  it('renders one marker per building that has a level, and none for walls', () => {
    seedBuildings();
    wrapper = mountLayer(fakeRenderer());
    const coords = wrapper.findAll('.hud-marker').map((m) => m.attributes('data-coord'));
    expect(coords.sort()).toEqual(['1,0', '2,0', '3,0']);
    expect(wrapper.get('[data-coord="3,0"] .hud-marker__inner').attributes('aria-label')).toBe('Barracks, level 2');
  });

  it('shows the level in the dial and a max ring for a building at its ceiling', () => {
    seedBuildings();
    wrapper = mountLayer(fakeRenderer());
    expect(wrapper.get('[data-coord="3,0"] text').text()).toBe('2');
    // The tower stands at level 10, its maximum: gold full ring.
    expect(wrapper.get('[data-coord="2,0"] polygon:nth-of-type(2)').attributes('stroke')).toBe('#ffd23f');
  });

  it('puts every marker on its building each frame with a transform', () => {
    seedBuildings();
    wrapper = mountLayer(fakeRenderer());
    runFrame();
    expect(wrapper.get<HTMLElement>('[data-coord="2,0"]').element.style.transform).toBe('translate3d(260.0px, 300.0px, 0)');
  });

  it('shows the box on mid and near, and only the dial on far', async () => {
    seedBuildings();
    const renderer = fakeRenderer();
    wrapper = mountLayer(renderer);
    runFrame();
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-coord="3,0"]').attributes('data-tier')).toBe('mid');
    expect(wrapper.find('[data-coord="3,0"] .hud-marker__box').exists()).toBe(true);

    renderer.cameraZoom = 2;
    runFrame();
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-coord="3,0"]').attributes('data-tier')).toBe('near');
    expect(wrapper.find('[data-coord="3,0"] .hud-marker__box').exists()).toBe(true);

    renderer.cameraZoom = 0.5;
    runFrame();
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-coord="3,0"]').attributes('data-tier')).toBe('far');
    expect(wrapper.find('.hud-marker__box').exists()).toBe(false);
    // The dial stays, smaller.
    expect(wrapper.find('[data-coord="3,0"] svg.hud-dial').exists()).toBe(true);
  });

  it('measures the tiers against the zoom the view landed on, not an absolute zoom', async () => {
    seedBuildings();
    // Landed at 0.4: the same 0.4 is mid, 0.8 is near.
    const renderer = fakeRenderer({ settlementBaseZoom: 0.4, cameraZoom: 0.4 });
    wrapper = mountLayer(renderer);
    runFrame();
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.hud-marker').attributes('data-tier')).toBe('mid');
    renderer.cameraZoom = 0.8;
    runFrame();
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.hud-marker').attributes('data-tier')).toBe('near');
  });

  it('stacks markers by screen x, right-most on top', () => {
    seedBuildings();
    wrapper = mountLayer(fakeRenderer());
    runFrame();
    const z = (key: string) => Number(wrapper!.get<HTMLElement>(`[data-coord="${key}"]`).element.style.zIndex);
    expect(z('1,0')).toBeLessThan(z('2,0'));
    expect(z('2,0')).toBeLessThan(z('3,0'));
  });

  it('hides every marker when the switch is turned off, and the choice is remembered', async () => {
    seedBuildings();
    wrapper = mountLayer(fakeRenderer());
    const toggle = wrapper.get('button[role="switch"]');
    expect(toggle.attributes('aria-checked')).toBe('true');
    await toggle.trigger('click');
    expect(wrapper.findAll('.hud-marker')).toHaveLength(0);
    expect(toggle.attributes('aria-checked')).toBe('false');
    expect(useHudPrefsStore().buildingInfo).toBe(false);
    expect(localStorage.getItem('bjarnoy.hudBuildingInfo')).toBe('off');
    await toggle.trigger('click');
    expect(wrapper.findAll('.hud-marker')).toHaveLength(3);
  });

  it('starts hidden when the player turned it off before', () => {
    localStorage.setItem('bjarnoy.hudBuildingInfo', 'off');
    seedBuildings();
    wrapper = mountLayer(fakeRenderer());
    expect(wrapper.findAll('.hud-marker')).toHaveLength(0);
  });

  it('toggles on the H key', async () => {
    seedBuildings();
    wrapper = mountLayer(fakeRenderer());
    keyDown('h');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.hud-marker')).toHaveLength(0);
    keyDown('H');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.hud-marker')).toHaveLength(3);
  });

  it('leaves H alone where the renderer would ignore a key (locked, covered, typing, modifier)', async () => {
    seedBuildings();
    const renderer = fakeRenderer();
    renderer.keyDrivesMap.mockReturnValue(false);
    wrapper = mountLayer(renderer);
    keyDown('h');
    await wrapper.vm.$nextTick();
    expect(useHudPrefsStore().buildingInfo).toBe(true);
    expect(renderer.keyDrivesMap).toHaveBeenCalledTimes(1);
  });

  it('ignores Shift+H and key auto-repeat', async () => {
    seedBuildings();
    wrapper = mountLayer(fakeRenderer());
    keyDown('H', { shiftKey: true });
    keyDown('h', { repeat: true });
    await wrapper.vm.$nextTick();
    expect(useHudPrefsStore().buildingInfo).toBe(true);
  });

  it('counts a running upgrade down inside the dial on mid and keeps the level on far', async () => {
    const world = seedBuildings();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [
      {
        id: 'o1', q: 3, r: 0, building: 'barracks', kind: 'build', targetLevel: 3, state: 'building', slotCost: 1,
        completesAtGameTime: null, completesInSeconds: 125, totalSeconds: 250,
      },
    ];
    const renderer = fakeRenderer();
    wrapper = mountLayer(renderer);
    runFrame();
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-coord="3,0"] text').text()).toBe('2:05');
    renderer.cameraZoom = 0.5;
    runFrame();
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-coord="3,0"] text').text()).toBe('2');
  });
});
