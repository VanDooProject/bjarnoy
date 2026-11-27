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

// A rejected refresh token ends in a full page load (lib/leaveSession.ts).
const assign = vi.fn();
vi.stubGlobal('window', { location: { assign } });

describe('auth store tryRefresh', () => {
  beforeEach(() => {
    storage.clear();
    storage.set('bjarnoy.refreshToken', 'rt-1');
    vi.restoreAllMocks();
    assign.mockReset();
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
    expect(assign).not.toHaveBeenCalled();
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
    expect(assign).toHaveBeenCalledExactlyOnceWith('/');
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
    expect(assign).not.toHaveBeenCalled();
  });
});

// The UX-review bug (A36): a reload whose stored refresh token the server rejects used to drop only the token. The
// player store still held the claimed realm, so /settlement loaded as an anonymous visitor: every call came back 403
// (the realm only answers to the account's JWT), the pollers kept firing, raw API paths showed in error banners and
// the "Name your jarl" nudge came back. A rejected refresh now ends the session the way logging out does.
describe('auth store: a rejected refresh token ends the session', () => {
  beforeEach(() => {
    storage.clear();
    storage.set('bjarnoy.refreshToken', 'rt-1');
    storage.set('bjarnoy.accountName', 'ragnar42');
    storage.set('bjarnoy.playerId', 'player_old');
    storage.set('bjarnoy.settlementId', 'settlement-1');
    storage.set('bjarnoy.settlementsByWorld', JSON.stringify({ 'world-1': 'settlement-1' }));
    storage.set('bjarnoy.onboardingComplete', '1');
    storage.set('bjarnoy.worldId', 'world-1');
    vi.restoreAllMocks();
    assign.mockReset();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'invalid_refresh_token' })));
  });

  it('on reload: forgets the local identity and loads the returning-player login for the stored account', async () => {
    const auth = await loadStore();

    await auth.ensureInitialized();

    expect(assign).toHaveBeenCalledExactlyOnceWith('/');
    expect(auth.sessionEnded).toBe(true);
    expect(auth.isAuthenticated).toBe(false);
    expect(storage.get('bjarnoy.lastAccount')).toBe('ragnar42');
    for (const key of ['bjarnoy.refreshToken', 'bjarnoy.accountName', 'bjarnoy.playerId', 'bjarnoy.settlementId', 'bjarnoy.settlementsByWorld', 'bjarnoy.onboardingComplete']) {
      expect(storage.has(key), key).toBe(false);
    }
    // The device's world stays, like on logout: logging back in restores the realm there.
    expect(storage.get('bjarnoy.worldId')).toBe('world-1');
  });

  it('mid-session (access token expired): uses the loaded account and leaves the page the same way', async () => {
    storage.delete('bjarnoy.accountName');
    const auth = await loadStore();
    auth.user = { ...user, userName: 'astrid' } as never;
    auth.accessToken = 'expired';

    expect(await auth.tryRefresh()).toBe(false);

    expect(assign).toHaveBeenCalledExactlyOnceWith('/');
    expect(auth.accessToken).toBeNull();
    expect(storage.get('bjarnoy.lastAccount')).toBe('astrid');
    expect(storage.has('bjarnoy.settlementId')).toBe(false);
  });

  it.each([
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a 503', () => Promise.resolve(jsonResponse(503, {}))],
  ])('does not leave on %s', async (_name, respond) => {
    vi.stubGlobal('fetch', vi.fn(respond));
    const auth = await loadStore();

    await auth.ensureInitialized();

    expect(assign).not.toHaveBeenCalled();
    expect(auth.sessionEnded).toBe(false);
    expect(storage.get('bjarnoy.settlementId')).toBe('settlement-1');
  });

  it('remembers the account name with the refresh token, and forgets both together', async () => {
    storage.clear();
    const auth = await loadStore();

    auth.applyAuthResponse(authResponse('rt-9') as never);
    expect(storage.get('bjarnoy.accountName')).toBe('admin');

    auth.clearSession();
    expect(storage.has('bjarnoy.accountName')).toBe(false);
    expect(storage.has('bjarnoy.refreshToken')).toBe(false);
  });

  it('mid-session, after another tab removed the shared token: leaves the page too', async () => {
    const auth = await loadStore();
    auth.user = { ...user, userName: 'astrid' } as never;
    auth.accessToken = 'expired';
    storage.delete('bjarnoy.refreshToken');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await auth.tryRefresh()).toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledExactlyOnceWith('/');
    expect(storage.get('bjarnoy.lastAccount')).toBe('astrid');
  });

  it('two tabs refreshing at once take turns, so neither is rejected and the identity stays', async () => {
    // Rotating tokens as the server does: each token works once.
    let live = 'rt-1';
    let n = 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const { refreshToken } = JSON.parse(init.body as string) as { refreshToken: string };
        // The server spends the token at once, but the winner's answer is slower to arrive than the loser's 401: the
        // loser sees the old token still stored, so its retry-with-the-stored-token cannot help.
        if (refreshToken !== live) return jsonResponse(401, { error: 'invalid_refresh_token' });
        live = `rt-${++n}`;
        const issued = live;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return jsonResponse(200, authResponse(issued));
      }),
    );
    // A minimal exclusive Web Lock shared by both "tabs".
    let queue: Promise<unknown> = Promise.resolve();
    const locks = {
      request: (_name: string, run: () => Promise<boolean>) => {
        const result = queue.then(run);
        queue = result.catch(() => {});
        return result;
      },
    };
    vi.stubGlobal('navigator', { locks });
    const tabA = await loadStore();
    const tabB = await loadStore();

    const results = await Promise.all([tabA.tryRefresh(), tabB.tryRefresh()]);
    vi.stubGlobal('navigator', undefined);

    expect(results).toEqual([true, true]);
    expect(assign).not.toHaveBeenCalled();
    expect(storage.get('bjarnoy.settlementId')).toBe('settlement-1');
    expect(storage.get('bjarnoy.refreshToken')).toBe(live);
  });
});
