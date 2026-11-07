import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { introLoad } from '../intro/introLoad';
import { introSignal } from '../intro/introSignal';
import type { MapLoadState } from '../lib/map/HexMapRenderer';
import { useIntroTilesSignal } from './useIntroTilesSignal';

function setup() {
  const settled = ref(false);
  const error = ref<unknown>(null);
  const canvasShown = ref(true);
  const loadState = ref<MapLoadState | undefined>(undefined);
  const animLoad = ref<{ loaded: number; total: number } | null>(null);
  useIntroTilesSignal({ settled, error, canvasShown, loadState, animLoad });
  return { settled, error, canvasShown, loadState, animLoad };
}

describe('useIntroTilesSignal', () => {
  beforeEach(() => {
    introSignal.tilesLoaded = false;
    introLoad.terrain = null;
    introLoad.buildings = null;
    introLoad.animations = null;
  });

  it('waits for the load flow to settle', async () => {
    const s = setup();
    s.loadState.value = { phase: 'ready' };
    await nextTick();
    expect(introSignal.tilesLoaded).toBe(false);
    s.settled.value = true;
    await nextTick();
    expect(introSignal.tilesLoaded).toBe(true);
  });

  it('waits for the atlases while the canvas is shown', async () => {
    const s = setup();
    s.settled.value = true;
    s.loadState.value = { phase: 'buildings' };
    await nextTick();
    expect(introSignal.tilesLoaded).toBe(false);
    s.loadState.value = { phase: 'ready' };
    await nextTick();
    expect(introSignal.tilesLoaded).toBe(true);
  });

  it('signals when the load failed', async () => {
    const s = setup();
    s.settled.value = true;
    s.error.value = new Error('boom');
    await nextTick();
    expect(introSignal.tilesLoaded).toBe(true);
  });

  it('signals when no canvas will be shown', async () => {
    const s = setup();
    s.canvasShown.value = false;
    s.settled.value = true;
    await nextTick();
    expect(introSignal.tilesLoaded).toBe(true);
  });

  it('reports terrain and building page counts, completing each group when its phase ends', async () => {
    const s = setup();
    s.loadState.value = { phase: 'terrain', progress: 0.5, pages: { loaded: 1, total: 2 } };
    await nextTick();
    expect(introLoad.terrain).toEqual({ loaded: 1, total: 2 });
    expect(introLoad.buildings).toBeNull();

    s.loadState.value = { phase: 'buildings' };
    await nextTick();
    expect(introLoad.terrain).toEqual({ loaded: 2, total: 2 });

    s.loadState.value = { phase: 'buildings', progress: 1 / 3, pages: { loaded: 1, total: 3 } };
    await nextTick();
    expect(introLoad.buildings).toEqual({ loaded: 1, total: 3 });

    s.loadState.value = { phase: 'ready' };
    await nextTick();
    expect(introLoad.buildings).toEqual({ loaded: 3, total: 3 });
  });

  it('reports the animation page count', async () => {
    const s = setup();
    expect(introLoad.animations).toBeNull();
    s.animLoad.value = { loaded: 2, total: 5 };
    await nextTick();
    expect(introLoad.animations).toEqual({ loaded: 2, total: 5 });
  });
});
