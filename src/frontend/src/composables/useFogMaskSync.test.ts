// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, markRaw, nextTick, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { HexMapRenderer } from '../lib/map/HexMapRenderer';
import type { FogCoverageLookup } from '../lib/map/fog/fogCoverage';
import { maskBounds } from '../lib/map/fog/fogMaskLayout';
import { useWorldStore } from '../stores/world';
import { useFogMaskSync } from './useFogMaskSync';

function setup() {
  setActivePinia(createPinia());
  const world = useWorldStore();
  const renderer = {
    setFogMask: vi.fn(),
    setFogCoverage: vi.fn(),
    setFogOverview: vi.fn(),
    clearFogOverview: vi.fn(),
  };
  const current = shallowRef<HexMapRenderer | null>(renderer as unknown as HexMapRenderer);
  effectScope().run(() => useFogMaskSync(() => current.value));
  return { world, renderer };
}

const bitmap = () => markRaw({ close: vi.fn() }) as unknown as ImageBitmap;
const coverage = (signature: string) => markRaw({ signature }) as unknown as FogCoverageLookup;

describe('useFogMaskSync', () => {
  it('pushes a coverage-only change without re-sending the window mask', async () => {
    const { world, renderer } = setup();
    world.fogMaskBitmap = bitmap();
    world.fogMaskBounds = maskBounds(0, 0, 64, 64);
    world.fogCoverage = coverage('a');
    await nextTick();
    expect(renderer.setFogMask).toHaveBeenCalledTimes(1);
    expect(renderer.setFogCoverage).toHaveBeenCalledTimes(1);

    // The overview arrived: the store rebuilt the coverage, the window texture is the same.
    world.fogCoverage = coverage('b');
    await nextTick();

    expect(renderer.setFogCoverage).toHaveBeenCalledTimes(2);
    expect(renderer.setFogMask).toHaveBeenCalledTimes(1);
  });

  it('sets the overview and clears it when the store drops it', async () => {
    const { world, renderer } = setup();
    world.fogOverviewBitmap = bitmap();
    world.fogOverviewBounds = maskBounds(0, 0, 128, 128);
    await nextTick();
    expect(renderer.setFogOverview).toHaveBeenCalledTimes(1);
    expect(renderer.clearFogOverview).not.toHaveBeenCalled();

    world.fogOverviewBitmap = null;
    world.fogOverviewBounds = null;
    await nextTick();

    expect(renderer.clearFogOverview).toHaveBeenCalledTimes(1);
  });
});
