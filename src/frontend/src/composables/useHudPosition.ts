// Debug/UX-research aid: lets whoever's testing flip the mobile HUD bar
// between the top and bottom edge of the screen via ?hudPosition=top|bottom,
// without any user-facing settings UI (not a real preference yet — see
// CLAUDE.md task notes). Mirrors useFogDebug.ts's sessionStorage pattern so
// the choice survives in-app navigation (HudNav's router.push() calls drop
// query strings) without persisting across browser sessions.
import { ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

export type HudPosition = 'top' | 'bottom';

const STORAGE_KEY = 'fjordhold:hudPosition';
const DEFAULT_POSITION: HudPosition = 'top';

function isHudPosition(value: unknown): value is HudPosition {
  return value === 'top' || value === 'bottom';
}

export function useHudPosition() {
  const route = useRoute();
  const stored = sessionStorage.getItem(STORAGE_KEY);
  const position = ref<HudPosition>(isHudPosition(stored) ? stored : DEFAULT_POSITION);

  // Same rationale as useFogDebug: Vue Router reuses the component instance
  // on a query-only navigation, so this has to stay a live watch rather than
  // a one-shot read at setup() time.
  watchEffect(() => {
    const requested = route.query.hudPosition;
    if (isHudPosition(requested)) {
      sessionStorage.setItem(STORAGE_KEY, requested);
      position.value = requested;
    }
  });

  return position;
}
