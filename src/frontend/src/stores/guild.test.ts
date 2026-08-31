import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import type { GuildResponse, GuildTreatyResponse } from '../api/types';

const api = {
  listWorldGuilds: vi.fn(),
  getGuild: vi.fn(),
  getGuildPerks: vi.fn(),
  createGuild: vi.fn(),
  joinGuild: vi.fn(),
  setGuildFeeTier: vi.fn(),
  createGuildTopic: vi.fn(),
  getGuildTopic: vi.fn(),
  replyToGuildTopic: vi.fn(),
  proposeGuildTreaty: vi.fn(),
  acceptGuildTreaty: vi.fn(),
  rejectGuildTreaty: vi.fn(),
  breakGuildTreaty: vi.fn(),
};

let currentUserId: string | null = 'user-1';

vi.mock('../api/client', () => ({
  api,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message?: string) {
      super(message ?? `status ${status}`);
      this.status = status;
    }
  },
}));

vi.mock('./auth', () => ({
  useAuthStore: () => ({ user: currentUserId ? { id: currentUserId } : null }),
}));

function guildFixture(overrides: Partial<GuildResponse> = {}): GuildResponse {
  return {
    id: 'guild-1',
    worldId: 'world-1',
    name: 'Bjornstad Hird',
    tag: 'BJH',
    description: null,
    feeTier: 'copper',
    memberCount: 2,
    createdAt: '2026-01-01T00:00:00Z',
    members: [
      { userId: 'user-1', role: 'leader', joinedAt: '2026-01-01T00:00:00Z', feeOverdue: false },
      { userId: 'user-2', role: 'member', joinedAt: '2026-01-02T00:00:00Z', feeOverdue: true },
    ],
    ...overrides,
  };
}

async function freshStore() {
  const { useGuildStore } = await import('./guild');
  setActivePinia(createPinia());
  return useGuildStore();
}

describe('useGuildStore', () => {
  it('loads a world guild directory, tracking load state', async () => {
    api.listWorldGuilds.mockReset().mockResolvedValue([guildFixture()]);
    const store = await freshStore();

    const promise = store.loadGuilds('world-1');
    expect(store.guildsLoading).toBe(true);
    await promise;

    expect(store.guildsLoading).toBe(false);
    expect(store.guildsError).toBeNull();
    expect(store.guilds).toHaveLength(1);
    expect(api.listWorldGuilds).toHaveBeenCalledWith('world-1');
  });

  it('records an error message when the directory fails to load', async () => {
    api.listWorldGuilds.mockReset().mockRejectedValue(new Error('network down'));
    const store = await freshStore();

    await store.loadGuilds('world-1');

    expect(store.guildsError).toBe('Could not load guilds.');
    expect(store.guilds).toEqual([]);
  });

  it('loads a guild together with its perks', async () => {
    api.getGuild.mockReset().mockResolvedValue(guildFixture());
    api.getGuildPerks
      .mockReset()
      .mockResolvedValue({ tradeCapacityBonus: 0, allowUnitSupport: false, memberCap: 10, maxActivePeaceTreaties: 1 });
    const store = await freshStore();

    await store.loadGuild('guild-1');

    expect(store.current?.id).toBe('guild-1');
    expect(store.perks?.memberCap).toBe(10);
  });

  it('derives membership and role getters for a member of the guild', async () => {
    api.getGuild.mockReset().mockResolvedValue(guildFixture());
    api.getGuildPerks.mockReset().mockResolvedValue({
      tradeCapacityBonus: 0,
      allowUnitSupport: false,
      memberCap: 10,
      maxActivePeaceTreaties: 1,
    });
    currentUserId = 'user-1';
    const store = await freshStore();
    await store.loadGuild('guild-1');

    expect(store.myMembership?.role).toBe('leader');
    expect(store.isLeader).toBe(true);
    expect(store.isOfficerOrLeader).toBe(true);
  });

  it('finds no membership for a user outside the guild', async () => {
    api.getGuild.mockReset().mockResolvedValue(guildFixture());
    api.getGuildPerks.mockReset().mockResolvedValue({
      tradeCapacityBonus: 0,
      allowUnitSupport: false,
      memberCap: 10,
      maxActivePeaceTreaties: 1,
    });
    currentUserId = 'user-3';
    const store = await freshStore();
    await store.loadGuild('guild-1');

    expect(store.myMembership).toBeNull();
    expect(store.isLeader).toBe(false);
  });

  it('prepends a newly created topic to the board', async () => {
    api.createGuildTopic.mockReset().mockResolvedValue({
      id: 'topic-1',
      guildId: 'guild-1',
      authorUserId: 'user-1',
      title: 'Raid at dawn',
      kind: 'report',
      pinned: false,
      locked: false,
      createdAt: '2026-01-03T00:00:00Z',
      posts: [],
    });
    const store = await freshStore();

    const topic = await store.createTopic('guild-1', { title: 'Raid at dawn', kind: 'report', body: 'Go!' });

    expect(topic?.id).toBe('topic-1');
    expect(store.topics[0]?.id).toBe('topic-1');
  });

  it('reloads the current guild and perks after changing the fee tier', async () => {
    api.setGuildFeeTier.mockReset().mockResolvedValue(guildFixture({ feeTier: 'gold' }));
    api.getGuildPerks
      .mockReset()
      .mockResolvedValue({ tradeCapacityBonus: 0.25, allowUnitSupport: true, memberCap: 30, maxActivePeaceTreaties: 6 });
    const store = await freshStore();

    const ok = await store.setFeeTier('guild-1', 'gold');

    expect(ok).toBe(true);
    expect(store.current?.feeTier).toBe('gold');
    expect(store.perks?.allowUnitSupport).toBe(true);
  });

  it('replaces the matching treaty in place after a response', async () => {
    const proposed: GuildTreatyResponse = {
      id: 'treaty-1',
      proposerGuildId: 'guild-1',
      targetGuildId: 'guild-2',
      status: 'proposed',
      proposedAt: '2026-01-01T00:00:00Z',
      respondedAt: null,
    };
    api.acceptGuildTreaty.mockReset().mockResolvedValue({ ...proposed, status: 'active', respondedAt: '2026-01-02T00:00:00Z' });
    const store = await freshStore();
    store.treaties = [proposed];

    await store.respondTreaty('treaty-1', true);

    expect(store.treaties).toHaveLength(1);
    expect(store.treaties[0]?.status).toBe('active');
  });

  it('surfaces the API error message when founding a guild fails', async () => {
    api.createGuild.mockReset().mockRejectedValue(new Error('name already taken'));
    const store = await freshStore();

    const result = await store.createGuild('world-1', { name: 'Bjornstad Hird', tag: 'BJH' });

    expect(result).toBeNull();
    expect(store.actionError).toBe('Could not found the guild.');
    expect(store.actionPending).toBe(false);
  });
});
