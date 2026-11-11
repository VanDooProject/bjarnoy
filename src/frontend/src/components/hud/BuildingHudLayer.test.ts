// @vitest-environment jsdom
//
// The building HUD layer: one persistent marker per own building, the zoom tier deciding whether the box shows, the
// toggle (switch button and the H key behind the renderer's own key guard) and the right-most-on-top stacking. The
// renderer is a stand-in that only answers the four things the layer reads.
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import BuildingHudLayer, { type BuildingHudRenderer } from './BuildingHudLayer.vue';
import { useWorldStore } from '../../stores/world';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { installFakeAnimate, type FakeAnimate } from '../../test/fakeAnimate';
import { DIAL_REJECT_MS, constructionDialsFromQueue, rejectDialAt, type ConstructionDial } from '../../lib/map/constructionDial';
import { markerScale } from '../../lib/hud/buildingHud';
import { makePendingOrder } from '../../lib/hud/pendingBuild';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

/** A marker at the smallest zoom, fully hovered: lifted to the size where the compact box shows. */
const HOVERED_SMALLEST = markerScale(0.3, 1);

// The live building list (`hud.buildings`) is the source under test; the demo reads the local model instead.
vi.mock('../../config', () => ({ DEMO_MODE: false, API_BASE_URL: '/api/v1' }));

// Phone or desktop: the switch is the layer's own button on a phone and the panel column's first icon on desktop.
const mobile = vi.hoisted(() => ({ value: true }));
vi.mock('../../composables/useIsMobile', async () => {
  const { ref } = await import('vue');
  return { useIsMobile: () => ref(mobile.value) };
});

let frames: FrameRequestCallback[] = [];
let mounted: { frameObserver: (() => void) | null } | null = null;
/** One bare animation frame: runs what asked for one (a dial's own animation), but the layer's placement ignores it. */
function runAnimationFrame() {
  const callbacks = frames;
  frames = [];
  callbacks.forEach((cb) => cb(0));
}
/** One rendered map frame: the renderer calls the layer's frame observer (the layer has no animation-frame loop of its own). */
function runFrame() {
  mounted?.frameObserver?.();
  runAnimationFrame();
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
    frameObserver: null as (() => void) | null,
    setFrameObserver(fn: (() => void) | null) {
      this.frameObserver = fn;
    },
    markerOcclusionCircle: null as { x: number; y: number; r: number } | null,
    // The renderer's construction dials; a test replaces the array to change them, like the renderer does.
    constructionDialList: [] as ConstructionDial[],
    ...overrides,
  };
  return renderer as BuildingHudRenderer & {
    dialMapScale: number;
    keyDrivesMap: ReturnType<typeof vi.fn>;
    mousePoint: { x: number; y: number } | null;
    markerOcclusionCircle: { x: number; y: number; r: number } | null;
    hoveredHexKey: string | null;
    tapObserver: ((screen: { x: number; y: number }) => void) | null;
    frameObserver: (() => void) | null;
    constructionDialList: ConstructionDial[];
  };
}

