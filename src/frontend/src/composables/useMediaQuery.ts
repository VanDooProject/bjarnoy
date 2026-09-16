import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/**
 * Reactive `matchMedia` wrapper. Guarded for environments without
 * `window.matchMedia` (jsdom, SSR) — those fall back to `false`, so any
 * component built on this defaults to its desktop/untouched path in tests
 * unless a test explicitly stubs `matchMedia`.
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  let mql: MediaQueryList | null = null;
  let onChange: ((e: MediaQueryListEvent) => void) | null = null;

  onMounted(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    mql = window.matchMedia(query);
    matches.value = mql.matches;
    onChange = (e) => {
      matches.value = e.matches;
    };
    mql.addEventListener('change', onChange);
  });

  onBeforeUnmount(() => {
    if (mql && onChange) mql.removeEventListener('change', onChange);
    mql = null;
    onChange = null;
  });

  return matches;
}
