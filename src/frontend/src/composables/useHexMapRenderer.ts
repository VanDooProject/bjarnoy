import { onBeforeUnmount, onMounted, shallowRef, type Ref } from 'vue';
import { HexMapRenderer, type HexMapRendererOptions } from '../lib/map/HexMapRenderer';

/**
 * Mounts a HexMapRenderer on a <canvas> ref. Deliberately exposes almost
 * nothing reactive: the renderer owns its own render loop and pointer
 * handling, so Vue's job here is only lifecycle (mount/resize/unmount).
 */
export function useHexMapRenderer(
  canvasRef: Ref<HTMLCanvasElement | null>,
  containerRef: Ref<HTMLElement | null>,
  options: HexMapRendererOptions,
) {
  const renderer = shallowRef<HexMapRenderer | null>(null);
  let resizeObserver: ResizeObserver | null = null;

  onMounted(async () => {
    const canvas = canvasRef.value;
    const container = containerRef.value;
    if (!canvas || !container) return;
    const r = new HexMapRenderer(options);
    const { width, height } = container.getBoundingClientRect();
    await r.mount(canvas, Math.max(1, width), Math.max(1, height));
    renderer.value = r;
    // Real lifecycle signal for "the renderer is mounted and has drawn its
    // first frame" — e.g. e2e tests wait on this instead of a guessed
    // timeout, since there's otherwise nothing in the DOM to observe. Not a
    // test-only branch: it's an honest reflection of composable state that
    // any consumer (e.g. a CSS fade-in) could use.
    container.dataset.mapReady = 'true';

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width: w, height: h } = entry.contentRect;
      r.resize(Math.max(1, w), Math.max(1, h));
    });
    resizeObserver.observe(container);
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    renderer.value?.destroy();
    renderer.value = null;
    delete containerRef.value?.dataset.mapReady;
  });

  return { renderer };
}
