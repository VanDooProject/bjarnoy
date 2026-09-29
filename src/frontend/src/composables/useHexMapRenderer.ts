import { onBeforeUnmount, onMounted, shallowRef, watch, type Ref } from 'vue';
import { HexMapRenderer, READY_LOAD_STATE, type HexMapRendererOptions, type MapLoadState } from '../lib/map/HexMapRenderer';
import { animationPreference } from '../lib/perf/animationPreference';

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
  // `MapLoadingIndicator.vue`'s data source — 'ready' (no loader) until a
  // 'settlement'-mode mount says otherwise, since a 'world'-mode mount never
  // narrates a loading state at all (see HexMapRenderer's `startTextureLoad`).
  const loadState = shallowRef<MapLoadState>(options.mode === 'settlement' ? { phase: 'terrain' } : READY_LOAD_STATE);
  // Set when building/mounting the renderer throws (most commonly the
  // terrain atlas failing to load) — SettlementCanvas shows it through
  // MapStatusOverlay, whose Retry calls `retry()`. Without this the failure
  // was an unhandled rejection and the map just stayed on 'terrain' forever.
  const mountError = shallowRef<unknown>(null);
  let resizeObserver: ResizeObserver | null = null;
  let stopAnimationWatch: (() => void) | null = null;
  // Bumped on every (re)mount attempt and on unmount, so a mount that
  // resolves after being superseded (retry, or the component going away)
  // tears itself down instead of wiring up a second renderer.
  let attempt = 0;

  function teardown(r: HexMapRenderer | null) {
    resizeObserver?.disconnect();
    resizeObserver = null;
    stopAnimationWatch?.();
    stopAnimationWatch = null;
    r?.destroy();
    renderer.value = null;
    delete containerRef.value?.dataset.mapReady;
  }

  async function mountRenderer() {
    const canvas = canvasRef.value;
    const container = containerRef.value;
    if (!canvas || !container) return;
    const mine = ++attempt;
    mountError.value = null;
    const r = new HexMapRenderer({
      ...options,
      onLoadState: (state) => {
        loadState.value = state;
        options.onLoadState?.(state);
      },
    });
    try {
      const { width, height } = await waitForRealSize(container);
      await r.mount(canvas, Math.max(1, width), Math.max(1, height));
    } catch (err) {
      r.destroy();
      if (mine !== attempt) return;
      console.error('useHexMapRenderer: mounting the map renderer failed', err);
      mountError.value = err;
      return;
    }
    if (mine !== attempt) {
      r.destroy();
      return;
    }
    renderer.value = r;
    // `immediate: true` applies whatever animationPreference already
    // resolved to (most commonly 'measuring'/off, on a fresh mount) right
    // away, rather than leaving the renderer's own `animationsEnabled`
    // default until the preference happens to change for some other reason.
    stopAnimationWatch = watch(() => animationPreference.effective, (enabled) => r.setAnimationsEnabled(enabled), {
      immediate: true,
    });
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
  }

  /** Destroys any half-built renderer and runs the mount sequence again. */
  async function retry() {
    teardown(renderer.value);
    loadState.value = options.mode === 'settlement' ? { phase: 'terrain' } : READY_LOAD_STATE;
    await mountRenderer();
  }

  onMounted(mountRenderer);

  onBeforeUnmount(() => {
    attempt++;
    teardown(renderer.value);
  });

  return { renderer, loadState, mountError, retry };
}
