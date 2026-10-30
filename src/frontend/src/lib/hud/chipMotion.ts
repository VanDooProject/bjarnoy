/**
 * A floating HUD chip (the in-game phone "Name your jarl" chip, HudNav.vue)
 * appearing or going away: a short fade with a small slide towards the bar it
 * hangs under, instead of popping. Plain Web Animations through lib/motion.ts,
 * the same gate every other HUD animation uses — with motion off it resolves
 * at once and the chip simply appears / disappears.
 */
import { animate, motionEnabled } from '../motion';

export const CHIP_FADE_MS = 160;

export function fadeChip(chip: Element, direction: 'in' | 'out'): Promise<void> {
  if (!motionEnabled()) return Promise.resolve();
  const away = { opacity: 0, transform: 'translateY(-6px)' };
  const rest = { opacity: 1, transform: 'none' };
  return animate(chip, direction === 'out' ? [rest, away] : [away, rest], {
    duration: CHIP_FADE_MS,
    easing: direction === 'out' ? 'ease-in' : 'ease-out',
    fill: 'both',
  });
}
