// Two layers, combined:
// 1. A debug/UX-research override: lets whoever's testing flip the mobile
//    HUD bar between the top and bottom edge via ?hudPosition=top|bottom.
//    Mirrors useFogDebug.ts's sessionStorage pattern so the choice survives
//    in-app navigation (HudNav's router.push() calls drop query strings)
//    without persisting across browser sessions. Stays a per-call ref, not
//    a module singleton, so each mounted instance re-reads sessionStorage
//    fresh (load-bearing for test isolation in useHudPosition.test.ts).
// 2. A real, persistent user preference (useHudPositionPreference), backed
//    by localStorage and shared across the app so a settings-toggle change
//    is reflected live everywhere. The debug override wins when present.
import { computed, ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

export type HudPosition = 'top' | 'bottom';

const STORAGE_KEY = 'fjordhold:hudPosition';
const PREF_STORAGE_KEY = 'fjordhold:hudPositionPref';
const DEFAULT_POSITION: HudPosition = 'top';

function isHudPosition(value: unknown): value is HudPosition {
  return value === 'top' || value === 'bottom';
}

function readPreference(): HudPosition {
  const stored = localStorage.getItem(PREF_STORAGE_KEY);
  return isHudPosition(stored) ? stored : DEFAULT_POSITION;
}

const preference = ref<HudPosition>(readPreference());

export function useHudPositionPreference() {
  function setPreference(next: HudPosition): void {
    localStorage.setItem(PREF_STORAGE_KEY, next);
    preference.value = next;
  }

  return { preference, setPreference };
}

export function useHudPosition() {
  const route = useRoute();
  const stored = sessionStorage.getItem(STORAGE_KEY);
  const override = ref<HudPosition | null>(isHudPosition(stored) ? stored : null);

  // Same rationale as useFogDebug: Vue Router reuses the component instance
  // on a query-only navigation, so this has to stay a live watch rather than
  // a one-shot read at setup() time.
  watchEffect(() => {
    const requested = route.query.hudPosition;
    if (isHudPosition(requested)) {
      sessionStorage.setItem(STORAGE_KEY, requested);
      override.value = requested;
    }
  });

  return computed(() => override.value ?? preference.value);
}
