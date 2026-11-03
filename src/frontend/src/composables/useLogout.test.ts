import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Logging out ends in a full page load, and until that load replaces the page
// its HUD polls keep running against the player's realm. A claimed realm only
// answers to the account's JWT, so the running page must keep it until then —
// dropping it first turned every poll in that window into a 403 (the flaky
// "Failed to load resource" console errors in the AppHost
// OnboardingHappyPathTests).
function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

const user = {
  id: 'user-1',
  userName: 'ragnar42',
  role: 'player',
  isPremium: false,
  preferredLocale: null,
};

async function loggedIn() {
  vi.resetModules();
  vi.doMock('../config', () => ({ DEMO_MODE: false, API_BASE_URL: '/api/v1' }));
  const { useAuthStore } = await import('../stores/auth');
  const { useLogout } = await import('./useLogout');
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.applyAuthResponse({ user, accessToken: 'access-1', refreshToken: 'refresh-1' } as never);
  return { auth, logout: useLogout().logout };
}

describe('useLogout', () => {
  let assign: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeLocalStorage());
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the access token on the running page until the full load replaces it', async () => {
    const { auth, logout } = await loggedIn();
    let tokenWhenLeaving: string | null = 'not called';
    assign.mockImplementation(() => {
      tokenWhenLeaving = auth.accessToken;
    });

    await logout();

    expect(assign).toHaveBeenCalledWith('/');
    expect(tokenWhenLeaving).toBe('access-1');
  });

  it('keeps the access token while the server revokes the session', async () => {
    const { auth, logout } = await loggedIn();
    let tokenDuringRevoke: string | null = 'not called';
    fetchMock.mockImplementation(async () => {
      tokenDuringRevoke = auth.accessToken;
      return new Response(null, { status: 204 });
    });

    await logout();

    expect(tokenDuringRevoke).toBe('access-1');
  });

  it('revokes the refresh token server-side and forgets it before the reload', async () => {
    const { logout } = await loggedIn();

    await logout();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ refreshToken: 'refresh-1' }) }),
    );
    expect(localStorage.getItem('bjarnoy.refreshToken')).toBeNull();
    expect(localStorage.getItem('bjarnoy.lastAccount')).toBe('ragnar42');
  });
});
