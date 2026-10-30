import { ref } from 'vue';

// Is TradePanel.vue's panel open right now? Same tiny shared-singleton pattern
// as hudDrawerOpenState.ts. TradePanel is the only writer. HudNav.vue reads it
// on the in-game phone bar, where the floating "Name your jarl" chip sits in
// the slot right under the Trade toggle that the open panel also takes: the
// chip steps aside while the panel is open instead of covering its header.
export const isTradePanelOpen = ref(false);
