import { onBeforeUnmount, onMounted, ref, shallowRef, type Ref } from 'vue';
import { HexMapRenderer, type HexMapRendererOptions } from '../lib/map/HexMapRenderer';

/**
 * Mounts a HexMapRenderer on a <canvas> ref. Deliberately exposes almost
 * nothing reactive: the renderer owns its own render loop and pointer
 * handling, so Vue's job here is only lifecycle (mount/resize/unmount).
 */
// HexMapRenderer.resize() only re-projects the *existing* camera onto a new
// viewport size (HexMapRenderer.ts's resize()/applyCameraTransform) — it
// never recomputes where the camera itself should be centred. That's the
// right call for a real window resize (panning/zoom state should survive
// it), but it means mount()'s own initial measurement has to be right the
// first time: if the container's layout hasn't settled yet (a cold,
// unbundled Vite dev server parsing modules can still be laying out the
// page a frame or two after Vue's onMounted fires), a too-small/zero
// getBoundingClientRect() bakes a wrong camera centre in permanently — a
// later ResizeObserver firing with the real size only ever corrects the
// *viewport*, not that stale centre. Previously masked by founding's own
// forgiving "nearest start position" match; once founding required the
// exact clicked hex (issue #96), a mis-centred preview camera made the
// biased-centre click point land on the wrong hex outright.
async function waitForRealSize(element: HTMLElement, maxFrames = 10): Promise<{ width: number; height: number }> {
  for (let frame = 0; frame < maxFrames; frame++) {
    const { width, height } = element.getBoundingClientRect();
    if (width > 1 && height > 1) return { width, height };
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  return element.getBoundingClientRect();
}

export function useHexMapRenderer(
  canvasRef: Ref<HTMLCanvasElement | null>,
  containerRef: Ref<HTMLElement | null>,
  options: HexMapRendererOptions,
) {
  const renderer = shallowRef<HexMapRenderer | null>(null);
  // `mount()` awaits the terrain atlas (see HexMapRenderer.mount's own
  // remarks), which on a slow connection can take a while with nothing on
  // screen to show for it — `ready` lets a consumer (SettlementCanvas) show
  // a loading overlay until the canvas actually has something drawn on it,
  // instead of leaving a blank island with no feedback.
  const ready = ref(false);
  const loadError = ref<unknown>(null);
  let resizeObserver: ResizeObserver | null = null;

  onMounted(async () => {
    const canvas = canvasRef.value;
    const container = containerRef.value;
    if (!canvas || !container) return;
    const r = new HexMapRenderer(options);
    const { width, height } = await waitForRealSize(container);
    try {
      await r.mount(canvas, Math.max(1, width), Math.max(1, height));
    } catch (err) {
      console.error('HexMapRenderer failed to mount', err);
      loadError.value = err;
      // Half-built (e.g. Pixi's own init resolved but the terrain atlas
      // threw) — destroy rather than leave a renderer nobody will ever call
      // destroy() on, since it never made it into `renderer.value`.
      r.destroy();
      return;
    }
    renderer.value = r;
    ready.value = true;
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

  return { renderer, ready, loadError };
}
