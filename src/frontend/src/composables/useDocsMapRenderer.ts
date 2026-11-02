import type { Ref } from 'vue';
import type { HexMapRendererOptions } from '../lib/map/HexMapRenderer';
import { useHexMapRenderer } from './useHexMapRenderer';

/** What a docs map passes on top of the shared setup: the model it draws and the hex it is framed on (anything else a map needs, like a player or a hover callback, goes with them). */
export type DocsMapRendererOptions = Omit<HexMapRendererOptions, 'mode' | 'playerId' | 'confineCamera' | 'allowPageScroll' | 'hideSettlementBadge'> &
  Required<Pick<HexMapRendererOptions, 'worldModel' | 'previewCenter'>> &
  Partial<Pick<HexMapRendererOptions, 'playerId'>>;

/**
 * The renderer setup every inline map of the docs articles shares (the Wasted Lands island and Utgard example, the Bog Lands island,
 * the wall, land-movement and realm examples): a settlement-mode map fitted to the example on mount, which the reader can then drag
 * and zoom (`confineCamera`: never zoomed out past the fit, never panned off the island). It sits inline in a scrolling article, so
 * `allowPageScroll` lets a plain wheel or one-finger vertical drag scroll the page until the reader presses on the map; a
 * ctrl-wheel or trackpad/two-finger pinch zooms. The host canvas pairs this with `touch-action: pan-y` and `cursor: grab`.
 */
export function useDocsMapRenderer(
  canvasRef: Ref<HTMLCanvasElement | null>,
  containerRef: Ref<HTMLElement | null>,
  options: DocsMapRendererOptions,
) {
  return useHexMapRenderer(canvasRef, containerRef, {
    playerId: 'docs',
    ...options,
    mode: 'settlement',
    confineCamera: true,
    allowPageScroll: true,
    hideSettlementBadge: true,
  });
}
