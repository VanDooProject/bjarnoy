import { ref } from 'vue';

// Finding #13: DemoModeBadge.vue and TopBar.vue's own mobile "settlement
// bubble" (name + "Lv N · M hexes") used to share the exact same fixed top
// offset (bar height + 8px, or 8px when the bar is bottom-docked) — fine
// when only one of the two could ever be on screen, but a demo-mode session
// on an in-game settlement page shows both at once, and they visibly
// overlapped there. A tiny shared singleton, same pattern as
// hudDrawerOpenState.ts/hudBarHeight.ts: TopBar.vue is the only writer
// (whether its own bubble is actually rendered right now), DemoModeBadge.vue
// reads it to drop itself onto its own row below the bubble instead of
// sharing its row.
export const isSettlementBubbleShown = ref(false);

// A page's own bar can dock at the bottom, or it might not be a
// drag/docking-aware bar at all (a docked docs page, or the pre-founding
// landing's bar) — those always sit at the top regardless of the raw
// `hudPrefs.barPosition` preference (see TopBar.vue's own `barPosition`
// computed). DemoModeBadge.vue used to read the raw preference directly,
// which put its bubble at `top: 8px` (assuming "the bar must be elsewhere")
// on a page whose bar was actually still pinned at the top — overlapping it.
// TopBar.vue writes the *effective* answer here instead.
export const isHudBarAtBottom = ref(false);
