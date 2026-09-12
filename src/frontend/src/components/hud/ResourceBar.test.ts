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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ResourceBar from './ResourceBar.vue';
import { useWorldStore } from '../../stores/world';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';

function mountResourceBar() {
  return mount(ResourceBar, {
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
}

// jsdom's matchMedia always reports no match — realistic enough for the
// narrow/tap-cycle default these existing tests rely on, but the
// wide-viewport tests below need to force a match to exercise that branch.
function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe('ResourceBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    // @ts-expect-error -- restoring jsdom's own stub, not a real browser API
    delete window.matchMedia;
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

  it('starts each pill on the current-stock stage and cycles independently on tap', async () => {
    mockMatchMedia(false);
    const world = useWorldStore();
    world.hud.resources = { wood: 400, stone: 300, food: 0, iron: 0 };
    world.hud.rates = { wood: 60, stone: 45, food: 0, iron: 0 };
    world.hud.storageCap = { wood: 1000, stone: 1000, food: 1000, iron: 1000 };

    const wrapper = mountResourceBar();
    const toggles = wrapper.findAll('.stage-toggle');

    // "current" stage: the value is the headline, with the rate as a small
    // second line underneath (no uppercase stage caption — see mockup).
    expect(toggles[0].get('.value').text()).toBe('400');
    expect(toggles[0].get('.rate-sub').text()).toBe('+60/h');
    expect(toggles[0].attributes('aria-label')).toContain('Current');
    expect(toggles[1].attributes('aria-label')).toContain('Current');

    await toggles[0].trigger('click');

    // "rate" stage: value and delta collapse onto one line, and the icon
    // swaps from the resource-colored hex to a plain triangle.
    expect(toggles[0].attributes('aria-label')).toContain('Rate');
    expect(toggles[0].get('.value').text()).toBe('400+60/h');
    expect(wrapper.findAll('.resource')[0].get('.hex-icon').classes()).toContain('hex-icon--rate');
    // The other pill's stage is untouched by the first one's tap.
    expect(toggles[1].attributes('aria-label')).toContain('Current');

    await toggles[0].trigger('click');
    expect(toggles[0].attributes('aria-label')).toContain('Max');
    expect(toggles[0].get('.value').text()).toBe('Max 1,000');
    expect(wrapper.findAll('.resource')[0].get('.hex-icon').classes()).not.toContain('hex-icon--rate');

    await toggles[0].trigger('click');
    expect(toggles[0].attributes('aria-label')).toContain('Current');
    wrapper.unmount();
  });

  it('always shows the fill bar underneath, regardless of which stage is active', async () => {
    mockMatchMedia(false);
    const world = useWorldStore();
    world.hud.resources = { wood: 400, stone: 0, food: 0, iron: 0 };
    world.hud.storageCap = { wood: 1000, stone: 0, food: 0, iron: 0 };

    const wrapper = mountResourceBar();
    const toggle = wrapper.findAll('.stage-toggle')[0];

    for (let i = 0; i < 3; i++) {
      expect(wrapper.findAll('.fill-track')[0].exists()).toBe(true);
      await toggle.trigger('click');
    }
    wrapper.unmount();
  });

  it('shows current, rate, and max together without tap-cycling on a wide viewport', () => {
    mockMatchMedia(true);
    const world = useWorldStore();
    world.hud.resources = { wood: 400, stone: 0, food: 0, iron: 0 };
    world.hud.rates = { wood: 60, stone: 0, food: 0, iron: 0 };
    world.hud.storageCap = { wood: 1000, stone: 0, food: 0, iron: 0 };

    const wrapper = mountResourceBar();

    expect(wrapper.find('.stage-toggle').exists()).toBe(false);
    const firstPill = wrapper.findAll('.resource')[0];
    expect(firstPill.get('.value').text()).toBe('400');
    expect(firstPill.get('.rate').text()).toBe('+60/h');
    expect(firstPill.get('.cap').text()).toBe('Max 1,000');
    wrapper.unmount();
  });
});
