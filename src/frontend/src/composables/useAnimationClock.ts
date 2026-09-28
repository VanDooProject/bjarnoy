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
// Keeps ticking under `prefers-reduced-motion: reduce`, on purpose: these
// clips are the art's own ambient motion (smoke, lava, glowing runes), and
// the in-game map plays the very same clips regardless of that setting, so
// the docs showing them frozen made the art look broken rather than calm.
// Transitions a page adds on top (e.g. the island's blight cross-fade) still
// honour reduced motion on their own.
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

const DEFAULT_INTERVAL_MS = 1000 / 8;

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
    raf = requestAnimationFrame(tick);
  });
  onBeforeUnmount(() => {
    if (raf) cancelAnimationFrame(raf);
  });

  return now;
}
