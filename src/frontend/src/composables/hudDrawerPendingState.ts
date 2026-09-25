import { ref } from 'vue';

// Mobile HUD bar rework, phase 2: on an in-game bar (ResourceBar present)
// the anonymous account-creation nudge (ProfileNudge, normally anchored to
// ReturningPlayerMenu's trigger) has nowhere to float, since that trigger is
// hidden on a phone there — MobileHudDrawer.vue tucks the nudge into its own
// account section instead (see that file's own comment). With the nudge no
// longer visible inline, the only remaining on-screen sign a player has of
// it is the bar's own drawer handle (TopBar.vue's `.hud-grip`) — this tiny
// shared singleton (same pattern as hudDrawerOpenState.ts/
// hudSettlementBubbleState.ts) lets MobileHudDrawer report "I'm holding a
// pending nudge right now" so TopBar can paint a small attention dot on that
// handle. MobileHudDrawer is the only writer; TopBar only ever reads it.
export const isHudDrawerPending = ref(false);
