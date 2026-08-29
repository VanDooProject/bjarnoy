import { API_BASE_URL } from '../config';
import type {
  AdminUserDetailResponse,
  AdminUserResponse,
  AdminWorldResponse,
  BuildingDefinitionResponse,
  CreateWorldRequest,
  FoundSettlementRequest,
  GrantResourcesRequest,
  IslandResponse,
  LeaderboardBoardResponse,
  LeaderboardCategory,
  LeaderboardDirectoryResponse,
  LeaderboardMeResponse,
  LeaderboardScope,
  WeeklyStatsPageResponse,
  PagedAdminSettlementsResponse,
  PagedAdminUsersResponse,
  PagedReportsResponse,
  ProblemDetails,
  ProfileResponse,
  QueueBuildRequest,
  ReportProfileRequest,
  ReportResponse,
  ResolveReportRequest,
  SetBuildingLevelRequest,
  SetUserStatusRequest,
  SetWorldRunStateRequest,
  SettlementResponse,
  SettlementSummary,
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
  queueBuild: (settlementId: string, body: QueueBuildRequest) =>
    request<unknown>(`/settlements/${settlementId}/builds`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  trainUnits: (settlementId: string, body: TrainUnitsRequest) =>
    request<TrainingOrderResponse>(`/settlements/${settlementId}/units`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
};
