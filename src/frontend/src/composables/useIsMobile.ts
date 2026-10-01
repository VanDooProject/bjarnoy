// A single source of truth for "is this a phone-sized viewport" (narrow, or
// short like a phone held sideways — see lib/breakpoints.ts) — used to
// swap the desktop BuildQueuePanel/TrainingQueuePanel pair for the mobile
// QueueDrawer in MapView.vue/LandingView.vue. Tracked via matchMedia rather
// than window.innerWidth so it updates on rotation/resize without a manual
// resize listener.
import { onUnmounted, ref, type Ref } from 'vue';
import { HUD_COMPACT_QUERY } from '../lib/breakpoints';

export function useIsMobile(): Readonly<Ref<boolean>> {
  // jsdom in unit tests for components that merely import this composable
  // (without stubbing matchMedia) shouldn't blow up — fall back to "not
  // mobile" rather than throwing.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return ref(false);
  }

  const query = window.matchMedia(HUD_COMPACT_QUERY);
  const isMobile = ref(query.matches);
  const onChange = (event: MediaQueryListEvent) => {
    isMobile.value = event.matches;
  };
  query.addEventListener('change', onChange);
  onUnmounted(() => query.removeEventListener('change', onChange));

  return isMobile;
}
