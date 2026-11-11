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
    // The progress dial's map scale: 1 is the size at the settlement's default zoom.
    dialMapScale: 1,
    keyDrivesMap: vi.fn(() => true),
    // The mouse over the map and the hex under it; a test sets them to hover a marker.
    mousePoint: null as { x: number; y: number } | null,
    hoveredHexKey: null as string | null,
    tapObserver: null as ((screen: { x: number; y: number }) => void) | null,
    setTapObserver(fn: ((screen: { x: number; y: number }) => void) | null) {
      this.tapObserver = fn;
    },
    ...overrides,
  };
  return renderer as BuildingHudRenderer & {
    dialMapScale: number;
    keyDrivesMap: ReturnType<typeof vi.fn>;
    mousePoint: { x: number; y: number } | null;
    hoveredHexKey: string | null;
    tapObserver: ((screen: { x: number; y: number }) => void) | null;
  };
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
    // A bridge does get a marker.
    { q: 5, r: 0, type: 'bridge', level: 1 },
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

  it('renders one marker per building that is not a wall, bridges included', () => {
    seedBuildings();
    wrapper = mountLayer(fakeRenderer());
    const coords = wrapper.findAll('.hud-marker').map((m) => m.attributes('data-coord'));
    expect(coords.sort()).toEqual(['1,0', '2,0', '3,0', '5,0']);
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
    // The dial's centre sits on the progress dial's centre, scaled by the map scale.
    expect(wrapper.get<HTMLElement>('[data-coord="2,0"]').element.style.transform).toBe('translate3d(260.0px, 300.0px, 0) scale(1.000)');
  });

  it('scales the whole marker with the map like the progress dial', () => {
    seedBuildings();
    const renderer = fakeRenderer({ dialMapScale: 0.8 });
    wrapper = mountLayer(renderer);
    runFrame();
    expect(wrapper.get<HTMLElement>('[data-coord="2,0"]').element.style.transform).toContain('scale(0.800)');
    renderer.dialMapScale = 2;
    runFrame();
    expect(wrapper.get<HTMLElement>('[data-coord="2,0"]').element.style.transform).toContain('scale(2.000)');
  });

  it('shows the box from mid on, the dial alone before that, and the bare ring on far', async () => {
    seedBuildings();
    const renderer = fakeRenderer();
    wrapper = mountLayer(renderer);
    const at = async (scale: number) => {
      renderer.dialMapScale = scale;
      runFrame();
      await wrapper!.vm.$nextTick();
    };
    const marker = () => wrapper!.get('[data-coord="3,0"]');
    await at(1);
    expect(marker().attributes('data-tier')).toBe('mid');
    expect(marker().find('.hud-marker__box').exists()).toBe(true);

    await at(1.5);
    expect(marker().attributes('data-tier')).toBe('near');
    expect(marker().find('.hud-marker__box').exists()).toBe(true);

    // The box text would be under the minimum size: the dial with its level, no box.
    await at(0.8);
    expect(marker().attributes('data-tier')).toBe('dial');
    expect(marker().find('.hud-marker__box').exists()).toBe(false);
    expect(marker().find('text').text()).toBe('2');

    // Where the progress dial hides its label: ring only, no number, no box.
    await at(0.5);
    expect(marker().attributes('data-tier')).toBe('far');
    expect(marker().find('.hud-marker__box').exists()).toBe(false);
    expect(marker().find('text').exists()).toBe(false);
    expect(marker().find('svg.hud-dial polygon').exists()).toBe(true);
  });

  it('grows a hovered marker to its default-zoom size and brings it to the front, then lets it shrink back', async () => {
    seedBuildings();
    const renderer = fakeRenderer({ dialMapScale: 0.5 });
    wrapper = mountLayer(renderer);
    runFrame();
    await wrapper.vm.$nextTick();
    const el = () => wrapper!.get<HTMLElement>('[data-coord="1,0"]');
    expect(el().element.style.transform).toContain('scale(0.500)');
    expect(el().attributes('data-tier')).toBe('far');

    // The mouse is on the dial (the marker's dial sits at x 180, y 300): no DOM event, the map's own pointer decides.
    renderer.mousePoint = { x: 182, y: 302 };
    // Frames are 0 ms apart in the test; the tween needs real time, so step the clock.
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(60);
      runFrame();
    }
    vi.useRealTimers();
    await wrapper.vm.$nextTick();
    expect(el().element.style.transform).toContain('scale(1.000)');
    expect(el().attributes('data-tier')).toBe('mid');
    expect(el().find('.hud-marker__box').exists()).toBe(true);
    // Left-most by x, yet above the markers to its right.
    expect(Number(el().element.style.zIndex)).toBe(3);

    renderer.mousePoint = null;
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(60);
      runFrame();
    }
    vi.useRealTimers();
    expect(el().element.style.transform).toContain('scale(0.500)');
  });

  it('reveals a tapped marker on touch and closes it with the next tap elsewhere', async () => {
    seedBuildings();
    const renderer = fakeRenderer({ dialMapScale: 0.5 });
    wrapper = mountLayer(renderer);
    runFrame();
    vi.useFakeTimers({ toFake: ['Date'] });
    renderer.tapObserver!({ x: 181, y: 301 });
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(60);
      runFrame();
    }
    expect(wrapper.get<HTMLElement>('[data-coord="1,0"]').element.style.transform).toContain('scale(1.000)');
    renderer.tapObserver!({ x: 600, y: 50 });
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(60);
      runFrame();
    }
    vi.useRealTimers();
    expect(wrapper.get<HTMLElement>('[data-coord="1,0"]').element.style.transform).toContain('scale(0.500)');
  });

  it('grows the marker of the hex the mouse is over, even beside its dial', async () => {
    seedBuildings();
    const renderer = fakeRenderer({ dialMapScale: 0.5 });
    wrapper = mountLayer(renderer);
    renderer.hoveredHexKey = '1,0';
    vi.useFakeTimers({ toFake: ['Date'] });
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(60);
      runFrame();
    }
    vi.useRealTimers();
    expect(wrapper.get<HTMLElement>('[data-coord="1,0"]').element.style.transform).toContain('scale(1.000)');
  });

  it('takes no pointer events itself and stops listening to the map when it goes away', () => {
    seedBuildings();
    const renderer = fakeRenderer();
    wrapper = mountLayer(renderer);
    expect(renderer.tapObserver).toBeTypeOf('function');
    wrapper.unmount();
    wrapper = undefined;
    expect(renderer.tapObserver).toBeNull();
  });

  it('stacks markers by screen x, right-most on top', () => {
    seedBuildings();
    wrapper = mountLayer(fakeRenderer());
    runFrame();
    const z = (key: string) => Number(wrapper!.get<HTMLElement>(`[data-coord="${key}"]`).element.style.zIndex);
    expect(z('1,0')).toBeLessThan(z('2,0'));
    expect(z('2,0')).toBeLessThan(z('3,0'));
  });

  it('hides every marker when the icon button is turned off, and the choice is remembered', async () => {
    seedBuildings();
    wrapper = mountLayer(fakeRenderer());
    const toggle = wrapper.get('button.building-hud__toggle');
    expect(toggle.attributes('aria-pressed')).toBe('true');
    expect(toggle.attributes('aria-label')).toBe('Building info (H)');
    await toggle.trigger('click');
    expect(wrapper.findAll('.hud-marker')).toHaveLength(0);
    expect(toggle.attributes('aria-pressed')).toBe('false');
    expect(useHudPrefsStore().buildingInfo).toBe(false);
    expect(localStorage.getItem('bjarnoy.hudBuildingInfo')).toBe('off');
    await toggle.trigger('click');
    expect(wrapper.findAll('.hud-marker')).toHaveLength(4);
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
    expect(wrapper.findAll('.hud-marker')).toHaveLength(4);
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

  it('counts a running upgrade down inside the dial on mid and shows the ring and arc only on far', async () => {
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
    // On far the dial is the ring and the yellow arc only.
    renderer.dialMapScale = 0.5;
    runFrame();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-coord="3,0"] text').exists()).toBe(false);
    expect(wrapper.find('[data-coord="3,0"] polyline').exists()).toBe(true);
  });
});
