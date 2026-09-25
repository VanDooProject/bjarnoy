import { ref } from 'vue';

// A tiny shared singleton, not a Pinia store: this is transient UI state
// (is the mobile pull-down drawer currently open right now?), not
// something any other part of the app needs to react to across a reload or
// that belongs in devtools/state inspection. TopBar.vue's own useHudDrawer
// instance is the only writer; DemoModeBadge.vue reads it so it can get out
// of the drawer's way while it's open (see that component's own comment).
export const isHudDrawerOpen = ref(false);

// Finding #12: MapView.vue/LandingView.vue own QueueDrawer's `open` state
// directly (it's just a local `ref`), but the HUD drawer's own `isOpen` is
// private to whichever TopBar instance's `useHudDrawer()` created it — there
// is no other handle to it from outside TopBar.vue. This lets a page close
// the HUD drawer from its own "opening the other one should close this one"
// watcher without TopBar needing to expose (or MapView needing to hold) a
// whole extra composable instance just for that one call. TopBar.vue is the
// only writer of the function itself (set on mount, cleared on unmount);
// everyone else only ever calls it, and only while `isHudDrawerOpen` is
// true (i.e. the function is guaranteed to exist).
let closeHudDrawerFn: (() => void) | null = null;
export function setHudDrawerCloseFn(fn: (() => void) | null) {
  closeHudDrawerFn = fn;
}
export function closeHudDrawer() {
  closeHudDrawerFn?.();
}
