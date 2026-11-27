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
// Frozen (now stays at 0, so `clipFrameIndex` always resolves frame 0 for
// every caller) whenever `animationPreference.clipsEnabled` is false: the
// player's building-animation setting resolved against the device's
// reduce-motion and Save-Data flags (an explicit 'on'/'off' wins, 'auto'
// follows the device). Enforced here once rather than by every caller.
// Reacts live: a settings change, or the device flag flipping while 'auto',
// starts or stops the clock right away.
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { animationPreference } from '../lib/perf/animationPreference';

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

  function startClock(): void {
    if (raf || !animationPreference.clipsEnabled) return;
    start = 0;
    lastTickAt = 0;
    raf = requestAnimationFrame(tick);
  }

  function stopClock(): void {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  onMounted(startClock);
  // The setting can change while a page is open - the docs pages' "Play animations" button
  // (AnimationPausedNote.vue) is how a visitor without an account turns them on - so a change
  // starts or stops the clock right away rather than on the next mount. A stop leaves `now` where it
  // was, so the frame on screen holds.
  const stopWatch = watch(
    () => animationPreference.clipsEnabled,
    () => {
      stopClock();
      startClock();
    },
  );
  onBeforeUnmount(() => {
    stopWatch();
    stopClock();
  });

  return now;
}
