// Mirrors the resolved HUD motion setting onto <html data-hud-motion>, so the
// HUD's CSS can key off one attribute (`html[data-hud-motion='reduced']`)
// instead of the OS-only `prefers-reduced-motion` media query — the player's
// "Menu animations" choice overrides the OS in either direction. 'auto'
// resolves from the live OS query, so behaviour is unchanged by default.
import { watchEffect } from 'vue';
import { motionPreferences } from './motionPreferences';

export type HudMotionAttribute = 'reduced' | 'full';

/** Installs the reactive attribute once; returns the stop handle. */
export function installHudMotionAttribute(root: HTMLElement = document.documentElement) {
  return watchEffect(() => {
    root.dataset.hudMotion = motionPreferences.hudEnabled ? 'full' : 'reduced';
  });
}
