import { ref } from 'vue';

// A tiny shared singleton, not a Pinia store: this is transient UI state
// (is the mobile pull-down drawer currently open right now?), not
// something any other part of the app needs to react to across a reload or
// that belongs in devtools/state inspection. TopBar.vue's own useHudDrawer
// instance is the only writer; DemoModeBadge.vue reads it so it can get out
// of the drawer's way while it's open (see that component's own comment).
export const isHudDrawerOpen = ref(false);
