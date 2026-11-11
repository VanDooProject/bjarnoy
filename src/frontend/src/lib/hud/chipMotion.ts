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

/**
 * A small popover hanging under its trigger (the top bar's settlement menu and rename card) opening or closing: a short
 * fade with a slight scale from the trigger's corner. Same motion gate as `fadeChip`: with motion off it resolves at once.
 */
export function fadePopover(popover: Element, direction: 'in' | 'out'): Promise<void> {
  if (!motionEnabled()) return Promise.resolve();
  const away = { opacity: 0, transform: 'scale(0.96)' };
  const rest = { opacity: 1, transform: 'none' };
  return animate(popover, direction === 'out' ? [rest, away] : [away, rest], {
    duration: CHIP_FADE_MS,
    easing: direction === 'out' ? 'ease-in' : 'ease-out',
    fill: 'both',
  });
}
