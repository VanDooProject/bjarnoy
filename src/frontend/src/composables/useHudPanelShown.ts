import { computed, type ComputedRef } from 'vue';
import { useHudPrefsStore } from '../stores/hudPrefs';
import { HUD_PANEL_IDS, type HudPanelId } from '../lib/hud/hudPanelDock';
import { useHasActiveDraft, useHudPanelContent } from './useHudPanelContent';

/**
 * Whether each panel is on screen: it has something to show and is open. A dispatch or field order being composed shows the
 * Armies panel (its form lives there) even when collapsed, and only for as long as the draft lasts.
 */
export function useHudPanelShown(): { shown: Record<HudPanelId, ComputedRef<boolean>>; heldOpen: Record<HudPanelId, ComputedRef<boolean>> } {
  const prefs = useHudPrefsStore();
  const content = useHudPanelContent();
  const hasActiveDraft = useHasActiveDraft();
  const heldOpen = {} as Record<HudPanelId, ComputedRef<boolean>>;
  const shown = {} as Record<HudPanelId, ComputedRef<boolean>>;
  for (const id of HUD_PANEL_IDS) {
    heldOpen[id] = computed(() => id === 'armies' && hasActiveDraft.value);
    shown[id] = computed(() => content[id].value && (prefs.panels[id].open || heldOpen[id].value));
  }
  return { shown, heldOpen };
}
