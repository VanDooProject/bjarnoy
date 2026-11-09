import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The test environment is `node`, so localStorage is a Map-backed stand-in.
const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
});

vi.mock('../config', () => ({ API_BASE_URL: '/api/v1', DEMO_MODE: false }));
vi.mock('../i18n', () => ({ setLocale: () => {} }));

const user = { id: 'u1', userName: 'admin', role: 'admin', preferredLocale: null };

function authResponse(refreshToken: string) {
  return { user, accessToken: `access-${refreshToken}`, refreshToken };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function loadStore() {
  vi.resetModules();
  const { useAuthStore } = await import('./auth');
  setActivePinia(createPinia());
  return useAuthStore();
}

describe('auth store tryRefresh', () => {
  beforeEach(() => {
    storage.clear();
    storage.set('bjarnoy.refreshToken', 'rt-1');
    vi.restoreAllMocks();
  });

  it('shares one /auth/refresh call between concurrent callers', async () => {
    // Rotating tokens: the server accepts rt-1 once, then rejects it.
    let used = false;
    const fetchMock = vi.fn(async () => {
      await Promise.resolve();
      if (used) return jsonResponse(401, { error: 'invalid_refresh_token' });
      used = true;
      return jsonResponse(200, authResponse('rt-2'));
    });
    vi.stubGlobal('fetch', fetchMock);
    const auth = await loadStore();

    const results = await Promise.all([auth.tryRefresh(), auth.tryRefresh(), auth.tryRefresh()]);

    expect(results).toEqual([true, true, true]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(auth.accessToken).toBe('access-rt-2');
    expect(storage.get('bjarnoy.refreshToken')).toBe('rt-2');
    expect(auth.isAuthenticated).toBe(true);
  });

  it('starts a new refresh once the previous one has settled', async () => {
    let n = 1;
    const fetchMock = vi.fn(async () => jsonResponse(200, authResponse(`rt-${++n}`)));
    vi.stubGlobal('fetch', fetchMock);
    const auth = await loadStore();

    await auth.tryRefresh();
    await auth.tryRefresh();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storage.get('bjarnoy.refreshToken')).toBe('rt-3');
  });

  it('ends the session when the server rejects the refresh token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'invalid_refresh_token' })));
    const auth = await loadStore();
    auth.user = user as never;
    auth.accessToken = 'stale';

    expect(await auth.tryRefresh()).toBe(false);

    expect(auth.user).toBeNull();
    expect(auth.accessToken).toBeNull();
    expect(storage.has('bjarnoy.refreshToken')).toBe(false);
  });

  it.each([
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a 503', () => Promise.resolve(jsonResponse(503, {}))],
  ])('keeps the session and refresh token on %s', async (_name, respond) => {
    vi.stubGlobal('fetch', vi.fn(respond));
    const auth = await loadStore();
    auth.user = user as never;
    auth.accessToken = 'stale';

    expect(await auth.tryRefresh()).toBe(false);

    expect(auth.user).not.toBeNull();
    expect(storage.get('bjarnoy.refreshToken')).toBe('rt-1');
  });

  it('retries once with the stored token when another tab rotated it during the call', async () => {
    const sent: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const { refreshToken } = JSON.parse(init.body as string) as { refreshToken: string };
      sent.push(refreshToken);
      if (refreshToken === 'rt-1') {
        // Another tab's refresh lands first: it spends rt-1 and stores rt-2.
        storage.set('bjarnoy.refreshToken', 'rt-2');
        return jsonResponse(401, { error: 'invalid_refresh_token' });
      }
      return jsonResponse(200, authResponse('rt-3'));
    });
    vi.stubGlobal('fetch', fetchMock);
    const auth = await loadStore();

    expect(await auth.tryRefresh()).toBe(true);

    expect(sent).toEqual(['rt-1', 'rt-2']);
    expect(auth.isAuthenticated).toBe(true);
    expect(storage.get('bjarnoy.refreshToken')).toBe('rt-3');
  });

  it('gives up after one retry when the replacement token is rejected too', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const { refreshToken } = JSON.parse(init.body as string) as { refreshToken: string };
      if (refreshToken === 'rt-1') storage.set('bjarnoy.refreshToken', 'rt-2');
      return jsonResponse(401, { error: 'invalid_refresh_token' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const auth = await loadStore();

    expect(await auth.tryRefresh()).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.user).toBeNull();
    expect(storage.has('bjarnoy.refreshToken')).toBe(false);
  });

  it('does not retry a rejection when the stored token is unchanged', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { error: 'invalid_refresh_token' }));
    vi.stubGlobal('fetch', fetchMock);
    const auth = await loadStore();

    expect(await auth.tryRefresh()).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns false without a request when there is no stored refresh token', async () => {
    storage.clear();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const auth = await loadStore();

    expect(await auth.tryRefresh()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
