// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorldStore } from './world';
import { useAuthStore } from './auth';
import type { SettlementSummary } from '../api/types';

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return { ...actual, DEMO_MODE: false };
});
const api = vi.hoisted(() => ({ listMySettlements: vi.fn() }));
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: { ...actual.api, ...api } };
});

function register(store: ReturnType<typeof useWorldStore>, id: string, ownerId: string, realmId?: string) {
  store.model.registerSettlement({
    id,
    ownerId,
    ownerName: 'x',
    name: id,
    q: 0,
    r: 0,
    level: 1,
    resources: { wood: 0, stone: 0, food: 0, iron: 0 },
    rates: { wood: 0, stone: 0, food: 0, iron: 0 },
    foundedAt: Date.now(),
    realmId,
    islandId: 'i',
  });
}

describe('world store ownRealmOf', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('gives the realm id of an own settlement, its oldest linked member for a newer one, and null for a rival', () => {
    const store = useWorldStore();
    store.ownerId = 'me';
    register(store, 'a', 'me', 'a');
    register(store, 'a2', 'me', 'a');
    register(store, 'b', 'me');
    register(store, 'rival', 'rival');
    expect(store.ownRealmOf('a')).toBe('a');
    expect(store.ownRealmOf('a2')).toBe('a');
    expect(store.ownRealmOf('b')).toBe('b');
    expect(store.ownRealmOf('rival')).toBeNull();
    expect(store.ownRealmOf('unknown')).toBeNull();
    expect(store.ownRealmOf(undefined)).toBeNull();
  });
});

describe('world store realmList', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('lists one row per realm, named by its oldest member', () => {
    const store = useWorldStore();
    const row = (id: string, realmId: string, name: string, longhouseLevel: number) =>
      ({ id, realmId, name, longhouseLevel, q: 1, r: 2 }) as SettlementSummary;
    store.myRealms = [row('a2', 'a', 'Newer', 1), row('a', 'a', 'Hrafn', 4), row('b', 'b', 'Sker', 2)];
    expect(store.realmList).toEqual([
      { id: 'a', name: 'Hrafn', level: 4, q: 1, r: 2 },
      { id: 'b', name: 'Sker', level: 2, q: 1, r: 2 },
    ]);
  });
});

describe('world store refreshMyRealms', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    api.listMySettlements.mockReset().mockResolvedValue([]);
  });

  it('never asks the API for a logged-out visitor (the 401 would be a console error)', async () => {
    const store = useWorldStore();
    store.worldId = 'w1';
    store.selectedSettlementId = 's1';
    await store.refreshMyRealms();
    expect(api.listMySettlements).not.toHaveBeenCalled();
  });

  it('asks only once a world and a settlement are open', async () => {
    const store = useWorldStore();
    useAuthStore().user = { id: 'u1', email: 'a@b.c' } as never;
    store.worldId = 'w1';
    await store.refreshMyRealms();
    expect(api.listMySettlements).not.toHaveBeenCalled();
    store.selectedSettlementId = 's1';
    await store.refreshMyRealms();
    expect(api.listMySettlements).toHaveBeenCalledWith('w1');
  });
});
