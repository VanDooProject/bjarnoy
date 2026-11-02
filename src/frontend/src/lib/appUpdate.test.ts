import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerUnsavedInput } from '../composables/useUnsavedInput';
import {
  buildIdFromEntryUrl,
  checkBuildHeader,
  handleChunkLoadError,
  hardLoad,
  installChunkErrorHandling,
  isChunkLoadError,
  isUpdatePending,
  markUpdatePending as markPending,
  reloadWhenIdle,
  resetAppUpdate,
  setOwnBuildId,
  updateNavigationGuard,
} from './appUpdate';

function stubBrowser(href = 'https://game.test/settlement') {
  const store = new Map<string, string>();
  const loc = { href, assign: vi.fn(), reload: vi.fn() };
  vi.stubGlobal('location', loc);
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  return loc;
}

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://x/assets/MapView-abc.js',
    'error loading dynamically imported module: https://x/assets/MapView-abc.js',
    'Importing a module script failed.',
  ])('recognises %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isChunkLoadError(new Error('Failed to fetch'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('hardLoad', () => {
  beforeEach(() => resetAppUpdate());
  afterEach(() => vi.unstubAllGlobals());

  it('assigns the target and refuses the same target again within 10 s', () => {
    const loc = stubBrowser();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(hardLoad('/world', 1000)).toBe(true);
    expect(loc.assign).toHaveBeenCalledWith('https://game.test/world');
    expect(hardLoad('/world', 5000)).toBe(false);
    expect(loc.assign).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it('loads the same target again after the window, and other targets at once', () => {
    const loc = stubBrowser();
    expect(hardLoad('/world', 1000)).toBe(true);
    expect(hardLoad('/other', 1500)).toBe(true);
    expect(hardLoad('/world', 20_000)).toBe(true);
    expect(loc.assign).toHaveBeenCalledTimes(3);
  });

  it('reloads instead of assigning when the target is the current URL', () => {
    const loc = stubBrowser('https://game.test/settlement#world');
    hardLoad('/settlement#world', 1000);
    expect(loc.reload).toHaveBeenCalledTimes(1);
    expect(loc.assign).not.toHaveBeenCalled();
  });
});

describe('handleChunkLoadError', () => {
  beforeEach(() => resetAppUpdate());
  afterEach(() => vi.unstubAllGlobals());

  it('marks the update pending and hard-loads the target on a chunk error', () => {
    const loc = stubBrowser();
    const err = new TypeError('Failed to fetch dynamically imported module: x');
    expect(handleChunkLoadError(err, '/login')).toBe(true);
    expect(isUpdatePending()).toBe(true);
    expect(loc.assign).toHaveBeenCalledWith('https://game.test/login');
  });

  it('leaves any other error alone', () => {
    const loc = stubBrowser();
    expect(handleChunkLoadError(new Error('boom'), '/settlement')).toBe(false);
    expect(isUpdatePending()).toBe(false);
    expect(loc.assign).not.toHaveBeenCalled();
  });
});

describe('installChunkErrorHandling', () => {
  beforeEach(() => resetAppUpdate());
  afterEach(() => vi.unstubAllGlobals());

  it('routes router errors and vite:preloadError into hard loads', () => {
    const loc = stubBrowser();
    const listeners = new Map<string, () => void>();
    vi.stubGlobal('addEventListener', (type: string, fn: () => void) => listeners.set(type, fn));
    let onError: (err: unknown, to: { fullPath: string }) => void = () => {};
    installChunkErrorHandling({ onError: (h) => void (onError = h) });

    onError(new TypeError('Importing a module script failed.'), { fullPath: '/settlement#world' });
    expect(loc.assign).toHaveBeenCalledWith('https://game.test/settlement#world');

    listeners.get('vite:preloadError')?.();
    expect(loc.reload).toHaveBeenCalledTimes(1);
  });
});

describe('build id', () => {
  beforeEach(() => resetAppUpdate());

  it('is the entry module URL path without the leading slash', () => {
    expect(buildIdFromEntryUrl('https://game.test/assets/index-BhkDhqzG.js')).toBe('assets/index-BhkDhqzG.js');
  });

  it('marks an update pending only for a different X-App-Build', () => {
    setOwnBuildId('assets/index-A.js');
    checkBuildHeader(null);
    checkBuildHeader('assets/index-A.js');
    expect(isUpdatePending()).toBe(false);
    checkBuildHeader('assets/index-B.js');
    expect(isUpdatePending()).toBe(true);
  });
});

describe('updateNavigationGuard', () => {
  beforeEach(() => resetAppUpdate());
  afterEach(() => vi.unstubAllGlobals());
  const initial = { matched: [] };
  const inApp = { matched: [{}] };

  it('lets every navigation through while no update is pending', () => {
    const loc = stubBrowser();
    expect(updateNavigationGuard({ fullPath: '/login' }, inApp)).toBe(true);
    expect(loc.assign).not.toHaveBeenCalled();
  });

  it('turns an in-app navigation into a full page load once an update is pending', () => {
    const loc = stubBrowser();
    markPending();
    expect(updateNavigationGuard({ fullPath: '/login' }, inApp)).toBe(false);
    expect(loc.assign).toHaveBeenCalledWith('https://game.test/login');
  });

  it('leaves the initial navigation alone', () => {
    const loc = stubBrowser();
    markPending();
    expect(updateNavigationGuard({ fullPath: '/login' }, initial)).toBe(true);
    expect(loc.assign).not.toHaveBeenCalled();
  });
});

describe('reloadWhenIdle', () => {
  beforeEach(() => resetAppUpdate());
  afterEach(() => vi.unstubAllGlobals());

  it('does nothing without a pending update', () => {
    const loc = stubBrowser();
    expect(reloadWhenIdle()).toBe(false);
    expect(loc.reload).not.toHaveBeenCalled();
  });

  it('reloads a pending update when nothing is unsaved', () => {
    const loc = stubBrowser();
    markPending();
    expect(reloadWhenIdle()).toBe(true);
    expect(loc.reload).toHaveBeenCalledTimes(1);
  });

  it('keeps unsaved input and waits for the next navigation', () => {
    const loc = stubBrowser();
    markPending();
    const unregister = registerUnsavedInput(() => true);
    expect(reloadWhenIdle()).toBe(false);
    expect(loc.reload).not.toHaveBeenCalled();
    unregister();
  });
});
