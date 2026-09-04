import { API_BASE_URL } from '../config';
import type {
  AcceptTradeOfferRequest,
  ActivitySummaryResponse,
  AdjustGarrisonRequest,
  AdminArmyResponse,
  AdminEditArmyRequest,
  AdminSettlementLayoutResponse,
  AdminUserActivityDetailResponse,
  AdminUserDetailResponse,
  AdminUserResponse,
  AdminWorldResponse,
  ArmyResponse,
  ArmySummary,
  BattleReportResponse,
  BuildingDefinitionResponse,
  CancelTradeOfferRequest,
  CompleteQueuesRequest,
  CompleteQueuesResponse,
  CreateGuildPostRequest,
  CreateGuildRequest,
  CreateGuildTopicRequest,
  CreateWorldRequest,
  DispatchArmyRequest,
  FieldOrderRequest,
  FoundSettlementRequest,
  GrantResourcesRequest,
  GrantRuneRequest,
  GuestArmySummary,
  GuildBoardTopicResponse,
  GuildMemberResponse,
  GuildPerksResponse,
  GuildResponse,
  GuildTreatyResponse,
  IslandResponse,
  LeaderboardBoardResponse,
  PagedAdminActivityUsersResponse,
  LeaderboardCategory,
  LeaderboardDirectoryResponse,
  LeaderboardMeResponse,
  LeaderboardScope,
  WeeklyStatsPageResponse,
  MarkReadResponse,
  MessageResponse,
  PagedAdminSettlementsResponse,
  PagedAdminUsersResponse,
  PreviewWorldSeedRequest,
  ReseedWorldRequest,
  ReseedWorldResponse,
  WorldSeedPreviewResponse,
  PagedConversationsResponse,
  PagedMessagesResponse,
  PagedReportsResponse,
  PlaceBuildingRequest,
  PostTradeOfferRequest,
  ProblemDetails,
  ProfileResponse,
  ProposeTreatyRequest,
  QueueBuildRequest,
  RenownResponse,
  ReportMessageRequest,
  ReportProfileRequest,
  ReportResponse,
  ResolveReportRequest,
  RetargetFoundingRequest,
  SendMessageRequest,
  SetBuildingLevelRequest,
  SetGuildFeeTierRequest,
  SetGuildMemberRoleRequest,
  SetUserPremiumRequest,
  SetUserStatusRequest,
  SetWorldRunStateRequest,
  SettlementResponse,
  SlotRuneRequest,
  SettlementSummary,
  ShipmentResponse,
  SimulatorRequest,
  SimulatorResponse,
  TradeAcceptResponse,
  TradeOfferResponse,
  TradeReportResponse,
  TrainingOrderResponse,
  TrainUnitsRequest,
  UnitDefinitionResponse,
  UpdateAdminUserRequest,
  UpdateBioRequest,
  UpdateWorldSettingsRequest,
  WorldResponse,
} from './types';

export class ApiError extends Error {
  status: number;
  problem: ProblemDetails | undefined;

