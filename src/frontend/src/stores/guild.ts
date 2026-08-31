import { defineStore } from 'pinia';
import { ApiError, api } from '../api/client';
import type {
  CreateGuildRequest,
  CreateGuildTopicRequest,
  GuildBoardTopicResponse,
  GuildFeeTier,
  GuildPerksResponse,
  GuildResponse,
  GuildRole,
  GuildTreatyResponse,
} from '../api/types';
import { useAuthStore } from './auth';

export const useGuildStore = defineStore('guild', {
  state: () => ({
    worldId: null as string | null,
    guilds: [] as GuildResponse[],
    guildsLoading: false,
    guildsError: null as string | null,

    current: null as GuildResponse | null,
    currentLoading: false,
    currentError: null as string | null,
    perks: null as GuildPerksResponse | null,

    topics: [] as GuildBoardTopicResponse[],
    topicsLoading: false,
    topicsError: null as string | null,

    activeTopic: null as GuildBoardTopicResponse | null,
    activeTopicLoading: false,
    activeTopicError: null as string | null,

    treaties: [] as GuildTreatyResponse[],
    treatiesLoading: false,
    treatiesError: null as string | null,

    // One flag/error pair for every mutating action below: none of them run
    // concurrently from the UI, so a single pair is enough and keeps the
    // template simple (compare `leaderboard.ts`'s per-resource pairs, which
    // exist because those loads genuinely can overlap).
    actionPending: false,
    actionError: null as string | null,
  }),
  getters: {
    myMembership(state) {
      const auth = useAuthStore();
      if (!state.current || !auth.user) return null;
      return state.current.members.find((m) => m.userId === auth.user!.id) ?? null;
    },
    isLeader(): boolean {
      return this.myMembership?.role === 'leader';
    },
    isOfficerOrLeader(): boolean {
      return this.myMembership?.role === 'leader' || this.myMembership?.role === 'officer';
    },
  },
  actions: {
    async loadGuilds(worldId: string) {
      this.worldId = worldId;
      this.guildsLoading = true;
      this.guildsError = null;
      try {
        this.guilds = await api.listWorldGuilds(worldId);
      } catch (err) {
        this.guildsError = err instanceof ApiError ? err.message : 'Could not load guilds.';
      } finally {
        this.guildsLoading = false;
      }
    },
    /** Loads a guild's detail and its current perks/caps together. */
    async loadGuild(guildId: string) {
      this.currentLoading = true;
      this.currentError = null;
      this.current = null;
      this.perks = null;
      try {
        const [guild, perks] = await Promise.all([api.getGuild(guildId), api.getGuildPerks(guildId)]);
        this.current = guild;
        this.perks = perks;
      } catch (err) {
        this.currentError = err instanceof ApiError ? err.message : 'Could not load this guild.';
      } finally {
        this.currentLoading = false;
      }
    },
    async createGuild(worldId: string, body: CreateGuildRequest): Promise<GuildResponse | null> {
      this.actionPending = true;
      this.actionError = null;
      try {
        return await api.createGuild(worldId, body);
      } catch (err) {
        this.actionError = err instanceof ApiError ? err.message : 'Could not found the guild.';
        return null;
      } finally {
        this.actionPending = false;
      }
    },
    async join(guildId: string): Promise<boolean> {
      this.actionPending = true;
      this.actionError = null;
      try {
        await api.joinGuild(guildId);
        return true;
      } catch (err) {
        this.actionError = err instanceof ApiError ? err.message : 'Could not join this guild.';
        return false;
      } finally {
        this.actionPending = false;
      }
    },
    async leave(guildId: string): Promise<boolean> {
      this.actionPending = true;
      this.actionError = null;
      try {
        await api.leaveGuild(guildId);
        this.current = null;
        return true;
      } catch (err) {
        this.actionError = err instanceof ApiError ? err.message : 'Could not leave this guild.';
        return false;
      } finally {
        this.actionPending = false;
      }
    },
    async kick(guildId: string, userId: string): Promise<boolean> {
      this.actionPending = true;
      this.actionError = null;
      try {
        await api.kickGuildMember(guildId, userId);
        await this.loadGuild(guildId);
        return true;
      } catch (err) {
        this.actionError = err instanceof ApiError ? err.message : 'Could not remove that member.';
        return false;
      } finally {
        this.actionPending = false;
      }
    },
    async setRole(guildId: string, userId: string, role: GuildRole): Promise<boolean> {
      this.actionPending = true;
      this.actionError = null;
      try {
        await api.setGuildMemberRole(guildId, userId, { role });
        await this.loadGuild(guildId);
        return true;
      } catch (err) {
        this.actionError = err instanceof ApiError ? err.message : 'Could not change that role.';
        return false;
      } finally {
        this.actionPending = false;
      }
    },
    async setFeeTier(guildId: string, feeTier: GuildFeeTier): Promise<boolean> {
      this.actionPending = true;
      this.actionError = null;
      try {
        this.current = await api.setGuildFeeTier(guildId, { feeTier });
        this.perks = await api.getGuildPerks(guildId);
        return true;
      } catch (err) {
        this.actionError = err instanceof ApiError ? err.message : 'Could not change the fee tier.';
        return false;
      } finally {
        this.actionPending = false;
      }
    },
    async payFee(guildId: string): Promise<boolean> {
      this.actionPending = true;
      this.actionError = null;
      try {
        await api.payGuildFee(guildId);
        await this.loadGuild(guildId);
        return true;
      } catch (err) {
        this.actionError = err instanceof ApiError ? err.message : 'Could not pay the fee.';
        return false;
      } finally {
        this.actionPending = false;
      }
    },
    async loadTopics(guildId: string) {
      this.topicsLoading = true;
      this.topicsError = null;
      try {
        this.topics = await api.listGuildTopics(guildId);
      } catch (err) {
        this.topicsError = err instanceof ApiError ? err.message : 'Could not load the board.';
      } finally {
        this.topicsLoading = false;
      }
    },
    async loadTopic(guildId: string, topicId: string) {
      this.activeTopicLoading = true;
      this.activeTopicError = null;
      this.activeTopic = null;
      try {
        this.activeTopic = await api.getGuildTopic(guildId, topicId);
      } catch (err) {
        this.activeTopicError = err instanceof ApiError ? err.message : 'Could not load this topic.';
      } finally {
        this.activeTopicLoading = false;
      }
    },
    async createTopic(guildId: string, body: CreateGuildTopicRequest): Promise<GuildBoardTopicResponse | null> {
      this.actionPending = true;
      this.actionError = null;
      try {
        const topic = await api.createGuildTopic(guildId, body);
        this.topics = [topic, ...this.topics];
        return topic;
      } catch (err) {
        this.actionError = err instanceof ApiError ? err.message : 'Could not start that topic.';
        return null;
      } finally {
        this.actionPending = false;
      }
    },
    async reply(guildId: string, topicId: string, body: string): Promise<boolean> {
      this.actionPending = true;
      this.actionError = null;
      try {
        await api.replyToGuildTopic(guildId, topicId, { body });
        await this.loadTopic(guildId, topicId);
        return true;
      } catch (err) {
        this.actionError = err instanceof ApiError ? err.message : 'Could not post that reply.';
        return false;
      } finally {
        this.actionPending = false;
      }
    },
    async loadTreaties(guildId: string) {
      this.treatiesLoading = true;
      this.treatiesError = null;
      try {
        this.treaties = await api.listGuildTreaties(guildId);
      } catch (err) {
        this.treatiesError = err instanceof ApiError ? err.message : 'Could not load treaties.';
      } finally {
        this.treatiesLoading = false;
      }
    },
    async proposeTreaty(guildId: string, targetGuildId: string): Promise<boolean> {
      this.actionPending = true;
      this.actionError = null;
      try {
        const treaty = await api.proposeGuildTreaty(guildId, { targetGuildId });
        this.treaties = [treaty, ...this.treaties];
        return true;
      } catch (err) {
        this.actionError = err instanceof ApiError ? err.message : 'Could not propose that treaty.';
        return false;
      } finally {
        this.actionPending = false;
      }
    },
    async respondTreaty(treatyId: string, accept: boolean): Promise<boolean> {
      this.actionPending = true;
      this.actionError = null;
      try {
        const updated = accept ? await api.acceptGuildTreaty(treatyId) : await api.rejectGuildTreaty(treatyId);
        this.treaties = this.treaties.map((t) => (t.id === treatyId ? updated : t));
        return true;
      } catch (err) {
        this.actionError = err instanceof ApiError ? err.message : 'Could not respond to that treaty.';
        return false;
      } finally {
        this.actionPending = false;
      }
    },
    async breakTreaty(treatyId: string): Promise<boolean> {
      this.actionPending = true;
      this.actionError = null;
      try {
        const updated = await api.breakGuildTreaty(treatyId);
        this.treaties = this.treaties.map((t) => (t.id === treatyId ? updated : t));
        return true;
      } catch (err) {
        this.actionError = err instanceof ApiError ? err.message : 'Could not break that treaty.';
        return false;
      } finally {
        this.actionPending = false;
      }
    },
  },
});
