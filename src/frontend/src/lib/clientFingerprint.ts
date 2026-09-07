/**
 * A cheap, best-effort device fingerprint sent as `X-Client-Fingerprint` on
 * the plot-suggestion request — the third identity signal
 * `PlotReservationService` combines with `OwnerId` (the primary pin) and IP
 * (a NAT-tolerant cap) to make incognito/private-window `OwnerId` churn from
 * the same device harder: a private window wipes localStorage but not
 * screen size, timezone, or language. Not a security control, just a
 * deterrent at the same trust level as the IP cap — the backend hashes this
 * together with User-Agent/Accept-Language itself.
 *
 * Computed once and memoised; wrapped so a missing `screen`/`Intl` (an
 * unusual embedding context, not real browsers) degrades to an empty string
 * rather than throwing and breaking the request that needs it.
 */
let cached: string | null = null;

export function clientFingerprint(): string {
  if (cached !== null) return cached;

  try {
    const parts = [
      screen.width,
      screen.height,
      window.devicePixelRatio,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      navigator.language,
      navigator.hardwareConcurrency,
      navigator.platform,
    ];
    cached = parts.join('|');
  } catch {
    cached = '';
  }

  return cached;
}
