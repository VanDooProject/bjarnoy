// @vitest-environment jsdom
//
// Issue #158: each resource pill's fill track gains a dim segment for
// whatever of that stock is reserved for the waiting build queue —
// unspendable elsewhere even though it's still physically in stock. These
// tests drive `hud.resources`/`hud.storageCap`/`hud.reserved` the same way
// `stores/world.ts`'s poll loop does and assert the reserved segment only
// appears (and only ever sits within the filled portion) when there is
// actually something reserved.
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ResourceBar from './ResourceBar.vue';
import { useWorldStore } from '../../stores/world';
import { isHudDrawerOpen } from '../../composables/hudDrawerOpenState';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

function mountResourceBar() {
  return mount(ResourceBar, {
    global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
  });
}

function stubCompactMediaQuery(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

describe('ResourceBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows no reserved segment or hint when nothing is reserved', () => {
    const world = useWorldStore();
    world.hud.resources = { wood: 300, stone: 200, food: 150, iron: 50 };
    world.hud.storageCap = { wood: 1000, stone: 1000, food: 1000, iron: 1000 };
    world.hud.reserved = { wood: 0, stone: 0, food: 0, iron: 0 };

    const wrapper = mountResourceBar();

    expect(wrapper.find('.fill-reserved').exists()).toBe(false);
    expect(wrapper.find('.reserved-hint').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders a reserved segment and hint sized to the reserved amount, within the filled portion', () => {
    const world = useWorldStore();
    world.hud.resources = { wood: 400, stone: 0, food: 0, iron: 0 };
    world.hud.storageCap = { wood: 1000, stone: 1000, food: 1000, iron: 1000 };
    world.hud.reserved = { wood: 100, stone: 0, food: 0, iron: 0 };

    const wrapper = mountResourceBar();

    const hint = wrapper.get('.reserved-hint');
    expect(hint.text()).toBe('(100 reserved)');

    const segment = wrapper.get('.fill-reserved');
    const style = segment.attributes('style') ?? '';
    const left = Number(/left:\s*([\d.]+)%/.exec(style)?.[1]);
    const width = Number(/width:\s*([\d.]+)%/.exec(style)?.[1]);

    // 300/1000 available + 100/1000 reserved = the reserved slice runs from
    // 30% to 40% of the track (the trailing/highest-stock edge of the fill).
    expect(left).toBeCloseTo(30, 5);
    expect(width).toBeCloseTo(10, 5);
    expect(left + width).toBeLessThanOrEqual(40.001);
    wrapper.unmount();
  });

  it('clamps the reserved segment to never exceed the actual stock, even if reserved is reported larger', () => {
    const world = useWorldStore();
    world.hud.resources = { wood: 50, stone: 0, food: 0, iron: 0 };
    world.hud.storageCap = { wood: 1000, stone: 1000, food: 1000, iron: 1000 };
    // Defensive: reserved should never exceed stock in practice (the server
    // only ever reserves what it can afford), but the component must not
    // render a segment past the fill it belongs to if it ever does.
    world.hud.reserved = { wood: 999, stone: 0, food: 0, iron: 0 };

    const wrapper = mountResourceBar();

    const segment = wrapper.get('.fill-reserved');
    const style = segment.attributes('style') ?? '';
    const left = Number(/left:\s*([\d.]+)%/.exec(style)?.[1]);
    const width = Number(/width:\s*([\d.]+)%/.exec(style)?.[1]);

    expect(left).toBeCloseTo(0, 5);
    expect(width).toBeCloseTo(5, 5); // clamped to the 50/1000 stock actually on hand
    wrapper.unmount();
  });
});