function mountLayer(renderer: BuildingHudRenderer) {
  mounted = renderer as unknown as { frameObserver: (() => void) | null };
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
    mounted = null;
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

  it('places the markers from the renderer frame, from the camera of that same frame, and not from animation frames', () => {
    seedBuildings();
    const renderer = fakeRenderer();
    wrapper = mountLayer(renderer);
    runFrame();
    const el = () => wrapper!.get<HTMLElement>('[data-coord="2,0"]').element;
    expect(el().style.transform).toBe('translate3d(260.0px, 300.0px, 0) scale(1.000)');

    // The camera moves, but the canvas has not rendered yet: animation frames alone do not move the markers.
    renderer.dialScreenPoint = (coord) => ({ x: 500 + coord.q * 80, y: 40 });
    renderer.dialMapScale = 0.5;
    runAnimationFrame();
    runAnimationFrame();
    expect(el().style.transform).toBe('translate3d(260.0px, 300.0px, 0) scale(1.000)');

    // The renderer's frame places them from the camera it just drew.
    runFrame();
    expect(el().style.transform).toBe('translate3d(660.0px, 40.0px, 0) scale(0.500)');
    expect(frames).toEqual([]);
  });

  it('hands the frame observer to a renderer it is given later and lets go of the old one', async () => {
    seedBuildings();
    const first = fakeRenderer();
    wrapper = mountLayer(first);
    expect(first.frameObserver).toBeTypeOf('function');
    const second = fakeRenderer();
    await wrapper.setProps({ renderer: second });
    expect(first.frameObserver).toBeNull();
    expect(second.frameObserver).toBeTypeOf('function');
    wrapper.unmount();
    wrapper = undefined;
    expect(second.frameObserver).toBeNull();
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

  it('grows a hovered marker (markerScale) and brings it to the front, then lets it shrink back', async () => {
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
    expect(el().element.style.transform).toContain(`scale(${HOVERED_SMALLEST.toFixed(3)})`);
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
    expect(wrapper.get<HTMLElement>('[data-coord="1,0"]').element.style.transform).toContain(`scale(${HOVERED_SMALLEST.toFixed(3)})`);
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
    expect(wrapper.get<HTMLElement>('[data-coord="1,0"]').element.style.transform).toContain(`scale(${HOVERED_SMALLEST.toFixed(3)})`);
  });

  describe('hover and tap on the box', () => {
    // jsdom has no layout and no ResizeObserver: a stand-in that reports whatever size a test gives the observed box.
    const observeOptions: (ResizeObserverOptions | undefined)[] = [];
    let observers: { cb: ResizeObserverCallback; targets: Set<Element>; disconnected: boolean }[] = [];
    beforeEach(() => {
      observers = [];
      vi.stubGlobal(
        'ResizeObserver',
        class {
          readonly rec = { cb: undefined as unknown as ResizeObserverCallback, targets: new Set<Element>(), disconnected: false };
          constructor(cb: ResizeObserverCallback) {
            this.rec.cb = cb;
            observers.push(this.rec);
          }
          observe(el: Element, options?: ResizeObserverOptions) {
            observeOptions.push(options);
            this.rec.targets.add(el);
          }
          unobserve(el: Element) {
            this.rec.targets.delete(el);
          }
          disconnect() {
            this.rec.disconnected = true;
          }
        },
      );
    });

    /** Gives every observed box the unscaled size 100 x 40 and fires the observers. */
    function sizeBoxes() {
      for (const o of observers) {
        const entries = [...o.targets].map((target) => {
          Object.defineProperty(target, 'offsetWidth', { configurable: true, value: 100 });
          Object.defineProperty(target, 'offsetHeight', { configurable: true, value: 40 });
          return { target } as ResizeObserverEntry;
        });
        o.cb(entries, {} as ResizeObserver);
      }
    }
    async function mountAt(scale: number) {
      seedBuildings();
      const renderer = fakeRenderer({ dialMapScale: scale });
      wrapper = mountLayer(renderer);
      runFrame();
      await wrapper.vm.$nextTick();
      sizeBoxes();
      runFrame();
      return renderer;
    }
    function advance(frameCount = 5) {
      vi.useFakeTimers({ toFake: ['Date'] });
      for (let i = 0; i < frameCount; i++) {
        vi.advanceTimersByTime(60);
        runFrame();
      }
      vi.useRealTimers();
    }
    const scaleOf = () => wrapper!.get<HTMLElement>('[data-coord="1,0"]').element.style.transform;

    it('grows a marker 1.3x when the mouse is on the dial, even zoomed in', async () => {
      const renderer = await mountAt(1.5);
      expect(scaleOf()).toContain('scale(1.500)');
      renderer.mousePoint = { x: 180, y: 300 };
      advance();
      expect(scaleOf()).toContain('scale(1.950)');
    });

    it('hovers a marker by its box, which starts on the dial centre line', async () => {
      const renderer = await mountAt(1.5);
      expect(wrapper!.find('[data-coord="1,0"] .hud-marker__box').exists()).toBe(true);
      // The dial is at x 180, y 300; its disc is about 41 px. The box is 100 x 40 unscaled, i.e. 150 x 60 at 1.5: it spans
      // x 180..330, y 270..330. (225, 328) is on the box, off its disc and off the neighbour's dial.
      renderer.mousePoint = { x: 225, y: 328 };
      advance();
      expect(scaleOf()).toContain('scale(1.950)');
      // Beside the box (above it) nothing hovers.
      renderer.mousePoint = null;
      advance();
      expect(scaleOf()).toContain('scale(1.500)');
      renderer.mousePoint = { x: 300, y: 260 };
      advance();
      expect(scaleOf()).toContain('scale(1.500)');
    });

    it('a touch tap on a box reveals nothing: the hex under it belongs to the map', async () => {
      // One building, so no neighbour's dial lies over the point.
      const world = seedBuildings();
      world.hud.buildings = [{ q: 1, r: 0, type: 'longhouse', level: 1 }];
      const renderer = fakeRenderer({ dialMapScale: 1.5 });
      wrapper = mountLayer(renderer);
      runFrame();
      await wrapper.vm.$nextTick();
      sizeBoxes();
      runFrame();
      vi.useFakeTimers({ toFake: ['Date'] });
      const frames5 = () => {
        for (let i = 0; i < 5; i++) {
          vi.advanceTimersByTime(60);
          runFrame();
        }
      };
      // On the box (x 180..330, y 270..330), off the dial disc.
      renderer.tapObserver!({ x: 300, y: 320 });
      frames5();
      expect(scaleOf()).toContain('scale(1.500)');
      // On the dial it does.
      renderer.tapObserver!({ x: 181, y: 301 });
      frames5();
      vi.useRealTimers();
      expect(scaleOf()).toContain('scale(1.950)');
    });

    it('the marker the mouse is directly on wins over the hex under it, and ends up on top', async () => {
      const renderer = await mountAt(1.5);
      const scaleAt = (key: string) => wrapper!.get<HTMLElement>(`[data-coord="${key}"]`).element.style.transform;
      const z = (key: string) => Number(wrapper!.get<HTMLElement>(`[data-coord="${key}"]`).element.style.zIndex);
      // On the box of 1,0 (x 180..330, y 270..330) and off the dial discs of 1,0 and 2,0, while the hex under the mouse is 2,0's.
      renderer.mousePoint = { x: 225, y: 328 };
      renderer.hoveredHexKey = '2,0';
      advance();
      expect(scaleAt('1,0')).toContain('scale(1.950)');
      expect(scaleAt('2,0')).toContain('scale(1.500)');
      expect(z('1,0')).toBeGreaterThan(z('2,0'));
      // Without a direct hit the hex decides.
      renderer.mousePoint = { x: 225, y: 360 };
      advance();
      expect(scaleAt('1,0')).toContain('scale(1.500)');
      expect(scaleAt('2,0')).toContain('scale(1.950)');
    });

    it('of two direct hits the one stacked on top wins: the hovered one, else the right-most', async () => {
      const renderer = await mountAt(1.5);
      const scaleAt = (key: string) => wrapper!.get<HTMLElement>(`[data-coord="${key}"]`).element.style.transform;
      // On the boxes of both 1,0 and 2,0 (2,0's starts at x 260), off their dial discs: the right-most one.
      renderer.mousePoint = { x: 300, y: 285 };
      renderer.hoveredHexKey = '1,0';
      advance();
      expect(scaleAt('2,0')).toContain('scale(1.950)');
      expect(scaleAt('1,0')).toContain('scale(1.500)');
      // Still on both boxes: the one already hovered (2,0) stays on top.
      renderer.mousePoint = { x: 300, y: 300 };
      advance();
      expect(scaleAt('2,0')).toContain('scale(1.950)');
    });

    it('tells the map only when the mouse starts or stops hovering a marker, not for a tap', async () => {
      const renderer = await mountAt(1.5);
      const hovering = () => wrapper!.emitted('update:hovering') ?? [];
      expect(hovering()).toEqual([]);
      renderer.mousePoint = { x: 180, y: 300 };
      advance();
      advance();
      expect(hovering()).toEqual([[true]]);
      // From one marker to its neighbour: still hovering, nothing sent.
      renderer.mousePoint = { x: 260, y: 300 };
      advance();
      expect(hovering()).toEqual([[true]]);
      renderer.mousePoint = null;
      renderer.hoveredHexKey = null;
      advance();
      expect(hovering()).toEqual([[true], [false]]);
      // A touch tap reveals the marker but is no mouse hover.
      renderer.tapObserver!({ x: 181, y: 301 });
      advance();
      expect(hovering()).toEqual([[true], [false]]);
    });

    it('tells the map the hover is over when the hovered marker goes away with the last one', async () => {
      const renderer = await mountAt(1.5);
      const hovering = () => wrapper!.emitted('update:hovering') ?? [];
      renderer.mousePoint = { x: 180, y: 300 };
      advance();
      expect(hovering()).toEqual([[true]]);
      // Nothing left to place (every building gone, no construction dial): the tooltip must come back all the same.
      useWorldStore().hud.buildings = [];
      useWorldStore().hud.tick += 1;
      await wrapper!.vm.$nextTick();
      advance();
      expect(wrapper!.findAll('[data-coord]')).toHaveLength(0);
      expect(hovering()).toEqual([[true], [false]]);
    });

    it('observes the border box and takes its size from the entry, falling back to the layout size', async () => {
      const renderer = await mountAt(1.5);
      expect(observeOptions.length).toBeGreaterThan(0);
      expect(observeOptions.every((o) => o?.box === 'border-box')).toBe(true);
      // The entry's border-box size (60 x 20) replaces the 100 x 40 the layout reported: the box spans x 180..270 at 1.5.
      for (const o of observers) {
        o.cb(
          [...o.targets].map((target) => ({ target, borderBoxSize: [{ inlineSize: 60, blockSize: 20 }] }) as unknown as ResizeObserverEntry),
          {} as ResizeObserver,
        );
      }
      renderer.mousePoint = { x: 300, y: 300 };
      advance();
      // 300 is beyond the 90 px wide box of 1,0 (it is on 2,0's, which is hovered instead).
      expect(wrapper!.get<HTMLElement>('[data-coord="1,0"]').element.style.transform).toContain('scale(1.500)');
    });

    it('stops observing a box that goes away and disconnects on unmount', async () => {
      const renderer = await mountAt(1.5);
      expect(observers.length).toBe(1);
      const observedBox = wrapper!.get('[data-coord="1,0"] .hud-marker__box').element;
      expect(observers[0]!.targets.has(observedBox)).toBe(true);
      renderer.dialMapScale = 0.8;
      runFrame();
      await wrapper!.vm.$nextTick();
      expect(wrapper!.find('[data-coord="1,0"] .hud-marker__box').exists()).toBe(false);
      expect(observers[0]!.targets.has(observedBox)).toBe(false);
      wrapper!.unmount();
      wrapper = undefined;
      expect(observers[0]!.disconnected).toBe(true);
    });
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

  it('renders no switch of its own on desktop (the panel column has it)', () => {
    mobile.value = false;
    try {
      seedBuildings();
      wrapper = mountLayer(fakeRenderer());
      expect(wrapper.find('button.building-hud__toggle').exists()).toBe(false);
    } finally {
      mobile.value = true;
    }
  });

  it('hides every marker when the icon button is turned off, and the choice is remembered', async () => {
    seedBuildings();
    wrapper = mountLayer(fakeRenderer());
    const toggle = wrapper.get('button.building-hud__toggle');
    expect(toggle.attributes('aria-pressed')).toBe('true');
    expect(toggle.attributes('aria-label')).toBe('Building info (H)');
    await toggle.trigger('click');
    await flushPromises();
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
    await flushPromises();
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
    expect(wrapper.find('[data-coord="3,0"] path.hud-dial__arc').exists()).toBe(true);
  });
  it('ages the countdown each tick without rebuilding the markers that do not tick', async () => {
    const world = seedBuildings();
    vi.useFakeTimers({ toFake: ['Date'] });
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [
      {
        id: 'o1', q: 3, r: 0, building: 'barracks', kind: 'build', targetLevel: 3, state: 'building', slotCost: 1,
        completesAtGameTime: null, completesInSeconds: 125, totalSeconds: 250,
      },
    ];
    wrapper = mountLayer(fakeRenderer());
    runFrame();
    await wrapper.vm.$nextTick();
    const tower = wrapper.get('[data-coord="2,0"] .hud-marker__box').element;
    expect(wrapper.get('[data-coord="3,0"] text').text()).toBe('2:05');
    vi.advanceTimersByTime(5000);
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-coord="3,0"] text').text()).toBe('2:00');
    // The tower's box is the same element: nothing on it changed.
    expect(wrapper.get('[data-coord="2,0"] .hud-marker__box').element).toBe(tower);
    vi.useRealTimers();
  });

  describe('the dial draws every order state of a standing building', () => {
    const waiting = (q: number, over: Record<string, unknown> = {}) => ({
      id: `w${q}`, q, r: 0, building: 'barracks', kind: 'build' as const, targetLevel: 3, state: 'waiting' as const, slotCost: 1,
      completesAtGameTime: null, completesInSeconds: null, totalSeconds: 0, ...over,
    });
    /** The renderer hands in a new dial list, the layer's next frame picks it up. */
    async function setDials(renderer: ReturnType<typeof fakeRenderer>, dials: ConstructionDial[]) {
      renderer.constructionDialList = dials;
      runFrame();
      await wrapper!.vm.$nextTick();
    }

    it('shows #place on the plain track for a queued order', async () => {
      const world = seedBuildings();
      world.hud.queue = [waiting(3)];
      const renderer = fakeRenderer();
      wrapper = mountLayer(renderer);
      runFrame();
      await setDials(renderer, constructionDialsFromQueue(world.hud.queue, Date.now()));
      expect(wrapper.get('[data-coord="3,0"] text').text()).toBe('#1');
      expect(wrapper.find('[data-coord="3,0"] .hud-dial__arc').exists()).toBe(false);
      // The track is the white, dimmed one of a running dial.
      expect(wrapper.get('[data-coord="3,0"] polygon:nth-of-type(2)').attributes('stroke-opacity')).toBe('0.3');
    });

    it('shows the orbiting sweep and the dots for a pending order, still segments with reduced motion', async () => {
      const world = seedBuildings();
      world.hud.queue = [makePendingOrder('barracks', { q: 3, r: 0 }, 'build', 3)];
      const renderer = fakeRenderer();
      wrapper = mountLayer(renderer);
      runFrame();
      await setDials(renderer, constructionDialsFromQueue(world.hud.queue, Date.now()));
      const dial = () => wrapper!.get('[data-coord="3,0"]');
      expect(dial().findAll('.hud-dial__sweep')).toHaveLength(1);
      expect(dial().findAll('.hud-dial__dot')).toHaveLength(3);
      expect(dial().find('text').exists()).toBe(false);
    });

    it('plays the refusal (red burst with a cross) and is the plain dial again once it is over', async () => {
      const world = seedBuildings();
      const renderer = fakeRenderer();
      wrapper = mountLayer(renderer);
      runFrame();
      vi.useFakeTimers({ toFake: ['Date'] });
      await setDials(renderer, rejectDialAt([], { q: 3, r: 0 }, Date.now()));
      const dial = () => wrapper!.get('[data-coord="3,0"]');
      vi.advanceTimersByTime(500);
      runFrame();
      await wrapper.vm.$nextTick();
      expect(dial().find('.hud-dial__burst').exists()).toBe(true);
      expect(dial().find('.hud-dial__burst polygon[stroke="#ff4d3d"]').exists()).toBe(true);
      expect(dial().findAll('.hud-dial__burst polyline').length).toBeGreaterThan(0);
      expect(dial().find('text').exists()).toBe(false);
      // The renderer prunes the refused dial after DIAL_REJECT_MS; the next frame sees the list change.
      vi.advanceTimersByTime(DIAL_REJECT_MS);
      await setDials(renderer, []);
      expect(dial().find('.hud-dial__burst').exists()).toBe(false);
      expect(dial().get('text').text()).toBe('2');
      vi.useRealTimers();
      void world;
    });

    it('plays the finish (yellow flash, check mark) when a running order ends, then shows the new level', async () => {
      const world = seedBuildings();
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      const now = Date.now();
      world.hud.queueFetchedAt = now;
      world.hud.queue = [waiting(3, { state: 'building', completesInSeconds: 0.5, totalSeconds: 10 })];
      const renderer = fakeRenderer();
      wrapper = mountLayer(renderer);
      runFrame();
      await setDials(renderer, constructionDialsFromQueue(world.hud.queue, now));
      const dial = () => wrapper!.get('[data-coord="3,0"]');
      expect(dial().find('.hud-dial__burst').exists()).toBe(false);
      vi.advanceTimersByTime(800);
      runFrame();
      await wrapper.vm.$nextTick();
      expect(dial().find('.hud-dial__burst').exists()).toBe(true);
      expect(dial().find('.hud-dial__burst polygon[stroke="#ffd23f"]').exists()).toBe(true);
      // The order is gone from the queue, the building is one level up and the finished dial has been pruned.
      world.hud.queue = [];
      world.hud.buildings = world.hud.buildings.map((b) => (b.q === 3 ? { ...b, level: 3 } : b));
      vi.advanceTimersByTime(3000);
      await setDials(renderer, []);
      expect(dial().find('.hud-dial__burst').exists()).toBe(false);
      expect(dial().get('text').text()).toBe('3');
      vi.useRealTimers();
    });

    it('shows no colour and no number once the time is up, until the next poll brings the new level', async () => {
      const world = seedBuildings();
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      const now = Date.now();
      world.hud.queueFetchedAt = now;
      world.hud.queue = [waiting(3, { state: 'building', completesInSeconds: 0.5, totalSeconds: 10 })];
      const renderer = fakeRenderer();
      wrapper = mountLayer(renderer);
      runFrame();
      await setDials(renderer, constructionDialsFromQueue(world.hud.queue, now));
      const dial = () => wrapper!.get('[data-coord="3,0"]');
      expect(dial().get('text').text()).toBe('0:01');
      // The time is up: the finish animation plays, its frames carry no number.
      vi.advanceTimersByTime(800);
      world.hud.tick += 1;
      runFrame();
      await wrapper.vm.$nextTick();
      expect(dial().find('.hud-dial__burst').exists()).toBe(true);
      expect(dial().find('text').exists()).toBe(false);
      // The animation is over and the renderer pruned the dial, but no poll has come yet: the queue still holds the order.
      vi.advanceTimersByTime(3000);
      world.hud.tick += 1;
      await setDials(renderer, []);
      expect(dial().find('.hud-dial__burst').exists()).toBe(false);
      expect(dial().find('text').exists()).toBe(false);
      expect(dial().find('.hud-dial__arc').exists()).toBe(false);
      const track = dial().get('polygon:nth-of-type(2)');
      expect(track.attributes('stroke')).toBe('#fff');
      expect(Number(track.attributes('stroke-opacity'))).toBeLessThan(0.3);
      expect(dial().html()).not.toContain('#ffd23f');
      expect(dial().html()).not.toContain('#ffc55c');
      // The poll: the order is gone and the building is a level up.
      world.hud.queue = [];
      world.hud.buildings = world.hud.buildings.map((b) => (b.q === 3 ? { ...b, level: 3 } : b));
      world.hud.tick += 1;
      await wrapper.vm.$nextTick();
      expect(dial().get('text').text()).toBe('3');
      vi.useRealTimers();
    });

    it('draws a new build as a dial-only marker: no building marker, no box, just the dial with its countdown', async () => {
      const world = seedBuildings();
      const now = Date.now();
      world.hud.queueFetchedAt = now;
      world.hud.queue = [waiting(9, { state: 'building', completesInSeconds: 300, totalSeconds: 600 })];
      const renderer = fakeRenderer({ dialMapScale: 0.5 });
      wrapper = mountLayer(renderer);
      runFrame();
      await setDials(renderer, constructionDialsFromQueue(world.hud.queue, now));
      runFrame();
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-coord="9,0"]').exists()).toBe(false);
      const marker = wrapper.get<HTMLElement>('[data-dial-only="9,0"]');
      expect(marker.find('.hud-marker__box').exists()).toBe(false);
      expect(marker.find('.hud-dial__arc').exists()).toBe(true);
      expect(marker.element.style.transform).toBe('translate3d(820.0px, 300.0px, 0) scale(0.500)');
      // Far tier is the ring only; hovering it grows it (markerScale) and shows the countdown.
      expect(marker.find('text').exists()).toBe(false);
      renderer.hoveredHexKey = '9,0';
      vi.useFakeTimers({ toFake: ['Date'] });
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(60);
        runFrame();
      }
      vi.useRealTimers();
      await wrapper.vm.$nextTick();
      expect(marker.element.style.transform).toContain(`scale(${markerScale(0.5, 1).toFixed(3)})`);
      expect(marker.get('text').text()).toBe('5:00');
    });

    it('turns the countdown of a dial-only marker yellow in its last minute and shows #place for a queued one', async () => {
      const world = seedBuildings();
      const now = Date.now();
      world.hud.queueFetchedAt = now;
      world.hud.queue = [waiting(9, { state: 'building', completesInSeconds: 45, totalSeconds: 600 }), waiting(10)];
      const renderer = fakeRenderer();
      wrapper = mountLayer(renderer);
      runFrame();
      await setDials(renderer, constructionDialsFromQueue(world.hud.queue, now));
      runFrame();
      await wrapper.vm.$nextTick();
      expect(wrapper.get('[data-dial-only="9,0"] text').attributes('fill')).toBe('#ffd23f');
      expect(wrapper.get('[data-dial-only="10,0"] text').text()).toBe('#1');
      expect(wrapper.get('[data-dial-only="10,0"] text').attributes('fill')).toBe('#fff');
    });

    it('is not tied to the building info switch: dial-only markers show with it off and in a layer without building markers', async () => {
      const world = seedBuildings();
      const now = Date.now();
      world.hud.queueFetchedAt = now;
      world.hud.queue = [waiting(9, { state: 'building', completesInSeconds: 300, totalSeconds: 600 })];
      useHudPrefsStore().setBuildingInfo(false);
      const renderer = fakeRenderer();
      wrapper = mountLayer(renderer);
      runFrame();
      await setDials(renderer, constructionDialsFromQueue(world.hud.queue, now));
      runFrame();
      await wrapper.vm.$nextTick();
      expect(wrapper.findAll('[data-coord]')).toHaveLength(0);
      expect(wrapper.find('[data-dial-only="9,0"]').exists()).toBe(true);
      wrapper.unmount();

      useHudPrefsStore().setBuildingInfo(true);
      const landing = fakeRenderer();
      landing.constructionDialList = constructionDialsFromQueue(world.hud.queue, now);
      wrapper = mount(BuildingHudLayer, {
        props: { renderer: landing, buildingMarkers: false },
        attachTo: document.body,
        global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
      });
      mounted = landing;
      runFrame();
      await wrapper.vm.$nextTick();
      expect(wrapper.findAll('[data-coord]')).toHaveLength(0);
      expect(wrapper.find('[data-dial-only="9,0"]').exists()).toBe(true);
      expect(wrapper.find('.building-hud__toggle').exists()).toBe(false);
      keyDown('h');
      expect(landing.keyDrivesMap).not.toHaveBeenCalled();
      expect(useHudPrefsStore().buildingInfo).toBe(true);
    });

    it('lets a dial-only marker be revealed by a tap like any other marker', async () => {
      const world = seedBuildings();
      const now = Date.now();
      world.hud.queueFetchedAt = now;
      world.hud.queue = [waiting(9, { state: 'building', completesInSeconds: 300, totalSeconds: 600 })];
      const renderer = fakeRenderer({ dialMapScale: 0.5 });
      wrapper = mountLayer(renderer);
      runFrame();
      await setDials(renderer, constructionDialsFromQueue(world.hud.queue, now));
      runFrame();
      await wrapper.vm.$nextTick();
      vi.useFakeTimers({ toFake: ['Date'] });
      renderer.tapObserver!({ x: 821, y: 301 });
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(60);
        runFrame();
      }
      vi.useRealTimers();
      expect(wrapper.get<HTMLElement>('[data-dial-only="9,0"]').element.style.transform).toContain(`scale(${markerScale(0.5, 1).toFixed(3)})`);
    });
  });

  describe('motion and the hand-over of the upgrade dial', () => {
    let fake: FakeAnimate | undefined;
    afterEach(() => {
      fake?.restore();
      fake = undefined;
    });

    const upgradeOrder = (q: number, over: Record<string, unknown> = {}) => ({
      id: `o${q}`,
      q,
      r: 0,
      building: 'barracks',
      kind: 'build' as const,
      targetLevel: 3,
      state: 'building' as const,
      slotCost: 1,
      completesAtGameTime: null,
      completesInSeconds: 600,
      totalSeconds: 1200,
      ...over,
    });

    it('shows a dial on a hex with a marker on that marker, and on a hex without one as a dial-only marker', async () => {
      const world = seedBuildings();
      world.hud.queue = [upgradeOrder(3), upgradeOrder(2, { state: 'waiting' })];
      const renderer = fakeRenderer();
      wrapper = mountLayer(renderer);
      runFrame();
      const now = Date.now();
      renderer.constructionDialList = constructionDialsFromQueue([...world.hud.queue, upgradeOrder(9)], now);
      runFrame();
      await wrapper.vm.$nextTick();
      // Every marker's hex (walls have none): its own marker draws the dial; the new build on 9,0 is dial-only.
      expect(wrapper.findAll('[data-dial-only]').map((m) => m.attributes('data-dial-only'))).toEqual(['9,0']);
      // Switched off: every dial is a dial-only marker.
      useHudPrefsStore().setBuildingInfo(false);
      await flushPromises();
      expect(wrapper.findAll('[data-dial-only]').map((m) => m.attributes('data-dial-only')).sort()).toEqual(['2,0', '3,0', '9,0']);
    });

    it('keeps each dial-only marker until its building marker has drawn its own, and brings it back marker by marker on a hide', async () => {
      seedBuildings();
      fake = installFakeAnimate();
      vi.useFakeTimers();
      const renderer = fakeRenderer();
      wrapper = mountLayer(renderer);
      runFrame();
      const prefs = useHudPrefsStore();
      const now = Date.now();
      const dial = (q: number): ConstructionDial => ({ coord: { q, r: 0 }, startMs: now - 1000, endMs: now + 600_000, state: 'building', queuePosition: null });
      renderer.constructionDialList = [dial(1), dial(3)];
      runFrame();
      await vi.advanceTimersByTimeAsync(0);
      const dialOnlyAt = (key: string) => wrapper!.find(`[data-dial-only="${key}"]`).exists();
      expect(dialOnlyAt('1,0') || dialOnlyAt('3,0')).toBe(false);
      // Hide: the longhouse marker (q 1, the wave's origin) is gone first, the barracks (q 3, 160 px away) later.
      prefs.setBuildingInfo(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(dialOnlyAt('1,0') || dialOnlyAt('3,0')).toBe(false);
      await vi.advanceTimersByTimeAsync(100 + 300);
      expect(dialOnlyAt('1,0')).toBe(true);
      expect(dialOnlyAt('3,0')).toBe(false);
      await vi.advanceTimersByTimeAsync(400);
      expect(dialOnlyAt('3,0')).toBe(true);
      fake.finishAll();
      await vi.advanceTimersByTimeAsync(0);
      expect(wrapper.findAll('[data-coord]')).toHaveLength(0);
      // Show: every dial-only marker stays until its marker's dial starts to spin in (the wave delay).
      prefs.setBuildingInfo(true);
      await vi.advanceTimersByTimeAsync(0);
      // The longhouse marker (the wave's origin) starts at once; the barracks' dial 192 ms later.
      expect(dialOnlyAt('1,0')).toBe(false);
      expect(dialOnlyAt('3,0')).toBe(true);
      await vi.advanceTimersByTimeAsync(150);
      expect(dialOnlyAt('3,0')).toBe(true);
      await vi.advanceTimersByTimeAsync(50);
      expect(dialOnlyAt('3,0')).toBe(false);
      vi.useRealTimers();
    });

    it('keeps the same dial-only element on screen while building info is switched on, until its marker takes the dial over', async () => {
      seedBuildings();
      fake = installFakeAnimate();
      vi.useFakeTimers();
      const prefs = useHudPrefsStore();
      prefs.setBuildingInfo(false);
      const renderer = fakeRenderer();
      wrapper = mountLayer(renderer);
      const now = Date.now();
      renderer.constructionDialList = [{ coord: { q: 3, r: 0 }, startMs: now - 1000, endMs: now + 600_000, state: 'building', queuePosition: null }];
      runFrame();
      await vi.advanceTimersByTimeAsync(0);
      const before = wrapper.get('[data-dial-only="3,0"]').element;
      // Watch every change while the switch flips: the hex must never be without its dial-only element in between.
      const removed: Node[] = [];
      const observer = new MutationObserver((records) => records.forEach((r) => removed.push(...r.removedNodes)));
      observer.observe(wrapper.element, { childList: true, subtree: true });
      prefs.setBuildingInfo(true);
      await vi.advanceTimersByTimeAsync(0);
      observer.takeRecords().forEach((r) => removed.push(...r.removedNodes));
      observer.disconnect();
      expect(removed).not.toContain(before);
      expect(wrapper.get('[data-dial-only="3,0"]').element).toBe(before);
      fake.finishAll();
      vi.useRealTimers();
    });

    it('keeps the markers until the hide animation has ended', async () => {
      const world = seedBuildings();
      world.hud.queue = [upgradeOrder(3)];
      fake = installFakeAnimate();
      const renderer = fakeRenderer();
      wrapper = mountLayer(renderer);
      runFrame();
      useHudPrefsStore().setBuildingInfo(false);
      await flushPromises();
      expect(wrapper.findAll('.hud-marker')).toHaveLength(4);
      expect(fake.running().length).toBeGreaterThan(0);
      fake.finishAll();
      await flushPromises();
      expect(wrapper.findAll('.hud-marker')).toHaveLength(0);
    });

    it('turns around when switched back on mid-animation: the same markers, the running animations reversed', async () => {
      seedBuildings();
      fake = installFakeAnimate();
      wrapper = mountLayer(fakeRenderer());
      runFrame();
      const prefs = useHudPrefsStore();
      prefs.setBuildingInfo(false);
      await flushPromises();
      const dials = wrapper.findAll('.hud-marker__dial').map((d) => d.element);
      const started = fake.animations.length;
      prefs.setBuildingInfo(true);
      await flushPromises();
      expect(fake.animations).toHaveLength(started);
      expect(fake.animations.every((a) => a.reversed)).toBe(true);
      fake.finishAll();
      await flushPromises();
      expect(wrapper.findAll('.hud-marker__dial').map((d) => d.element)).toEqual(dials);
      expect(fake.animations.every((a) => a.playState === 'idle')).toBe(true);
    });

    it('delays each marker by its distance to the Longhouse marker', async () => {
      seedBuildings();
      fake = installFakeAnimate();
      wrapper = mountLayer(fakeRenderer());
      runFrame();
      useHudPrefsStore().setBuildingInfo(false);
      await flushPromises();
      // The Longhouse is at q 1 (x 180); the tower at q 2 is 80 px away, the barracks at q 3 is 160 px away.
      const spinDelay = (key: string) =>
        fake!.animations.find((a) => a.target === wrapper!.get(`[data-coord="${key}"] .hud-marker__dial`).element)!.timing.delay;
      expect(spinDelay('1,0')).toBe(100);
      expect(spinDelay('2,0')).toBe(100 + 96);
      expect(spinDelay('3,0')).toBe(100 + 192);
    });

    it('fades a marker out beneath an open ring menu and back when it closes', async () => {
      seedBuildings();
      const renderer = fakeRenderer();
      wrapper = mountLayer(renderer);
      runFrame();
      const el = () => wrapper!.get<HTMLElement>('[data-coord="3,0"]').element;
      // Reduced motion is off, the fade takes real frame time: the footprint covers the barracks' dial at x 340.
      renderer.markerOcclusionCircle = { x: 340, y: 300, r: 30 };
      vi.useFakeTimers({ toFake: ['Date'] });
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(60);
        runFrame();
      }
      expect(Number(el().style.opacity)).toBe(0);
      expect(el().classList.contains('hud-marker--occluded')).toBe(true);
      // Another marker outside the footprint is untouched.
      expect(wrapper.get<HTMLElement>('[data-coord="1,0"]').element.style.opacity).toBe('');
      renderer.markerOcclusionCircle = null;
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(60);
        runFrame();
      }
      vi.useRealTimers();
      expect(el().style.opacity).toBe('');
    });
  });
});
