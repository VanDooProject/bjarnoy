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

  // sawmillriver level 3's real vendored clip is an "overlay" one (3D_assets
  // PR #92: its frames carry only the water wheel, everything else
  // transparent) — its own doc comment on TileAnimClip/AtlasClip.overlay
  // covers why this needs a `rest` layer at all, not just a frame layer.
  it('renders base + rest + frame layers for an overlay clip, cycling only the frame layer', async () => {
    vi.useFakeTimers();
    const layers = buildingLayers('sawmillriver', 3);
    expect(layers.clip).toBeDefined();
    expect(layers.clip!.restRect).toBeDefined();
    const wrapper = mount(AnimatedBuildingSprite, { props: { layers } });
    await nextTick();

    const divs = () => wrapper.findAll('.layer');
    expect(divs().length).toBe(3);
    const baseStyle = divs()[0]!.attributes('style');
    const restStyle = divs()[1]!.attributes('style');
    const backgroundPositionOf = (style: string | undefined) => style?.match(/background-position: ([^;]+);/)?.[1];

    const positionsSeen = new Set<string | undefined>();
    for (let i = 0; i < layers.clip!.frameRects.length; i++) {
      positionsSeen.add(backgroundPositionOf(divs()[2]!.attributes('style')));
      vi.advanceTimersByTime(1000 / layers.clip!.fps);
      await nextTick();
    }

    // The clip has more than one distinct frame, so the frame layer must
    // have actually moved through more than one background-position — a
    // stuck frame index would collapse this set to size 1.
    expect(positionsSeen.size).toBeGreaterThan(1);
    // Neither the base layer nor the rest layer ever depends on the
    // animation position — only the frame layer (parts-only) cycles.
    expect(divs()[0]!.attributes('style')).toBe(baseStyle);
    expect(divs()[1]!.attributes('style')).toBe(restStyle);

    wrapper.unmount();
    vi.useRealTimers();
  });

  it('renders exactly base + frame layers (no rest layer) for a legacy, non-overlay clip', async () => {
    vi.useFakeTimers();
    // Builds a synthetic legacy clip from real, resolved frame rects (no
    // restRect) — the currently vendored atlas has moved every clip to the
    // new overlay convention (see AtlasClip.overlay's own doc comment), so a
    // non-overlay clip has to be fabricated here to prove old atlases still
    // render exactly as before.
    const real = buildingLayers('sawmillriver', 3);
    expect(real.clip!.frameRects.length).toBeGreaterThan(1);
    const layers = {
      base: real.base,
      top: real.top,
      clip: { ...real.clip!, restRect: undefined },
    };
    const wrapper = mount(AnimatedBuildingSprite, { props: { layers } });
    await nextTick();

    const divs = () => wrapper.findAll('.layer');
    expect(divs().length).toBe(2);
    const baseStyle = divs()[0]!.attributes('style');

    const positionsSeen = new Set<string | undefined>();
    const backgroundPositionOf = (style: string | undefined) => style?.match(/background-position: ([^;]+);/)?.[1];
    for (let i = 0; i < layers.clip.frameRects.length; i++) {
      positionsSeen.add(backgroundPositionOf(divs()[1]!.attributes('style')));
      vi.advanceTimersByTime(1000 / layers.clip.fps);
      await nextTick();
    }

    expect(positionsSeen.size).toBeGreaterThan(1);
    expect(divs()[0]!.attributes('style')).toBe(baseStyle);

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
