// ?debug=1 surfaces FogDebugPanel (see HexMapRenderer's fogDebugFlags) in
// both SettlementView and WorldMapView.
//
// Previously this only lived as a local `computed(() => route.query.debug
// === '1')` in SettlementView.vue — two bugs followed from that (issue #20):
//   1. WorldMapView never checked it at all, so there was no way to see the
//      panel (or flip a flag) while looking at the world map, even though
//      every flag it controls (HexMapRenderer.fogDebugFlags) is read by
//      world-mode rendering too.
//   2. Every internal navigation (HudNav's router.push('/settlement') etc.)
//      goes to a bare path with no query string, so `?debug=1` was silently
//      dropped the moment you clicked away from the view you loaded it on —
//      "debug mode" didn't survive a single click.
// Persisting the flag in sessionStorage (scoped to this tab, cleared on
// close — deliberately not localStorage, since this is a throwaway
// inspection aid, not a setting worth remembering across visits) fixes both:
// any view can check the same flag, and it survives navigating between them
// without threading `?debug=1` through every router.push() call in the app.
import { ref, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

const STORAGE_KEY = 'fjordhold:fogDebug';

export function useFogDebug() {
  const route = useRoute();
  const active = ref(sessionStorage.getItem(STORAGE_KEY) === '1');

  // Vue Router reuses the current view's component instance (no
  // remount/setup() re-run) when only the query string changes on the same
  // route — the screenshot scripts under scripts/screenshot-helpers/ do
  // exactly this (history.replaceState + a popstate dispatch) to flip debug
  // mode on without a full reload. A one-shot check at setup() time would
  // miss that case entirely, so this has to stay a live watch, not a value
  // read once.
  watchEffect(() => {
    if (route.query.debug === '1') {
      sessionStorage.setItem(STORAGE_KEY, '1');
      active.value = true;
    } else if (route.query.debug === '0') {
      // Explicit ?debug=0 is the escape hatch back out, since there's no UI
      // control to turn the panel off once it's showing.
      sessionStorage.removeItem(STORAGE_KEY);
      active.value = false;
    }
  });

  return active;
}
