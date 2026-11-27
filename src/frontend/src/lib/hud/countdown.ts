// Pure countdown formatters shared by the HUD queues and the in-map
// construction dial.

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Compact variant for the QueueDrawer handle rows, which have ~48px of
// width to show a time in — formatCountdown()'s `h:mm:ss` doesn't fit past
// an hour. Drops seconds once there's an hour/day component (a countdown
// tab doesn't need second-level precision once it's that far out), and pads
// the hour/day component so the string doesn't visibly reflow digit widths
// tick to tick:
//   0-59:59   -> "m:ss"    (e.g. "0:50", "12:04")
//   1h-23h59m -> "HhMM"    (e.g. "1h05", "13h40")
//   >=1d      -> "DdHH"    (e.g. "1d02", "9d23")
export function formatCountdownShort(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (days > 0) return `${days}d${pad(hours)}`;
  if (hours > 0) return `${hours}h${pad(minutes)}`;
  return `${minutes}:${pad(sec)}`;
}

/**
 * A coarse "about when" duration for a premium reader: whole hours and minutes, no seconds. The caller spells it in its own
 * language (hours and minutes, or minutes alone), so no unit letter lives here. Under an hour at least 1 minute.
 *   0-59m59s -> { hours: 0, minutes: 1..60 }   (e.g. 42 min)
 *   >=1h     -> { hours: 1.., minutes: 0..59 } (e.g. 1 h 05 min)
 */
export function coarseDuration(seconds: number): { hours: number; minutes: number } {
  const s = Math.max(0, seconds);
  if (s >= 3600) return { hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60) };
  return { hours: 0, minutes: Math.max(1, Math.round(s / 60)) };
}
