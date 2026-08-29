// @vitest-environment jsdom
import { defineComponent, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_INTERVAL_MS, useActivityHeartbeat } from './useActivityHeartbeat';
import { useAuthStore } from '../stores/auth';

const { heartbeat } = vi.hoisted(() => ({ heartbeat: vi.fn() }));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: { heartbeat } };
});

// jsdom lets `document.visibilityState` be assigned directly (it's a plain
// getter on the prototype, not the guarded read-only property real browsers
// expose) — so tests drive it with a plain assignment plus a manually
// dispatched 'visibilitychange' event, same as the real browser API shape.
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

const HostComponent = defineComponent({
  setup() {
    useActivityHeartbeat();
    return () => h('div');
  },
});

let wrappers: ReturnType<typeof mount>[] = [];

function mountHeartbeat() {
  const wrapper = mount(HostComponent);
  wrappers.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  heartbeat.mockResolvedValue(undefined);
  vi.useFakeTimers();
  setVisibility('visible');
  wrappers = [];
});

afterEach(() => {
  // Each mounted HostComponent adds a real 'visibilitychange' listener to
  // `document`, which persists across tests in this file unless the
  // component unmounts (and thereby detaches it) — so a test left mounted
  // would otherwise still react to the next test's setVisibility() calls.
  for (const wrapper of wrappers) wrapper.unmount();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function authenticate() {
  useAuthStore().user = {
    id: 'user-1',
    userName: 'ragnar',
    role: 'player',
    status: 'active',
    displayName: null,
  };
}

describe('useActivityHeartbeat', () => {
  it('fires on the interval while visible and authenticated', () => {
    authenticate();
    mountHeartbeat();

    expect(heartbeat).not.toHaveBeenCalled();

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(heartbeat).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(heartbeat).toHaveBeenCalledTimes(2);
  });

  it('does not fire while the tab is hidden', () => {
    authenticate();
    mountHeartbeat();

    setVisibility('hidden');
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);

    expect(heartbeat).not.toHaveBeenCalled();
  });

  it('does not fire while unauthenticated', () => {
    mountHeartbeat();

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);

    expect(heartbeat).not.toHaveBeenCalled();
  });

  it('fires immediately on regaining visibility if the last heartbeat is overdue', () => {
    authenticate();
    mountHeartbeat();

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(heartbeat).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2);
    expect(heartbeat).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    expect(heartbeat).toHaveBeenCalledTimes(2);
  });

  it('does not fire immediately on regaining visibility when not yet overdue', () => {
    authenticate();
    mountHeartbeat();

    setVisibility('hidden');
    vi.advanceTimersByTime(1000);
    setVisibility('visible');

    expect(heartbeat).not.toHaveBeenCalled();

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(heartbeat).toHaveBeenCalledTimes(1);
  });

  it('cleans up its interval and listener on unmount, so no further calls happen', () => {
    authenticate();
    const wrapper = mountHeartbeat();

    wrapper.unmount();

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
    expect(heartbeat).not.toHaveBeenCalled();

    setVisibility('hidden');
    setVisibility('visible');
    expect(heartbeat).not.toHaveBeenCalled();
  });
});
