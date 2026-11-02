import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { HexMapRendererOptions } from '../lib/map/HexMapRenderer';
import { StaticWorldModel } from '../lib/map/StaticWorldModel';

let passed: HexMapRendererOptions | undefined;
vi.mock('./useHexMapRenderer', () => ({
  useHexMapRenderer: (_canvas: unknown, _container: unknown, options: HexMapRendererOptions) => {
    passed = options;
    return {};
  },
}));

import { useDocsMapRenderer } from './useDocsMapRenderer';

describe('useDocsMapRenderer', () => {
  const world = new StaticWorldModel();

  it('hands every docs map a fitted camera the reader can drag and zoom, and leaves the page scroll to the article', () => {
    useDocsMapRenderer(ref(null), ref(null), { worldModel: world, previewCenter: { q: 1, r: 2 } });
    expect(passed).toMatchObject({
      mode: 'settlement',
      worldModel: world,
      playerId: 'docs',
      previewCenter: { q: 1, r: 2 },
      confineCamera: true,
      allowPageScroll: true,
      hideSettlementBadge: true,
    });
    expect(passed!.lockCamera).toBeFalsy();
  });

  it('keeps the map\'s own player and callbacks', () => {
    const onHoverChange = vi.fn();
    useDocsMapRenderer(ref(null), ref(null), { worldModel: world, previewCenter: { q: 0, r: 0 }, playerId: 'me', onHoverChange });
    expect(passed!.playerId).toBe('me');
    expect(passed!.onHoverChange).toBe(onHoverChange);
  });
});
