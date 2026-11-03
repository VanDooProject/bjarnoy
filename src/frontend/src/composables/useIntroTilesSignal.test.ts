import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { introSignal } from '../intro/introSignal';
import type { MapLoadState } from '../lib/map/HexMapRenderer';
import { useIntroTilesSignal } from './useIntroTilesSignal';

function setup() {
  const settled = ref(false);
  const error = ref<unknown>(null);
  const canvasShown = ref(true);
  const loadState = ref<MapLoadState | undefined>(undefined);
  useIntroTilesSignal({ settled, error, canvasShown, loadState });
  return { settled, error, canvasShown, loadState };
}

describe('useIntroTilesSignal', () => {
  beforeEach(() => {
    introSignal.tilesLoaded = false;
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
});