describe('ResourceBar (compact / mobile)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    stubCompactMediaQuery(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    isHudDrawerOpen.value = false;
  });

  function setup() {
    const world = useWorldStore();
    world.hud.resources = { wood: 4965, stone: 2310, food: 6120, iron: 780 };
    world.hud.storageCap = { wood: 12000, stone: 8000, food: 10000, iron: 4000 };
    world.hud.rates = { wood: 60, stone: 45, food: 90, iron: 20 };
    world.hud.reserved = { wood: 0, stone: 0, food: 0, iron: 0 };
    return world;
  }

  it('renders one collapsed line per pill by default, showing stock', async () => {
    setup();
    const wrapper = mountResourceBar();
    await flushPromises();

    const pills = wrapper.findAll('.resource--compact');
    expect(pills.length).toBeGreaterThan(0);
    expect(pills[0].get('.value-compact').text()).toContain('4,965');
    expect(pills[0].find('.fill-track').exists()).toBe(true);
    wrapper.unmount();
  });

  it('tapping any pill cycles ALL pills together through stock -> rate -> max -> stock', async () => {
    setup();
    const wrapper = mountResourceBar();
    await flushPromises();
    const [wood, stone] = wrapper.findAll('.resource--compact');

    expect(wood.get('.value-compact').text()).toContain('4,965');
    expect(stone.get('.value-compact').text()).toContain('2,310');

    await wood.trigger('click');
    expect(wood.get('.value-compact').text()).toContain('+60/h');
    expect(stone.get('.value-compact').text()).toContain('+45/h'); // switched too, in sync

    await wood.trigger('click');
    expect(wood.get('.value-compact').text()).toContain('max 12,000');
    expect(stone.get('.value-compact').text()).toContain('max 8,000');

    // Tapping a *different* pill still advances the one shared stage.
    await stone.trigger('click');
    expect(wood.get('.value-compact').text()).toContain('4,965');
    expect(stone.get('.value-compact').text()).toContain('2,310');
    wrapper.unmount();
  });

  it('keeps the fill bar visible and identical across all three stages', async () => {
    setup();
    const wrapper = mountResourceBar();
    await flushPromises();
    const wood = wrapper.findAll('.resource--compact')[0];

    const widthAt = () => wood.get('.fill').attributes('style');
    const stockWidth = widthAt();

    await wood.trigger('click'); // rate
    expect(wood.find('.fill-track').exists()).toBe(true);
    expect(widthAt()).toBe(stockWidth);

    await wood.trigger('click'); // cap
    expect(wood.find('.fill-track').exists()).toBe(true);
    expect(widthAt()).toBe(stockWidth);
    wrapper.unmount();
  });

  it('only shows the reserved hint in the stock stage', async () => {
    const world = setup();
    world.hud.reserved.wood = 100;
    const wrapper = mountResourceBar();
    await flushPromises();
    const wood = wrapper.findAll('.resource--compact')[0];

    expect(wood.find('.reserved-hint').exists()).toBe(true);
    await wood.trigger('click');
    expect(wood.find('.reserved-hint').exists()).toBe(false);
    wrapper.unmount();
  });

  it('auto-reverts a peeked pill back to stock after 6s of no further tap', async () => {
    vi.useFakeTimers();
    setup();
    const wrapper = mountResourceBar();
    await flushPromises();
    const wood = wrapper.findAll('.resource--compact')[0];

    await wood.trigger('click');
    expect(wood.get('.value-compact').text()).toContain('+60/h');

    vi.advanceTimersByTime(6000);
    await wrapper.vm.$nextTick();
    expect(wood.get('.value-compact').text()).toContain('4,965');
    wrapper.unmount();
  });

  it('switches to the full desktop-style stacked layout while the drawer is open, instead of the single-line cycle', async () => {
    setup();
    isHudDrawerOpen.value = true;
    const wrapper = mountResourceBar();
    await flushPromises();

    // The expanded branch reuses the desktop markup wholesale.
    expect(wrapper.find('.resource--compact').exists()).toBe(false);
    const wood = wrapper.findAll('.resource')[0];
    expect(wood.get('.value').text()).toContain('4,965');
    expect(wood.get('.value').text()).toContain('12,000'); // cap suffix
    expect(wood.get('.rate').text()).toBe('+60/h');
    expect(wood.find('.fill-track').exists()).toBe(true);
    wrapper.unmount();
  });
});
