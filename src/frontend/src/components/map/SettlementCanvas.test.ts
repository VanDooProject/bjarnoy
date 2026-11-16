// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { mount } from '@vue/test-utils';

// The renderer and its composable are not under test (Pixi needs a GPU context): what matters here is what SettlementCanvas hands the
// renderer as options, so the composable is replaced by a capture of them.
let capturedOptions: Record<string, unknown> = {};
vi.mock('../../composables/useHexMapRenderer', () => ({
  useHexMapRenderer: (_canvas: unknown, _container: unknown, options: Record<string, unknown>) => {
    capturedOptions = options;
    return { renderer: ref(null), loadState: ref(null), animLoad: ref(null), mountError: ref(null), retry: vi.fn() };
  },
}));

import SettlementCanvas from './SettlementCanvas.vue';

function mountCanvas(props: Record<string, unknown> = {}) {
  return mount(SettlementCanvas, {
    props: { worldModel: {} as never, playerId: 'p', settlementId: 's', ...props },
    global: { stubs: { MapLoadingIndicator: true, MapStatusOverlay: true } },
  });
}

describe('SettlementCanvas army tap', () => {
  it('emits army-tap for a marker tap', () => {
    const wrapper = mountCanvas();
    (capturedOptions.onArmyTap as (id: string, screen: { x: number; y: number }) => void)('a1', { x: 3, y: 4 });
    expect(wrapper.emitted('army-tap')).toEqual([['a1', { x: 3, y: 4 }]]);
  });

  it('hands the renderer the host answer on whether the tap stops at the marker (an emit could not carry it)', () => {
    const armyTapStops = vi.fn((id: string) => id === 'moving');
    mountCanvas({ armyTapStops });
    const stops = capturedOptions.armyTapStopsAtMarker as (id: string) => boolean;
    expect(stops('moving')).toBe(true);
    expect(stops('standing')).toBe(false);
    expect(armyTapStops).toHaveBeenCalledWith('moving');
  });

  it('lets the tap reach the tile when the host gives no answer', () => {
    mountCanvas();
    expect((capturedOptions.armyTapStopsAtMarker as (id: string) => boolean)('a1')).toBe(false);
  });
});
