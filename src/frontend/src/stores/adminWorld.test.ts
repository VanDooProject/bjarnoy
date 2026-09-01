// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminWorldStore } from './adminWorld';
import type { AdminWorldResponse } from '../api/types';

const { adminListWorlds } = vi.hoisted(() => ({ adminListWorlds: vi.fn() }));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: { adminListWorlds } };
});

const SELECTED_WORLD_KEY = 'bjarnoy.admin.selectedWorldId';

function world(overrides: Partial<AdminWorldResponse> = {}): AdminWorldResponse {
  return {
    id: 'world-1',
    name: 'Midgard',
    status: 'active',
    maxPlayers: 100,
    playerCount: 1,
    speedFactor: 1,
    baseShieldDays: 7,
    startsAt: null,
    joinsClosed: false,
    endbossAt: null,
    endbossTriggeredAt: null,
    runState: 'running',
    runStateSince: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    beginnerRingsWithCapacity: 6,
    beginnerRingsTotal: 6,
    beginnerTotalExhaustion: false,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('useAdminWorldStore', () => {
  it('defaults selectedWorldId from localStorage', () => {
    localStorage.setItem(SELECTED_WORLD_KEY, 'world-9');

    const store = useAdminWorldStore();

    expect(store.selectedWorldId).toBe('world-9');
  });

  it('selects the first world when nothing was persisted', async () => {
    adminListWorlds.mockResolvedValue([world({ id: 'world-1' }), world({ id: 'world-2' })]);
    const store = useAdminWorldStore();

    await store.loadWorlds();

    expect(store.selectedWorldId).toBe('world-1');
    expect(localStorage.getItem(SELECTED_WORLD_KEY)).toBe('world-1');
  });

  it('keeps a persisted selection that still names a real world', async () => {
    localStorage.setItem(SELECTED_WORLD_KEY, 'world-2');
    adminListWorlds.mockResolvedValue([world({ id: 'world-1' }), world({ id: 'world-2' })]);
    const store = useAdminWorldStore();

    await store.loadWorlds();

    expect(store.selectedWorldId).toBe('world-2');
  });

  it('falls back to the first world when the persisted selection no longer exists', async () => {
    localStorage.setItem(SELECTED_WORLD_KEY, 'deleted-world');
    adminListWorlds.mockResolvedValue([world({ id: 'world-1' })]);
    const store = useAdminWorldStore();

    await store.loadWorlds();

    expect(store.selectedWorldId).toBe('world-1');
    expect(localStorage.getItem(SELECTED_WORLD_KEY)).toBe('world-1');
  });

  it('clears the selection when no worlds exist', async () => {
    adminListWorlds.mockResolvedValue([]);
    const store = useAdminWorldStore();

    await store.loadWorlds();

    expect(store.selectedWorldId).toBeNull();
    expect(localStorage.getItem(SELECTED_WORLD_KEY)).toBeNull();
  });

  it('persists an explicit selection', () => {
    const store = useAdminWorldStore();

    store.selectWorld('world-5');

    expect(store.selectedWorldId).toBe('world-5');
    expect(localStorage.getItem(SELECTED_WORLD_KEY)).toBe('world-5');
  });

  it('surfaces an error and keeps loading false when the fetch fails', async () => {
    adminListWorlds.mockRejectedValue(new Error('network down'));
    const store = useAdminWorldStore();

    await store.loadWorlds();

    expect(store.error).toBe('Could not load worlds.');
    expect(store.loading).toBe(false);
  });
});
