// A shared elapsed-ms clock for driving `buildings-anim` clip playback
// (see `clipPlayback.ts`'s `clipFrameIndex`) in a component that lays out
// several animated sprites of its own — one clock per component, not one
// `setInterval` per sprite (`WastedIsland.vue`'s giant top parts,
// `AnimatedGiant.vue`'s whole composite).
//
// Ticks via `requestAnimationFrame`, throttled to roughly `intervalMs` so a
// component holding many clips doesn't recompute every clip's frame index on
// every display frame — the fastest clip currently vendored is 4fps, so the
// default keeps a comfortable margin above that without being wasteful.
// Started on mount, stopped on unmount.
//
// Does nothing under `prefers-reduced-motion: reduce`: `now` stays frozen at
// 0, so `clipFrameIndex` always resolves frame 0 for every caller — the
// reduced-motion contract is "no motion", enforced here once rather than by
// every caller remembering to special-case it.
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

const DEFAULT_INTERVAL_MS = 1000 / 8;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

export function useAnimationClock(intervalMs = DEFAULT_INTERVAL_MS): Ref<number> {
  const now = ref(0);
  let raf = 0;
  let start = 0;
  let lastTickAt = 0;

  function tick(t: number): void {
    raf = requestAnimationFrame(tick);
    if (!start) start = t;
    if (t - lastTickAt < intervalMs) return;
    lastTickAt = t;
    now.value = t - start;
  }

  onMounted(() => {
    if (prefersReducedMotion()) return;
    raf = requestAnimationFrame(tick);
  });
  onBeforeUnmount(() => {
    if (raf) cancelAnimationFrame(raf);
  });

  return now;
}
