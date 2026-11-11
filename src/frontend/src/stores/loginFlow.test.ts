import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { i18n } from '../i18n';
import { LOGIN_SLOW_MS, useLoginFlowStore } from './loginFlow';
import { useAuthStore } from './auth';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup() {
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.login = vi.fn().mockResolvedValue(undefined);
  return { auth, flow: useLoginFlowStore() };
}

const t = (key: string) => i18n.global.t(key);

describe('loginFlow store', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stays busy through the login and the whole restore, idle only after done', async () => {
    const { flow } = setup();
    const restore = deferred();
    const done = vi.fn().mockResolvedValue(undefined);

    const p = flow.submit('ragnar', 'pw', { restore: () => restore.promise, done });
    expect(flow.phase).toBe('auth');
    await vi.waitFor(() => expect(flow.phase).toBe('restore'));
    expect(done).not.toHaveBeenCalled();

    restore.resolve();
    await p;
    expect(done).toHaveBeenCalledOnce();
    expect(flow.phase).toBe('idle');
  });

  it('ignores a second submit while busy', async () => {
    const { auth, flow } = setup();
    const restore = deferred();
    const p = flow.submit('ragnar', 'pw', { restore: () => restore.promise, done: async () => {} });
    await flow.submit('ragnar', 'pw', { restore: async () => {}, done: async () => {} });
    await vi.waitFor(() => expect(flow.phase).toBe('restore'));
    await flow.submit('ragnar', 'pw', { restore: async () => {}, done: async () => {} });
    expect(auth.login).toHaveBeenCalledTimes(1);
    restore.resolve();
    await p;
  });

  it('keeps a failing restore visible without an unhandled rejection and stays busy', async () => {
    const { flow } = setup();
    const boom = new Error('boom');
    const done = vi.fn();
    await flow.submit('ragnar', 'pw', {
      restore: () => Promise.reject(boom),
      done,
    });
    expect(flow.restoreError).toBe(boom);
    expect(flow.phase).toBe('restore');
    expect(done).not.toHaveBeenCalled();
  });

  it('retryRestore re-runs restore and done without logging in again', async () => {
    const { auth, flow } = setup();
    const restore = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const done = vi.fn().mockResolvedValue(undefined);
    await flow.submit('ragnar', 'pw', { restore, done });

    await flow.retryRestore();

    expect(restore).toHaveBeenCalledTimes(2);
    expect(done).toHaveBeenCalledOnce();
    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(flow.restoreError).toBeNull();
    expect(flow.phase).toBe('idle');
  });

  it.each([
    ['403', new ApiError(403, undefined), 'login.errors.banned', false],
    ['401', new ApiError(401, undefined), 'login.errors.invalidCredentials', true],
    ['timeout', new DOMException('t', 'TimeoutError'), 'login.errors.timeout', false],
    ['abort', new DOMException('a', 'AbortError'), 'login.errors.timeout', false],
    ['network', new TypeError('Failed to fetch'), 'login.errors.network', false],
    ['500', new ApiError(500, undefined), 'login.errors.generic', false],
  ])('maps a %s login failure to its message', async (_name, err, key, rejected) => {
    const { auth, flow } = setup();
    auth.login = vi.fn().mockRejectedValue(err);
    const restore = vi.fn();

    await flow.submit('ragnar', 'pw', { restore, done: async () => {} });

    expect(flow.error).toBe(t(key));
    expect(flow.credentialsRejected).toBe(rejected);
    expect(flow.phase).toBe('idle');
    expect(restore).not.toHaveBeenCalled();
  });

  it('flips slow after 3 s in a phase and resets on phase change and finish', async () => {
    vi.useFakeTimers();
    const { auth, flow } = setup();
    const login = deferred();
    auth.login = vi.fn(() => login.promise);
    const restore = deferred();

    const p = flow.submit('ragnar', 'pw', { restore: () => restore.promise, done: async () => {} });
    expect(flow.slow).toBe(false);
    await vi.advanceTimersByTimeAsync(LOGIN_SLOW_MS);
    expect(flow.slow).toBe(true);

    login.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(flow.phase).toBe('restore');
    expect(flow.slow).toBe(false);

    await vi.advanceTimersByTimeAsync(LOGIN_SLOW_MS);
    expect(flow.slow).toBe(true);

    restore.resolve();
    await p;
    expect(flow.slow).toBe(false);
    await vi.advanceTimersByTimeAsync(LOGIN_SLOW_MS * 2);
    expect(flow.slow).toBe(false);
  });
});
