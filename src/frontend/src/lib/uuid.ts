/**
 * A version-4 UUID, on a plain-HTTP page too.
 *
 * `crypto.randomUUID` is secure-context-only. A deployment reached over
 * `http://` on an IP or sslip.io host is not a secure context, so there the
 * function simply does not exist — and calling it from a Pinia store's
 * `state()` (see `stores/player.ts`) throws while `app.use(pinia)` is still
 * running, so nothing ever mounts and the page is blank. That was the whole of
 * "the deployed site renders black"; localhost hid it, being a secure context
 * by definition.
 *
 * The fallback stays CSPRNG-backed rather than reaching for `Math.random`:
 * this id is used as a bearer credential (`X-Owner-Id`, see
 * `SettlementOwnershipEndpointFilter`), and 41 bits of predictable randomness
 * would quietly turn ownership into a guess. `crypto.getRandomValues` carries
 * no secure-context restriction, so it is available exactly where
 * `randomUUID` is not.
 */
export function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    // No browser in support has neither. Failing loudly beats minting an id
    // that looks like a credential without being one.
    throw new Error('randomUuid: no CSPRNG available to generate an owner id.');
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
