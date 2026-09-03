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
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ResourceBar from './ResourceBar.vue';
import { useWorldStore } from '../../stores/world';

describe('ResourceBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows no reserved segment or hint when nothing is reserved', () => {
    const world = useWorldStore();
    world.hud.resources = { wood: 300, stone: 200, food: 150, iron: 50 };
    world.hud.storageCap = { wood: 1000, stone: 1000, food: 1000, iron: 1000 };
    world.hud.reserved = { wood: 0, stone: 0, food: 0, iron: 0 };

    const wrapper = mount(ResourceBar);

    expect(wrapper.find('.fill-reserved').exists()).toBe(false);
    expect(wrapper.find('.reserved-hint').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders a reserved segment and hint sized to the reserved amount, within the filled portion', () => {
    const world = useWorldStore();
    world.hud.resources = { wood: 400, stone: 0, food: 0, iron: 0 };
    world.hud.storageCap = { wood: 1000, stone: 1000, food: 1000, iron: 1000 };
    world.hud.reserved = { wood: 100, stone: 0, food: 0, iron: 0 };

    const wrapper = mount(ResourceBar);

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

    const wrapper = mount(ResourceBar);

    const segment = wrapper.get('.fill-reserved');
    const style = segment.attributes('style') ?? '';
    const left = Number(/left:\s*([\d.]+)%/.exec(style)?.[1]);
    const width = Number(/width:\s*([\d.]+)%/.exec(style)?.[1]);

    expect(left).toBeCloseTo(0, 5);
    expect(width).toBeCloseTo(5, 5); // clamped to the 50/1000 stock actually on hand
    wrapper.unmount();
  });
});
