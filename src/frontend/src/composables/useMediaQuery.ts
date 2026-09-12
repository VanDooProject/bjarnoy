// Small wrapper around matchMedia for a reactive breakpoint check — no
// existing composable does viewport-width detection (MapView's own `stage`
// ref tracks its own canvas element via ResizeObserver instead, which is a
// different concern: that's "how big is the map surface", this is "how
// wide is the actual viewport", the signal a CSS breakpoint would use).
import { onMounted, onUnmounted, ref } from 'vue';

export function useMediaQuery(query: string) {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const matches = ref(supported ? window.matchMedia(query).matches : false);
  let mql: MediaQueryList | null = null;

  function handleChange(event: MediaQueryListEvent) {
    matches.value = event.matches;
  }

  onMounted(() => {
    if (!supported) return;
    mql = window.matchMedia(query);
    matches.value = mql.matches;
    mql.addEventListener('change', handleChange);
  });

  onUnmounted(() => {
    mql?.removeEventListener('change', handleChange);
  });

  return matches;
}