  constructor(status: number, problem: ProblemDetails | undefined) {
    super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`);
    this.status = status;
    this.problem = problem;
  }
}

// The auth store wires these three hooks up on import (see `stores/auth.ts`)
// so this module can attach the access token and react to auth failures
// without importing the store directly — a store importing `api` to make
// calls and `api` importing the store back would be circular.
export const authHooks: {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<boolean>;
  onAccountLocked: () => void;
} = {
  getAccessToken: () => null,
  refreshAccessToken: async () => false,
  onAccountLocked: () => {},
};

function ownerHeader(ownerId?: string): HeadersInit | undefined {
  return ownerId ? { 'X-Owner-Id': ownerId } : undefined;
}

async function request<T>(path: string, init?: RequestInit, allowRefresh = true): Promise<T> {
  const accessToken = authHooks.getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });

  // A 401 on an authenticated call means the access token has expired (they
  // are short-lived by design). Try the refresh token once and, if that
  // works, retry this same call exactly once more — never a loop.
  if (res.status === 401 && allowRefresh && accessToken) {
    const refreshed = await authHooks.refreshAccessToken();
    if (refreshed) return request<T>(path, init, false);
  }

  if (!res.ok) {
    const problem = await res.json().catch(() => undefined);
    if (res.status === 403 && (problem as { error?: string } | undefined)?.error === 'user_locked') {
      authHooks.onAccountLocked();
    }
    throw new ApiError(res.status, problem);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface ImageBitmapResponse {
  bitmap: ImageBitmap;
  /** The response's `ETag` header, if any — the fog mask endpoint's version id (map-fog-v2.md §3). */
  version: string | null;
}

/**
 * Fetches a binary (non-JSON) response and decodes it as an `ImageBitmap` —
 * the fog mask endpoint's `image/png` body, per `map-fog-v2.md` §2.2/§3.
 * `createImageBitmap` decodes off the main thread, same reasoning §1d gives
 * for picking PNG over JSON in the first place. No 401-refresh retry (unlike
 * `request<T>`): the fog mask endpoint doesn't require a JWT — anonymous play
 * proves ownership via `ownerId` the same way the mutating endpoints do — so
 * there is no access token whose expiry this call needs to react to.
 */
async function requestImageBitmap(path: string, ownerId?: string): Promise<ImageBitmapResponse> {
  const accessToken = authHooks.getAccessToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...ownerHeader(ownerId),
    },
  });

  if (!res.ok) {
    const problem = await res.json().catch(() => undefined);
    throw new ApiError(res.status, problem);
  }

  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  return { bitmap, version: res.headers.get('ETag') };
}

export const api = {
  listWorlds: () => request<WorldResponse[]>('/worlds'),
  createWorld: (body: CreateWorldRequest) =>
    request<WorldResponse>('/worlds', { method: 'POST', body: JSON.stringify(body) }),
  getWorld: (worldId: string) => request<WorldResponse>(`/worlds/${worldId}`),
  getIslands: (worldId: string) => request<IslandResponse[]>(`/worlds/${worldId}/islands`),
  foundSettlement: (worldId: string, body: FoundSettlementRequest) =>
    request<SettlementResponse>(`/worlds/${worldId}/settlements`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listSettlements: (worldId: string) =>
    request<SettlementSummary[]>(`/worlds/${worldId}/settlements`),
  getSettlement: (settlementId: string) =>
    request<SettlementResponse>(`/settlements/${settlementId}`),
  // `ownerId` becomes the `X-Owner-Id` header the backend's ownership
  // filter reads for an anonymous (unclaimed) settlement — see
  // SettlementOwnershipEndpointFilter. Harmless to omit or send stale for a
  // claimed settlement: the backend only consults it while the settlement
  // is still owned by the anonymous-play system account, and trusts the
  // caller's JWT once it's claimed.
  queueBuild: (settlementId: string, body: QueueBuildRequest, ownerId?: string) =>
    request<unknown>(`/settlements/${settlementId}/builds`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: ownerHeader(ownerId),
    }),
  slotRune: (settlementId: string, runeId: string, body: SlotRuneRequest, ownerId?: string) =>
    request<SettlementResponse>(`/settlements/${settlementId}/runes/${runeId}/slot`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: ownerHeader(ownerId),
    }),
  unslotRune: (settlementId: string, runeId: string, ownerId?: string) =>
    request<SettlementResponse>(`/settlements/${settlementId}/runes/${runeId}/unslot`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: ownerHeader(ownerId),
    }),
  // Refunds the order's cost and, for a brand-new building, clears its
  // level-0 foundation stub (see Settlement.CancelBuild) — same ownership
  // proof as queueBuild.
  cancelBuild: (settlementId: string, orderId: string, ownerId?: string) =>
    request<unknown>(`/settlements/${settlementId}/builds/${orderId}/cancel`, {
      method: 'POST',
      headers: ownerHeader(ownerId),
    }),
  postTradeOffer: (settlementId: string, body: PostTradeOfferRequest) =>
    request<TradeOfferResponse>(`/settlements/${settlementId}/trade-offers`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getTradeBoard: (settlementId: string) =>
    request<TradeOfferResponse[]>(`/settlements/${settlementId}/trade-offers/board`),
  getMyTradeOffers: (settlementId: string) =>
    request<TradeOfferResponse[]>(`/settlements/${settlementId}/trade-offers/mine`),
  getShipments: (settlementId: string) =>
    request<ShipmentResponse[]>(`/settlements/${settlementId}/shipments`),
  getSettlementTradeReports: (settlementId: string) =>
    request<TradeReportResponse[]>(`/settlements/${settlementId}/trade-reports`),
  acceptTradeOffer: (offerId: string, body: AcceptTradeOfferRequest) =>
    request<TradeAcceptResponse>(`/trade-offers/${offerId}/accept`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  cancelTradeOffer: (offerId: string, body: CancelTradeOfferRequest) =>
    request<TradeOfferResponse>(`/trade-offers/${offerId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  trainUnits: (settlementId: string, body: TrainUnitsRequest, ownerId?: string) =>
    request<TrainingOrderResponse>(`/settlements/${settlementId}/units`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: ownerHeader(ownerId),
    }),
  sendMessage: (body: SendMessageRequest) =>
    request<MessageResponse>('/messages', { method: 'POST', body: JSON.stringify(body) }),
  listConversations: (params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request<PagedConversationsResponse>(`/messages/conversations${qs ? `?${qs}` : ''}`);
  },
  getConversation: (otherUserId: string, params?: { page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request<PagedMessagesResponse>(`/messages/conversations/${otherUserId}${qs ? `?${qs}` : ''}`);
  },
  markConversationRead: (otherUserId: string) =>
    request<MarkReadResponse>(`/messages/conversations/${otherUserId}/read`, { method: 'POST' }),
  reportMessage: (messageId: string, body: ReportMessageRequest) =>
    request<ReportResponse>(`/messages/${messageId}/report`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Settlement expansion (issue #55): settler-crew founding convoys ride the
  // same generic army-dispatch endpoints the troop system's backend exposes
  // (dispatchArmy/getSettlementArmies/getArmy/recallArmy below); only the
  // founding-specific retarget and renown reads are new here.
  retargetFounding: (armyId: string, body: RetargetFoundingRequest) =>
    request<ArmyResponse>(`/armies/${armyId}/retarget-founding`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getRenown: (worldId: string) => request<RenownResponse>(`/worlds/${worldId}/renown`),
  listMySettlements: (worldId: string) =>
    request<SettlementSummary[]>(`/worlds/${worldId}/settlements/mine`),
  getProfile: (userId: string) => request<ProfileResponse>(`/profiles/${userId}`),
  getProfileByName: (userName: string) =>
    request<ProfileResponse>(`/profiles/by-name/${encodeURIComponent(userName)}`),
  updateMyBio: (body: UpdateBioRequest) =>
    request<ProfileResponse>('/profiles/me/bio', { method: 'PUT', body: JSON.stringify(body) }),
  reportProfile: (userId: string, body: ReportProfileRequest) =>
    request<ReportResponse>(`/profiles/${userId}/reports`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminListReports: (params?: { status?: string; sourceType?: string; page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.sourceType) query.set('sourceType', params.sourceType);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request<PagedReportsResponse>(`/admin/reports${qs ? `?${qs}` : ''}`);
  },
  adminResolveReport: (reportId: string, body: ResolveReportRequest) =>
    request<ReportResponse>(`/admin/reports/${reportId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Public catalogue endpoint — no worldId, since the catalogue is currently
  // the same static data for every world (see `BuildingCatalogue.cs`).
  getBuildingCatalogue: () => request<BuildingDefinitionResponse[]>('/buildings'),
  // Public catalogue endpoint, same reasoning as getBuildingCatalogue above —
  // the unit roster (UnitCatalogue.cs) is static, not per-world data.
  getUnitCatalogue: () => request<UnitDefinitionResponse[]>('/units'),
  adminListWorlds: () => request<AdminWorldResponse[]>('/admin/worlds'),
  adminUpdateWorldSettings: (worldId: string, body: UpdateWorldSettingsRequest) =>
    request<AdminWorldResponse>(`/admin/worlds/${worldId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  adminSetWorldRunState: (worldId: string, body: SetWorldRunStateRequest) =>
    request<AdminWorldResponse>(`/admin/worlds/${worldId}/run-state`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Issue #133. Preview persists nothing; reseed destroys every settlement in
  // the world, which is why its body carries the re-typed world name.
  adminPreviewWorldSeed: (worldId: string, body: PreviewWorldSeedRequest) =>
    request<WorldSeedPreviewResponse>(`/admin/worlds/${worldId}/preview-seed`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminReseedWorld: (worldId: string, body: ReseedWorldRequest) =>
    request<ReseedWorldResponse>(`/admin/worlds/${worldId}/reseed`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminListUsers: (params?: { search?: string; status?: string; page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request<PagedAdminUsersResponse>(`/admin/users${qs ? `?${qs}` : ''}`);
  },
  adminGetUser: (userId: string) => request<AdminUserDetailResponse>(`/admin/users/${userId}`),
  adminUpdateUser: (userId: string, body: UpdateAdminUserRequest) =>
    request<AdminUserResponse>(`/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  adminSetUserStatus: (userId: string, body: SetUserStatusRequest) =>
    request<AdminUserResponse>(`/admin/users/${userId}/status`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminSetUserPremium: (userId: string, body: SetUserPremiumRequest) =>
    request<AdminUserResponse>(`/admin/users/${userId}/premium`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminSearchSettlements: (params?: { worldId?: string; owner?: string; page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.worldId) query.set('worldId', params.worldId);
    if (params?.owner) query.set('owner', params.owner);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request<PagedAdminSettlementsResponse>(`/admin/settlements${qs ? `?${qs}` : ''}`);
  },
  adminGetSettlement: (settlementId: string) =>
    request<SettlementResponse>(`/admin/settlements/${settlementId}`),
  adminGrantResources: (settlementId: string, body: GrantResourcesRequest) =>
    request<SettlementResponse>(`/admin/settlements/${settlementId}/resources`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminSetBuildingLevel: (settlementId: string, q: number, r: number, body: SetBuildingLevelRequest) =>
    request<SettlementResponse>(`/admin/settlements/${settlementId}/buildings/${q}/${r}/level`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  adminGrantRune: (settlementId: string, body: GrantRuneRequest) =>
    request<SettlementResponse>(`/admin/settlements/${settlementId}/runes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminCompleteQueues: (settlementId: string, body: CompleteQueuesRequest = {}) =>
    request<CompleteQueuesResponse>(`/admin/settlements/${settlementId}/queue/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminGetSettlementLayout: (settlementId: string) =>
    request<AdminSettlementLayoutResponse>(`/admin/settlements/${settlementId}/layout`),
  adminPlaceBuilding: (settlementId: string, q: number, r: number, body: PlaceBuildingRequest) =>
    request<SettlementResponse>(`/admin/settlements/${settlementId}/buildings/${q}/${r}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  adminRazeBuilding: (settlementId: string, q: number, r: number) =>
    request<SettlementResponse>(`/admin/settlements/${settlementId}/buildings/${q}/${r}`, {
      method: 'DELETE',
    }),
  adminAdjustGarrison: (settlementId: string, body: AdjustGarrisonRequest) =>
    request<SettlementResponse>(`/admin/settlements/${settlementId}/garrison`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminListArmies: (params: { worldId?: string; settlementId?: string }) => {
    const query = new URLSearchParams();
    if (params.worldId) query.set('worldId', params.worldId);
    if (params.settlementId) query.set('settlementId', params.settlementId);
    return request<AdminArmyResponse[]>(`/admin/armies?${query.toString()}`);
  },
  adminEditArmy: (armyId: string, body: AdminEditArmyRequest) =>
    request<AdminArmyResponse>(`/admin/armies/${armyId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  adminCreateWorld: (body: CreateWorldRequest) =>
    request<AdminWorldResponse>('/admin/worlds', { method: 'POST', body: JSON.stringify(body) }),
  adminGetActivitySummary: (params: { from: string; to: string; bucket?: 'day' | 'hour' }) => {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    if (params.bucket) query.set('bucket', params.bucket);
    return request<ActivitySummaryResponse>(`/admin/activity/summary?${query.toString()}`);
  },
  adminListActivityUsers: (params?: { page?: number; pageSize?: number; sort?: string }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.sort) query.set('sort', params.sort);
    const qs = query.toString();
    return request<PagedAdminActivityUsersResponse>(`/admin/activity/users${qs ? `?${qs}` : ''}`);
  },
  adminGetUserActivityDetail: (userId: string, params: { from: string; to: string }) => {
    const query = new URLSearchParams({ from: params.from, to: params.to });
    return request<AdminUserActivityDetailResponse>(`/admin/activity/users/${userId}?${query.toString()}`);
  },
  // Plain authenticated user action, not admin-only — see useActivityHeartbeat.
  heartbeat: () => request<void>('/activity/heartbeat', { method: 'POST' }),
  getLeaderboardDirectory: (worldId: string) =>
    request<LeaderboardDirectoryResponse>(`/worlds/${worldId}/leaderboards`),
  getLeaderboardBoard: (
    worldId: string,
    scope: LeaderboardScope,
    category: LeaderboardCategory,
    params?: { periodStart?: string; afterRank?: number; pageSize?: number },
  ) => {
    const query = new URLSearchParams();
    if (params?.periodStart) query.set('periodStart', params.periodStart);
    if (params?.afterRank) query.set('afterRank', String(params.afterRank));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request<LeaderboardBoardResponse>(
      `/worlds/${worldId}/leaderboards/${scope}/${category}${qs ? `?${qs}` : ''}`,
    );
  },
  getWeeklyStats: (worldId: string, userId: string, params?: { cursor?: string; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return request<WeeklyStatsPageResponse>(`/worlds/${worldId}/stats/users/${userId}/weekly${qs ? `?${qs}` : ''}`);
  },
  // Issue #40 phase 2: dispatching/tracking armies. Mirrors ArmyEndpoints.cs's
  // routes exactly (`/settlements/{id}/armies`, `/armies/{id}`, `/armies/{id}/recall`).
  // `ownerId` is the same X-Owner-Id ownership proof queueBuild/trainUnits
  // send — ArmyEndpoints.Dispatch/Recall are gated by
  // SettlementOwnershipEndpointFilter/ArmyOwnershipEndpointFilter too.
  dispatchArmy: (settlementId: string, body: DispatchArmyRequest, ownerId?: string) =>
    request<ArmyResponse>(`/settlements/${settlementId}/armies`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: ownerHeader(ownerId),
    }),
  getSettlementArmies: (settlementId: string) =>
    request<ArmySummary[]>(`/settlements/${settlementId}/armies`),
  getArmy: (armyId: string) => request<ArmyResponse>(`/armies/${armyId}`),
  recallArmy: (armyId: string, ownerId?: string) =>
    request<ArmyResponse>(`/armies/${armyId}/recall`, { method: 'POST', headers: ownerHeader(ownerId) }),
  // Issue #156 phase 1: sends an army already out in the field onward to a
  // new hex — 'move on' if it's standing, 'append goal' if it's still
  // travelling. Mirrors ArmyEndpoints.cs's `/armies/{id}/orders`.
  fieldOrderArmy: (armyId: string, body: FieldOrderRequest, ownerId?: string) =>
    request<ArmyResponse>(`/armies/${armyId}/orders`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: ownerHeader(ownerId),
    }),
  // Issue #40 phase 4: the host's read-only view of who is currently
  // supporting this settlement. Mirrors ArmyEndpoints.cs's
  // `/settlements/{id}/guests`.
  getSettlementGuests: (settlementId: string) =>
    request<GuestArmySummary[]>(`/settlements/${settlementId}/guests`),
  // Issue #40 phase 3: battle reports. Mirrors ArmyEndpoints.cs's
  // `/reports/{reportId}` and `/settlements/{settlementId}/reports` — the
  // latter is a flat newest-first list, not paged (BattleReportService has
  // no pagination), so the reports store just holds it as-is.
  getReport: (reportId: string) => request<BattleReportResponse>(`/reports/${reportId}`),
  getSettlementReports: (settlementId: string) =>
    request<BattleReportResponse[]>(`/settlements/${settlementId}/reports`),
  getMyLeaderboardRank: (
    worldId: string,
    scope: LeaderboardScope,
    category: LeaderboardCategory,
    params?: { radius?: number; subjectId?: string },
  ) => {
    const query = new URLSearchParams();
    if (params?.radius) query.set('radius', String(params.radius));
    if (params?.subjectId) query.set('subjectId', params.subjectId);
    const qs = query.toString();
    return request<LeaderboardMeResponse>(
      `/worlds/${worldId}/leaderboards/${scope}/${category}/me${qs ? `?${qs}` : ''}`,
    );
  },
  listWorldGuilds: (worldId: string) => request<GuildResponse[]>(`/worlds/${worldId}/guilds`),
  createGuild: (worldId: string, body: CreateGuildRequest) =>
    request<GuildResponse>(`/worlds/${worldId}/guilds`, { method: 'POST', body: JSON.stringify(body) }),
  getGuild: (guildId: string) => request<GuildResponse>(`/guilds/${guildId}`),
  getGuildPerks: (guildId: string) => request<GuildPerksResponse>(`/guilds/${guildId}/perks`),
  joinGuild: (guildId: string) =>
    request<GuildMemberResponse>(`/guilds/${guildId}/join`, { method: 'POST' }),
  leaveGuild: (guildId: string) => request<unknown>(`/guilds/${guildId}/leave`, { method: 'POST' }),
  kickGuildMember: (guildId: string, userId: string) =>
    request<unknown>(`/guilds/${guildId}/members/${userId}/kick`, { method: 'POST' }),
  setGuildMemberRole: (guildId: string, userId: string, body: SetGuildMemberRoleRequest) =>
    request<GuildMemberResponse>(`/guilds/${guildId}/members/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  setGuildFeeTier: (guildId: string, body: SetGuildFeeTierRequest) =>
    request<GuildResponse>(`/guilds/${guildId}/fee-tier`, { method: 'PUT', body: JSON.stringify(body) }),
  payGuildFee: (guildId: string) =>
    request<GuildMemberResponse>(`/guilds/${guildId}/fee-payment`, { method: 'POST' }),
  listGuildTopics: (guildId: string) => request<GuildBoardTopicResponse[]>(`/guilds/${guildId}/board/topics`),
  createGuildTopic: (guildId: string, body: CreateGuildTopicRequest) =>
    request<GuildBoardTopicResponse>(`/guilds/${guildId}/board/topics`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getGuildTopic: (guildId: string, topicId: string) =>
    request<GuildBoardTopicResponse>(`/guilds/${guildId}/board/topics/${topicId}`),
  replyToGuildTopic: (guildId: string, topicId: string, body: CreateGuildPostRequest) =>
    request<unknown>(`/guilds/${guildId}/board/topics/${topicId}/posts`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listGuildTreaties: (guildId: string) => request<GuildTreatyResponse[]>(`/guilds/${guildId}/treaties`),
  proposeGuildTreaty: (guildId: string, body: ProposeTreatyRequest) =>
    request<GuildTreatyResponse>(`/guilds/${guildId}/treaties`, { method: 'POST', body: JSON.stringify(body) }),
  acceptGuildTreaty: (treatyId: string) =>
    request<GuildTreatyResponse>(`/treaties/${treatyId}/accept`, { method: 'POST' }),
  rejectGuildTreaty: (treatyId: string) =>
    request<GuildTreatyResponse>(`/treaties/${treatyId}/reject`, { method: 'POST' }),
  breakGuildTreaty: (treatyId: string) =>
    request<GuildTreatyResponse>(`/treaties/${treatyId}/break`, { method: 'POST' }),
  // Issue #40 phase 7: the premium fight simulator. `PremiumUserEndpointFilter`
  // returns 401 (unauthenticated) or 403 `{ error: "premium_required" }`
  // (authenticated but not premium) — both surface as an `ApiError` here,
  // same as any other rejection; SimulatorView.vue is what gives the latter
  // its own friendly copy instead of showing raw problem text.
  simulate: (body: SimulatorRequest) =>
    request<SimulatorResponse>('/simulator', { method: 'POST', body: JSON.stringify(body) }),
  // The requesting player's fog-of-war mask (map-fog-v2.md §2.2/§3) as a
  // decoded ImageBitmap. `ownerId` is required, not optional like the
  // mutating endpoints' — GetWorldFogMask 400s without it, since there is no
  // "public" fog mask the way there's a public settlement list.
  getFogMask: (worldId: string, ownerId: string) => requestImageBitmap(`/worlds/${worldId}/fog-mask`, ownerId),
};
