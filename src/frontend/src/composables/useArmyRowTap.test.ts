// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useArmyRowTap } from './useArmyRowTap';
import { useWorldStore } from '../stores/world';
import { DOUBLE_TAP_MS, DOUBLE_TAP_SLOP_PX } from '../lib/map/doubleTap';

function click(x = 10, y = 10, timeStamp = 0): MouseEvent {
  return { clientX: x, clientY: y, timeStamp } as MouseEvent;
}

function setup() {
  const onDoubleTap = vi.fn();
  let tap!: ReturnType<typeof useArmyRowTap>;
  const wrapper = mount(defineComponent({
    setup() {
      tap = useArmyRowTap(onDoubleTap);
      return () => h('div');
    },
  }));
  return { tap, onDoubleTap, wrapper };
}

describe('useArmyRowTap', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('selects an unselected row at once', () => {
    const world = useWorldStore();
    const { tap } = setup();
    tap('a', click());
    expect(world.selectedArmyId).toBe('a');
  });

  it('a single tap on the selected row deselects only after DOUBLE_TAP_MS', () => {
    const world = useWorldStore();
    world.selectArmy('a');
    const { tap, onDoubleTap } = setup();
    tap('a', click());
    expect(world.selectedArmyId).toBe('a');
    vi.advanceTimersByTime(DOUBLE_TAP_MS - 1);
    expect(world.selectedArmyId).toBe('a');
    vi.advanceTimersByTime(1);
    expect(world.selectedArmyId).toBeNull();
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('a double tap on the selected row never clears the selection and fires once', () => {
    const world = useWorldStore();
    world.selectArmy('a');
    const clear = vi.spyOn(world, 'clearSelectedArmy');
    const { tap, onDoubleTap } = setup();
    tap('a', click(10, 10, 0));
    tap('a', click(12, 10, 100));
    vi.runAllTimers();
    expect(clear).not.toHaveBeenCalled();
    expect(world.selectedArmyId).toBe('a');
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    expect(onDoubleTap).toHaveBeenCalledWith('a');
  });

  it('a double tap on an unselected row selects it and fires once', () => {
    const world = useWorldStore();
    const { tap, onDoubleTap } = setup();
    tap('a', click(10, 10, 0));
    tap('a', click(10, 10, 100));
    expect(world.selectedArmyId).toBe('a');
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
  });

  it('taps further apart than the slop do not pair', () => {
    const world = useWorldStore();
    world.selectArmy('a');
    const { tap, onDoubleTap } = setup();
    tap('a', click(0, 0, 0));
    tap('a', click(DOUBLE_TAP_SLOP_PX + 1, 0, 100));
    expect(onDoubleTap).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(world.selectedArmyId).toBeNull();
  });

  it('taps slower than DOUBLE_TAP_MS do not pair', () => {
    const { tap, onDoubleTap } = setup();
    tap('a', click(10, 10, 0));
    tap('a', click(10, 10, DOUBLE_TAP_MS + 1));
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('taps on different rows do not pair and the new row replaces the pending deselect', () => {
    const world = useWorldStore();
    world.selectArmy('a');
    const { tap, onDoubleTap } = setup();
    tap('a', click(10, 10, 0));
    tap('b', click(10, 10, 50));
    vi.runAllTimers();
    expect(onDoubleTap).not.toHaveBeenCalled();
    expect(world.selectedArmyId).toBe('b');
  });

  it('unmounting cancels the pending deselect', () => {
    const world = useWorldStore();
    world.selectArmy('a');
    const { tap, wrapper } = setup();
    tap('a', click());
    wrapper.unmount();
    vi.runAllTimers();
    expect(world.selectedArmyId).toBe('a');
  });
});
