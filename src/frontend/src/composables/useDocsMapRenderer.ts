import { onBeforeUnmount, ref, type Ref } from 'vue';
import type { HexMapRendererOptions } from '../lib/map/HexMapRenderer';
import { useHexMapRenderer } from './useHexMapRenderer';

/** How long the "ctrl + scroll to zoom" hint stays after a wheel. */
const WHEEL_HINT_MS = 1500;

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
 *
 * Also returns what DocsMapControls.vue shows: `zoomIn`/`zoomOut` (the +/- buttons) and `wheelHint`, true for a moment after a
 * plain wheel was left to the page, so the reader learns that ctrl + scroll zooms.
 */
export function useDocsMapRenderer(
  canvasRef: Ref<HTMLCanvasElement | null>,
  containerRef: Ref<HTMLElement | null>,
  options: DocsMapRendererOptions,
) {
  const wheelHint = ref(false);
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  const onWheelToPage = () => {
    wheelHint.value = true;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      wheelHint.value = false;
    }, WHEEL_HINT_MS);
  };
  onBeforeUnmount(() => clearTimeout(hintTimer));

  const mounted = useHexMapRenderer(canvasRef, containerRef, {
    playerId: 'docs',
    ...options,
    onWheelToPage,
    mode: 'settlement',
    confineCamera: true,
    allowPageScroll: true,
    hideSettlementBadge: true,
  });
  const zoomIn = () => mounted.renderer.value?.zoomStep(1);
  const zoomOut = () => mounted.renderer.value?.zoomStep(-1);
  return { ...mounted, zoomIn, zoomOut, wheelHint };
}
