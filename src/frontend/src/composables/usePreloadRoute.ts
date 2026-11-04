import { watch } from 'vue';
import { loadRouteLocation, useRouter } from 'vue-router';

/**
 * Loads a lazy route's view chunk ahead of time, while a control leading
 * there is on screen (`when` true), so the click that follows navigates at once.
 *
 * Without it, the click starts loading the chunk: its CSS link's load event,
 * the module fetch and its evaluation are each a separate task, and on a busy
 * main thread (the map drawing on a software-rendered device) every one of
 * those tasks waits behind a whole map frame, so the URL can stay unchanged
 * for seconds after the click. Loaded beforehand, the router resolves the
 * view from its cache and the navigation finishes in the click's own task.
 *
 * A failed preload is dropped: the click loads the chunk again, and a
 * failure there goes through the router's own chunk-error handling
 * (lib/appUpdate.ts).
 */
export function usePreloadRoute(path: string, when: () => boolean = () => true): void {
  const router = useRouter();
  watch(
    when,
    (active) => {
      if (active) loadRouteLocation(router.resolve(path)).catch(() => undefined);
    },
    { immediate: true },
  );
}
