import { API_BASE_URL } from '../config';
import { clientFingerprint } from '../lib/clientFingerprint';
import { checkBuildHeader } from '../lib/appUpdate';
export class ApiError extends Error {
    status;
    problem;
    /** HTTP method of the failed request — lets a load-error UI say *which* call failed. */
    method;
    /** Path (relative to API_BASE_URL) of the failed request. */
    path;
    constructor(status, problem, method, path) {
        super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`);
        this.status = status;
        this.problem = problem;
        this.method = method;
        this.path = path;
    }
}
/**
 * `fetch` rejects (TypeError) when the request never got an HTTP response at
 * all — network down, DNS, CORS. Wrapping that as an `ApiError` with status 0
 * keeps method/path attached, so callers can report it like any other failed
 * call instead of a bare "Failed to fetch".
 */
async function fetchOrThrow(method, path, init) {
    try {
        const response = await fetch(`${API_BASE_URL}${path}`, init);
        checkBuildHeader(response.headers.get('X-App-Build'));
        return response;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const wrapped = new ApiError(0, undefined, method, path);
        wrapped.message = `Network error: ${message}`;
        wrapped.cause = err;
        throw wrapped;
    }
}
/**
 * True for a 404 whose body says the *world itself* doesn't exist — see
 * `WorldEndpoints.WorldNotFoundProblem` — as opposed to a bare 404 for some
 * other reason. A caller can safely drop a stored world id on this signal
 * without risking dropping it over a transient failure.
 */
export function isWorldNotFound(err) {
    return err instanceof ApiError && err.problem?.error === 'world_not_found';
}
/**
 * Settlement counterpart to {@link isWorldNotFound} — see
 * `SettlementEndpoints.SettlementNotFoundProblem`.
 */
export function isSettlementNotFound(err) {
    return err instanceof ApiError && err.problem?.error === 'settlement_not_found';
}
// The auth store wires these three hooks up on import (see `stores/auth.ts`)
// so this module can attach the access token and react to auth failures
// without importing the store directly — a store importing `api` to make
// calls and `api` importing the store back would be circular.
export const authHooks = {
    getAccessToken: () => null,
    refreshAccessToken: async () => false,
    onAccountLocked: () => { },
};
function ownerHeader(ownerId) {
    return ownerId ? { 'X-Owner-Id': ownerId } : undefined;
}
async function request(path, init, allowRefresh = true) {
    const accessToken = authHooks.getAccessToken();
    const method = init?.method ?? 'GET';
    const res = await fetchOrThrow(method, path, {
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
        if (refreshed)
            return request(path, init, false);
    }
    if (!res.ok) {
        const problem = await res.json().catch(() => undefined);
        if (res.status === 403 && problem?.error === 'user_locked') {
            authHooks.onAccountLocked();
        }
        throw new ApiError(res.status, problem, method, path);
    }
    if (res.status === 204)
        return undefined;
    return (await res.json());
}
/**
 * `GET /worlds/{id}/fog-chunks` (map-fog-v2.md §3) — one batched, conditional
 * read of a chunk rectangle. Not `request<T>` because of the 304, which has no
 * body to parse. No 401-refresh retry either: the endpoint doesn't require a
 * JWT — anonymous play proves ownership via `ownerId` the same way the
 * mutating endpoints do — so there is no access token whose expiry this call
 * needs to react to.
 */
async function requestFogChunks(worldId, ownerId, rect, etag) {
    const accessToken = authHooks.getAccessToken();
    const path = `/worlds/${worldId}/fog-chunks?cuMin=${rect.cuMin}&cuMax=${rect.cuMax}&cvMin=${rect.cvMin}&cvMax=${rect.cvMax}`;
    const res = await fetchOrThrow('GET', path, {
        headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            ...ownerHeader(ownerId),
            ...(etag ? { 'If-None-Match': etag } : {}),
        },
    });
    if (res.status === 304)
        return { notModified: true };
    if (!res.ok) {
        const problem = await res.json().catch(() => undefined);
        throw new ApiError(res.status, problem, 'GET', path);
    }
    return { notModified: false, data: (await res.json()), etag: res.headers.get('ETag') };
}
export const api = {
    // World creation is admin-only (POST /api/v1/admin/worlds — see
    // adminCreateWorld below); this listing is the minimal public info a
    // player picks a world from, not the game-client config getWorld returns.
    listWorlds: () => request('/worlds'),
    getWorld: (worldId) => request(`/worlds/${worldId}`),
    // "Join another world": the public world picker — no auth/owner header
    // required, unlike getWorldMembership just below.
    listJoinableWorlds: () => request('/worlds/joinable'),
    // Whether `ownerId` already has a realm in `worldId` — same X-Owner-Id
    // anonymous-play ownership proof as the rest of this file's `ownerHeader`
    // calls (e.g. getFogChunks/getPlotSuggestion below). 400s without it.
    getWorldMembership: (worldId, ownerId) => request(`/worlds/${worldId}/membership`, { headers: ownerHeader(ownerId) }),
    getWorldCamps: (worldId, islandId) => request(`/worlds/${worldId}/camps${islandId ? `?islandId=${encodeURIComponent(islandId)}` : ''}`),
    getIslands: (worldId) => request(`/worlds/${worldId}/islands`),
    foundSettlement: (worldId, body) => request(`/worlds/${worldId}/settlements`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    // `ownerId` becomes the `X-Owner-Id` header the backend resolves the
    // caller's realm from (fog-gated: own settlements plus every explored
    // rival) — see CallerRealmResolver/ExploredAreaService. Omitting it (an
    // anonymous caller with no realm at all) just gets an empty list back.
    listSettlements: (worldId, ownerId) => request(`/worlds/${worldId}/settlements`, { headers: ownerHeader(ownerId) }),
    // Every standing palisade/gate hex of the rival settlements the caller has explored (their own walls excluded) — same fog rule
    // and X-Owner-Id handling as `listSettlements`, so the live client can draw, hit-test and route around other players' walls.
    listWalls: (worldId, ownerId) => request(`/worlds/${worldId}/walls`, { headers: ownerHeader(ownerId) }),
    // `ownerId` becomes the `X-Owner-Id` header the backend's ownership
    // filter reads for an anonymous (unclaimed) settlement — see
    // SettlementOwnershipEndpointFilter. Harmless to omit or send stale for a
    // claimed settlement: the backend only consults it while the settlement
    // is still owned by the anonymous-play system account, and trusts the
    // caller's JWT once it's claimed. Owner-only (403 for anyone else) — use
    // getSettlementView for a rival's settlement.
    getSettlement: (settlementId, ownerId) => request(`/settlements/${settlementId}`, { headers: ownerHeader(ownerId) }),
    // The fog-gated counterpart to getSettlement: works for any settlement
    // whose ground `ownerId`'s realm has explored (their own included), but
    // carries only identity/position/buildings — see SettlementViewResponse.
    getSettlementView: (settlementId, ownerId) => request(`/settlements/${settlementId}/view`, { headers: ownerHeader(ownerId) }),
    queueBuild: (settlementId, body, ownerId) => request(`/settlements/${settlementId}/builds`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: ownerHeader(ownerId),
    }),
    slotRune: (settlementId, runeId, body, ownerId) => request(`/settlements/${settlementId}/runes/${runeId}/slot`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: ownerHeader(ownerId),
    }),
    unslotRune: (settlementId, runeId, ownerId) => request(`/settlements/${settlementId}/runes/${runeId}/unslot`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: ownerHeader(ownerId),
    }),
    // Refunds the order's cost and, for a brand-new building, clears its
    // level-0 foundation stub (see Settlement.CancelBuild) — same ownership
    // proof as queueBuild.
    cancelBuild: (settlementId, orderId, ownerId) => request(`/settlements/${settlementId}/builds/${orderId}/cancel`, {
        method: 'POST',
        headers: ownerHeader(ownerId),
    }),
    // Owner-gated like queueBuild — same X-Owner-Id proof for an unclaimed realm.
    postTradeOffer: (settlementId, body, ownerId) => request(`/settlements/${settlementId}/trade-offers`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: ownerHeader(ownerId),
    }),
    // Owner-only (403 for anyone else) — see TradeEndpoints.Board's own
    // comment: `ownerId` proves the caller owns the *browsing* settlement,
    // not the offers on the board, which are meant to be visible to any
    // in-range settlement's owner.
    getTradeBoard: (settlementId, ownerId) => request(`/settlements/${settlementId}/trade-offers/board`, {
        headers: ownerHeader(ownerId),
    }),
    getMyTradeOffers: (settlementId, ownerId) => request(`/settlements/${settlementId}/trade-offers/mine`, {
        headers: ownerHeader(ownerId),
    }),
    getShipments: (settlementId, ownerId) => request(`/settlements/${settlementId}/shipments`, {
        headers: ownerHeader(ownerId),
    }),
    getSettlementTradeReports: (settlementId, ownerId) => request(`/settlements/${settlementId}/trade-reports`, {
        headers: ownerHeader(ownerId),
    }),
    // The acting settlement is in the body and is ownership-checked
    // server-side (RequestSettlementOwnershipEndpointFilter) — an unclaimed
    // realm proves it with X-Owner-Id, a claimed one with the JWT.
    acceptTradeOffer: (offerId, body, ownerId) => request(`/trade-offers/${offerId}/accept`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: ownerHeader(ownerId),
    }),
    // The acting settlement is in the body and is ownership-checked
    // server-side (RequestSettlementOwnershipEndpointFilter) — an unclaimed
    // realm proves it with X-Owner-Id, a claimed one with the JWT.
    cancelTradeOffer: (offerId, body, ownerId) => request(`/trade-offers/${offerId}/cancel`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: ownerHeader(ownerId),
    }),
    trainUnits: (settlementId, body, ownerId) => request(`/settlements/${settlementId}/units`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: ownerHeader(ownerId),
    }),
    holdFeast: (settlementId, ownerId) => request(`/settlements/${settlementId}/feast`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: ownerHeader(ownerId),
    }),
    claimQuest: (settlementId, questId, ownerId) => request(`/settlements/${settlementId}/quests/${encodeURIComponent(questId)}/claim`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: ownerHeader(ownerId),
    }),
    sendMessage: (body) => request('/messages', { method: 'POST', body: JSON.stringify(body) }),
    listConversations: (params) => {
        const query = new URLSearchParams();
        if (params?.page)
            query.set('page', String(params.page));
        if (params?.pageSize)
            query.set('pageSize', String(params.pageSize));
        const qs = query.toString();
        return request(`/messages/conversations${qs ? `?${qs}` : ''}`);
    },
    getConversation: (otherUserId, params) => {
        const query = new URLSearchParams();
        if (params?.page)
            query.set('page', String(params.page));
        if (params?.pageSize)
            query.set('pageSize', String(params.pageSize));
        const qs = query.toString();
        return request(`/messages/conversations/${otherUserId}${qs ? `?${qs}` : ''}`);
    },
    markConversationRead: (otherUserId) => request(`/messages/conversations/${otherUserId}/read`, { method: 'POST' }),
    reportMessage: (messageId, body) => request(`/messages/${messageId}/report`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    // Settlement expansion (issue #55): settler founding convoys ride the
    // same generic army-dispatch endpoints the troop system's backend exposes
    // (dispatchArmy/getSettlementArmies/getArmy/recallArmy below); only the
    // founding-specific retarget and renown reads are new here.
    retargetFounding: (armyId, body) => request(`/armies/${armyId}/retarget-founding`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    getRenown: (worldId) => request(`/worlds/${worldId}/renown`),
    listMySettlements: (worldId) => request(`/worlds/${worldId}/settlements/mine`),
    getProfile: (userId) => request(`/profiles/${userId}`),
    getProfileByName: (userName) => request(`/profiles/by-name/${encodeURIComponent(userName)}`),
    updateMyBio: (body) => request('/profiles/me/bio', { method: 'PUT', body: JSON.stringify(body) }),
    updateMyLocale: (body) => request('/profiles/me/locale', { method: 'PUT', body: JSON.stringify(body) }),
    reportProfile: (userId, body) => request(`/profiles/${userId}/reports`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    adminListReports: (params) => {
        const query = new URLSearchParams();
        if (params?.status)
            query.set('status', params.status);
        if (params?.sourceType)
            query.set('sourceType', params.sourceType);
        if (params?.page)
            query.set('page', String(params.page));
        if (params?.pageSize)
            query.set('pageSize', String(params.pageSize));
        const qs = query.toString();
        return request(`/admin/reports${qs ? `?${qs}` : ''}`);
    },
    adminResolveReport: (reportId, body) => request(`/admin/reports/${reportId}/resolve`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    // Public catalogue endpoint — no worldId, since the catalogue is currently
    // the same static data for every world (see `BuildingCatalogue.cs`).
    getBuildingCatalogue: () => request('/buildings'),
    // Public catalogue endpoint, same reasoning as getBuildingCatalogue above —
    // the unit roster (UnitCatalogue.cs) is static, not per-world data.
    getUnitCatalogue: () => request('/units'),
    adminListWorlds: () => request('/admin/worlds'),
    adminUpdateWorldSettings: (worldId, body) => request(`/admin/worlds/${worldId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    }),
    adminSetWorldRunState: (worldId, body) => request(`/admin/worlds/${worldId}/run-state`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    // Issue #133. Preview persists nothing; reseed destroys every settlement in
    // the world, which is why its body carries the re-typed world name.
    adminPreviewWorldSeed: (worldId, body) => request(`/admin/worlds/${worldId}/preview-seed`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    adminReviewWorldSeeds: (worldId, body) => request(`/admin/worlds/${worldId}/review-seeds`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    adminReseedWorld: (worldId, body) => request(`/admin/worlds/${worldId}/reseed`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    adminListUsers: (params) => {
        const query = new URLSearchParams();
        if (params?.search)
            query.set('search', params.search);
        if (params?.status)
            query.set('status', params.status);
        if (params?.page)
            query.set('page', String(params.page));
        if (params?.pageSize)
            query.set('pageSize', String(params.pageSize));
        const qs = query.toString();
        return request(`/admin/users${qs ? `?${qs}` : ''}`);
    },
    adminGetUser: (userId) => request(`/admin/users/${userId}`),
    adminUpdateUser: (userId, body) => request(`/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    adminSetUserStatus: (userId, body) => request(`/admin/users/${userId}/status`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    adminSetUserPremium: (userId, body) => request(`/admin/users/${userId}/premium`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    adminSearchSettlements: (params) => {
        const query = new URLSearchParams();
        if (params?.worldId)
            query.set('worldId', params.worldId);
        if (params?.owner)
            query.set('owner', params.owner);
        if (params?.page)
            query.set('page', String(params.page));
        if (params?.pageSize)
            query.set('pageSize', String(params.pageSize));
        const qs = query.toString();
        return request(`/admin/settlements${qs ? `?${qs}` : ''}`);
    },
    adminGetSettlement: (settlementId) => request(`/admin/settlements/${settlementId}`),
    adminGrantResources: (settlementId, body) => request(`/admin/settlements/${settlementId}/resources`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    adminSetBuildingLevel: (settlementId, q, r, body) => request(`/admin/settlements/${settlementId}/buildings/${q}/${r}/level`, {
        method: 'PUT',
        body: JSON.stringify(body),
    }),
    adminGrantRune: (settlementId, body) => request(`/admin/settlements/${settlementId}/runes`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    adminCompleteQueues: (settlementId, body = {}) => request(`/admin/settlements/${settlementId}/queue/complete`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    adminGetSettlementLayout: (settlementId) => request(`/admin/settlements/${settlementId}/layout`),
    adminPlaceBuilding: (settlementId, q, r, body) => request(`/admin/settlements/${settlementId}/buildings/${q}/${r}`, {
        method: 'PUT',
        body: JSON.stringify(body),
    }),
    adminRazeBuilding: (settlementId, q, r) => request(`/admin/settlements/${settlementId}/buildings/${q}/${r}`, {
        method: 'DELETE',
    }),
    adminAdjustGarrison: (settlementId, body) => request(`/admin/settlements/${settlementId}/garrison`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    adminListArmies: (params) => {
        const query = new URLSearchParams();
        if (params.worldId)
            query.set('worldId', params.worldId);
        if (params.settlementId)
            query.set('settlementId', params.settlementId);
        return request(`/admin/armies?${query.toString()}`);
    },
    adminEditArmy: (armyId, body) => request(`/admin/armies/${armyId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    }),
    adminCreateWorld: (body) => request('/admin/worlds', { method: 'POST', body: JSON.stringify(body) }),
    adminGetActivitySummary: (params) => {
        const query = new URLSearchParams({ from: params.from, to: params.to });
        if (params.bucket)
            query.set('bucket', params.bucket);
        return request(`/admin/activity/summary?${query.toString()}`);
    },
    adminListActivityUsers: (params) => {
        const query = new URLSearchParams();
        if (params?.page)
            query.set('page', String(params.page));
        if (params?.pageSize)
            query.set('pageSize', String(params.pageSize));
        if (params?.sort)
            query.set('sort', params.sort);
        const qs = query.toString();
        return request(`/admin/activity/users${qs ? `?${qs}` : ''}`);
    },
    adminGetUserActivityDetail: (userId, params) => {
        const query = new URLSearchParams({ from: params.from, to: params.to });
        return request(`/admin/activity/users/${userId}?${query.toString()}`);
    },
    // Debug API keys (docs/tech/api-keys.md). The feature catalogue is public;
    // everything else is admin-only and never callable with a key itself.
    getApiKeyFeatures: () => request('/api-keys/features'),
    adminListApiKeys: (includeInactive = false) => request(`/admin/api-keys?includeInactive=${includeInactive}`),
    adminCreateApiKey: (body) => request('/admin/api-keys', { method: 'POST', body: JSON.stringify(body) }),
    adminUpdateApiKey: (id, body) => request(`/admin/api-keys/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    adminRecreateApiKey: (id) => request(`/admin/api-keys/${id}/recreate`, { method: 'POST' }),
    adminRevokeApiKey: (id) => request(`/admin/api-keys/${id}/revoke`, { method: 'POST' }),
    adminListApiKeyRequests: (status) => request(`/admin/api-key-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`),
    adminApproveApiKeyRequest: (id, body) => request(`/admin/api-key-requests/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    adminDenyApiKeyRequest: (id) => request(`/admin/api-key-requests/${id}/deny`, { method: 'POST' }),
    // Plain authenticated user action, not admin-only — see useActivityHeartbeat.
    heartbeat: () => request('/activity/heartbeat', { method: 'POST' }),
    getLeaderboardDirectory: (worldId) => request(`/worlds/${worldId}/leaderboards`),
    getLeaderboardBoard: (worldId, scope, category, params) => {
        const query = new URLSearchParams();
        if (params?.periodStart)
            query.set('periodStart', params.periodStart);
        if (params?.afterRank)
            query.set('afterRank', String(params.afterRank));
        if (params?.pageSize)
            query.set('pageSize', String(params.pageSize));
        const qs = query.toString();
        return request(`/worlds/${worldId}/leaderboards/${scope}/${category}${qs ? `?${qs}` : ''}`);
    },
    getWeeklyStats: (worldId, userId, params) => {
        const query = new URLSearchParams();
        if (params?.cursor)
            query.set('cursor', params.cursor);
        if (params?.pageSize)
            query.set('pageSize', String(params.pageSize));
        const qs = query.toString();
        return request(`/worlds/${worldId}/stats/users/${userId}/weekly${qs ? `?${qs}` : ''}`);
    },
    // Issue #40 phase 2: dispatching/tracking armies. Mirrors ArmyEndpoints.cs's
    // routes exactly (`/settlements/{id}/armies`, `/armies/{id}`, `/armies/{id}/recall`).
    // `ownerId` is the same X-Owner-Id ownership proof queueBuild/trainUnits
    // send — ArmyEndpoints.Dispatch/Recall are gated by
    // SettlementOwnershipEndpointFilter/ArmyOwnershipEndpointFilter too.
    dispatchArmy: (settlementId, body, ownerId) => request(`/settlements/${settlementId}/armies`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: ownerHeader(ownerId),
    }),
    getSettlementArmies: (settlementId, ownerId) => request(`/settlements/${settlementId}/armies`, { headers: ownerHeader(ownerId) }),
    getArmy: (armyId, ownerId) => request(`/armies/${armyId}`, { headers: ownerHeader(ownerId) }),
    recallArmy: (armyId, ownerId) => request(`/armies/${armyId}/recall`, { method: 'POST', headers: ownerHeader(ownerId) }),
    // The host's recall of a guest army stationed at its settlement. Mirrors
    // ArmyEndpoints.cs's `/settlements/{id}/guests/{armyId}/send-home`: 204, no
    // body — the guest's full ArmyResponse is owner-only. `ownerId` proves the
    // *host* settlement's ownership.
    sendGuestHome: (settlementId, armyId, ownerId) => request(`/settlements/${settlementId}/guests/${armyId}/send-home`, {
        method: 'POST',
        headers: ownerHeader(ownerId),
    }),
    // Issue #156 phase 1: sends an army already out in the field onward to a
    // new hex — 'move on' if it's standing, 'append goal' if it's still
    // travelling. Mirrors ArmyEndpoints.cs's `/armies/{id}/orders`.
    fieldOrderArmy: (armyId, body, ownerId) => request(`/armies/${armyId}/orders`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: ownerHeader(ownerId),
    }),
    // Issue #40 phase 4: the host's read-only view of who is currently
    // supporting this settlement. Mirrors ArmyEndpoints.cs's
    // `/settlements/{id}/guests`.
    // `ownerId` proves either the host settlement's ownership (full guest
    // list) or a listed guest army's own home-settlement ownership (that
    // guest only) — see ArmyEndpoints.ListGuestArmies.
    getSettlementGuests: (settlementId, ownerId) => request(`/settlements/${settlementId}/guests`, { headers: ownerHeader(ownerId) }),
    // Issue #40 phase 3: battle reports. Mirrors ArmyEndpoints.cs's
    // `/reports/{reportId}` and `/settlements/{settlementId}/reports` — the
    // latter is a flat newest-first list, not paged (BattleReportService has
    // no pagination), so the reports store just holds it as-is. `ownerId`
    // proves ownership of either the attacking or the defending settlement —
    // ReportOwnershipEndpointFilter accepts either.
    getReport: (reportId, ownerId) => request(`/reports/${reportId}`, { headers: ownerHeader(ownerId) }),
    getSettlementReports: (settlementId, ownerId) => request(`/settlements/${settlementId}/reports`, { headers: ownerHeader(ownerId) }),
    // Issue #206: field battle reports (in-flight interception). Mirrors
    // ArmyEndpoints.cs's `/field-reports/{reportId}` and
    // `/settlements/{settlementId}/field-reports` — same flat, unpaged shape
    // and same either-party `ownerId` rule as the battle-report endpoints above.
    getFieldReport: (reportId, ownerId) => request(`/field-reports/${reportId}`, { headers: ownerHeader(ownerId) }),
    getSettlementFieldReports: (settlementId, ownerId) => request(`/settlements/${settlementId}/field-reports`, {
        headers: ownerHeader(ownerId),
    }),
    // Wildlife camp fights (hunt / ambush / tower attack) — `ArmyEndpoints`' camp-report routes.
    getCampReport: (reportId, ownerId) => request(`/camp-reports/${reportId}`, { headers: ownerHeader(ownerId) }),
    getSettlementCampReports: (settlementId, ownerId) => request(`/settlements/${settlementId}/camp-reports`, { headers: ownerHeader(ownerId) }),
    getMyLeaderboardRank: (worldId, scope, category, params) => {
        const query = new URLSearchParams();
        if (params?.radius)
            query.set('radius', String(params.radius));
        if (params?.subjectId)
            query.set('subjectId', params.subjectId);
        const qs = query.toString();
        return request(`/worlds/${worldId}/leaderboards/${scope}/${category}/me${qs ? `?${qs}` : ''}`);
    },
    listWorldGuilds: (worldId) => request(`/worlds/${worldId}/guilds`),
    createGuild: (worldId, body) => request(`/worlds/${worldId}/guilds`, { method: 'POST', body: JSON.stringify(body) }),
    getGuild: (guildId) => request(`/guilds/${guildId}`),
    getGuildCaps: (guildId) => request(`/guilds/${guildId}/caps`),
    joinGuild: (guildId) => request(`/guilds/${guildId}/join`, { method: 'POST' }),
    leaveGuild: (guildId) => request(`/guilds/${guildId}/leave`, { method: 'POST' }),
    kickGuildMember: (guildId, userId) => request(`/guilds/${guildId}/members/${userId}/kick`, { method: 'POST' }),
    setGuildMemberRole: (guildId, userId, body) => request(`/guilds/${guildId}/members/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify(body),
    }),
    listGuildTopics: (guildId) => request(`/guilds/${guildId}/board/topics`),
    createGuildTopic: (guildId, body) => request(`/guilds/${guildId}/board/topics`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    getGuildTopic: (guildId, topicId) => request(`/guilds/${guildId}/board/topics/${topicId}`),
    replyToGuildTopic: (guildId, topicId, body) => request(`/guilds/${guildId}/board/topics/${topicId}/posts`, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    listGuildTreaties: (guildId) => request(`/guilds/${guildId}/treaties`),
    proposeGuildTreaty: (guildId, body) => request(`/guilds/${guildId}/treaties`, { method: 'POST', body: JSON.stringify(body) }),
    acceptGuildTreaty: (treatyId) => request(`/treaties/${treatyId}/accept`, { method: 'POST' }),
    rejectGuildTreaty: (treatyId) => request(`/treaties/${treatyId}/reject`, { method: 'POST' }),
    breakGuildTreaty: (treatyId) => request(`/treaties/${treatyId}/break`, { method: 'POST' }),
    // Issue #40 phase 7: the premium fight simulator. `PremiumUserEndpointFilter`
    // returns 401 (unauthenticated) or 403 `{ error: "premium_required" }`
    // (authenticated but not premium) — both surface as an `ApiError` here,
    // same as any other rejection; SimulatorView.vue is what gives the latter
    // its own friendly copy instead of showing raw problem text.
    simulate: (body) => request('/simulator', { method: 'POST', body: JSON.stringify(body) }),
    // The requesting player's fog-of-war mask for a rectangle of 64x64-texel
    // chunks (map-fog-v2.md §2.2/§3), one batched conditional call per viewport.
    // `ownerId` is required, not optional like the mutating endpoints' —
    // GetWorldFogChunks 400s without it, since there is no "public" fog mask
    // the way there's a public settlement list. Pass the previous response's
    // `etag` for the same rectangle to get a body-less 304 when nothing changed.
    getFogChunks: (worldId, ownerId, rect, etag) => requestFogChunks(worldId, ownerId, rect, etag),
    // The backend-owned plot suggestion (see PlotReservationService): pinned
    // per `ownerId` across reloads, held with a short exclusive reservation.
    // `ownerId` is required, same reasoning as getFogChunks's own.
    getPlotSuggestion: (worldId, ownerId) => request(`/worlds/${worldId}/plot-suggestion`, {
        headers: { ...ownerHeader(ownerId), 'X-Client-Fingerprint': clientFingerprint() },
    }),
    releasePlotSuggestion: (worldId, ownerId) => request(`/worlds/${worldId}/plot-suggestion`, {
        method: 'DELETE',
        headers: ownerHeader(ownerId),
    }),
};
