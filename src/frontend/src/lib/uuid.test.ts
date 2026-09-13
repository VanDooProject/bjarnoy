import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** What a plain-HTTP page has: getRandomValues, but no randomUUID. */
function insecureContext() {
  const real = globalThis.crypto;
  vi.stubGlobal('crypto', {
    getRandomValues: real.getRandomValues.bind(real),
  });
}

describe('randomUuid', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses crypto.randomUUID where the browser has it', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555' as const);
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: globalThis.crypto.getRandomValues });

    expect(randomUuid()).toBe('11111111-2222-4333-8444-555555555555');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('still returns a v4 uuid outside a secure context', () => {
    // The deployment case: http:// on an IP host, where randomUUID is
    // undefined and calling it threw during store creation, blanking the app.
    insecureContext();

    expect(randomUuid()).toMatch(V4);
  });

  it('sets the version and variant bits itself in the fallback', () => {
    insecureContext();

    const uuid = randomUuid();

    expect(uuid[14]).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(uuid[19]);
  });

  it('does not repeat itself', () => {
    insecureContext();

    const ids = new Set(Array.from({ length: 200 }, () => randomUuid()));

    expect(ids.size).toBe(200);
  });

  it('refuses to invent an id when there is no CSPRNG at all', () => {
    // The id is a bearer credential, so a Math.random stand-in would be worse
    // than failing.
    vi.stubGlobal('crypto', {});

    expect(() => randomUuid()).toThrow(/CSPRNG/);
  });
});
