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
