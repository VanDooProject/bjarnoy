// @vitest-environment jsdom
//
// Checks the actual pixel plumbing against real vendored art data (not a
// fabricated clip): the base layer renders once and never changes, and the
// top layer's background-image cycles through the clip's real frame rects
// over time at the clip's own fps — a broken position/frame calculation
// would otherwise look fine in a screenshot of a single moment.
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import AnimatedBuildingSprite from './AnimatedBuildingSprite.vue';
import { buildingLayers } from '../lib/map/buildingArt';

describe('AnimatedBuildingSprite', () => {
  it('renders both layers for a static-only building (no clip)', () => {
    const layers = buildingLayers('sawmill', 1);
    const wrapper = mount(AnimatedBuildingSprite, { props: { layers } });
    const divs = wrapper.findAll('.layer');
    expect(divs.length).toBe(2);
    wrapper.unmount();
  });

  it('cycles the top layer through the clip frames at its fps, leaving the base alone', async () => {
    vi.useFakeTimers();
    const layers = buildingLayers('sawmillriver', 3);
    expect(layers.clip).toBeDefined();
    const wrapper = mount(AnimatedBuildingSprite, { props: { layers } });
    await nextTick();

    const baseStyle = wrapper.findAll('.layer')[0]!.attributes('style');
    const backgroundPositionOf = (style: string | undefined) => style?.match(/background-position: ([^;]+);/)?.[1];

    const positionsSeen = new Set<string | undefined>();
    for (let i = 0; i < layers.clip!.frameRects.length; i++) {
      positionsSeen.add(backgroundPositionOf(wrapper.findAll('.layer')[1]!.attributes('style')));
      vi.advanceTimersByTime(1000 / layers.clip!.fps);
      await nextTick();
    }

    // The clip has more than one distinct frame, so the top layer must have
    // actually moved through more than one background-position — a stuck
    // frame index would collapse this set to size 1.
    expect(positionsSeen.size).toBeGreaterThan(1);
    // The base layer's own style never depends on the animation position.
    expect(wrapper.findAll('.layer')[0]!.attributes('style')).toBe(baseStyle);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it('stops animating once unmounted (no dangling interval)', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const layers = buildingLayers('sawmillriver', 3);
    const wrapper = mount(AnimatedBuildingSprite, { props: { layers } });
    wrapper.unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
    vi.useRealTimers();
  });
});
