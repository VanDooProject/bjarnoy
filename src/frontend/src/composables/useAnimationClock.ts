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
// every caller) under `prefers-reduced-motion: reduce` or Save-Data, and now
// also when `animationPreference.setting` is explicitly 'off' — same
// contract either way, enforced here once rather than by every caller
// remembering to special-case it. An explicit 'on' overrides both
// environment checks (matching `animationPreference`'s own resolution rule:
// a per-device override the user picked on purpose wins). 'auto' behaves as
// on here except for those two checks — these docs/design clocks have no
// concept of the settlement map's fps governor (`AnimationGovernor`; that
// only gates the map's own `buildings-anim` atlas load), so 'auto' never
// measures anything here, it simply isn't forced off by it.
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { animationPreference } from '../lib/perf/animationPreference';

const DEFAULT_INTERVAL_MS = 1000 / 8;

// Checked live at mount time, deliberately not read off
// `animationPreference`'s own (matchMedia-`change`-event-driven, cached)
// `reducedMotion`/`saveData` — those exist for the map's fps governor
// resolution, which is fine to only react to an actual live preference
// change; this clock only ever checks once, on mount, same as before this
// setting existed, so a plain live query here keeps that behaviour exact.
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function saveDataEnabled(): boolean {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: { saveData?: boolean } });
  return nav?.connection?.saveData === true;
}

function clockShouldRun(): boolean {
  if (animationPreference.setting === 'off') return false;
  if (animationPreference.setting === 'on') return true;
  return !prefersReducedMotion() && !saveDataEnabled();
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

  function startClock(): void {
    if (raf || !clockShouldRun()) return;
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
    () => animationPreference.setting,
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
