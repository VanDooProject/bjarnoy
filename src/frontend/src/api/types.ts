// Mirrors src/backend/src/Bjarnoy.Api/Contracts/*.cs. Kept hand-written and
// minimal (only the fields the frontend actually reads/sends) rather than
// generated, since there is no OpenAPI-typed-client step wired up yet
// (docs/tech/backend.md mentions `openapi-typescript` as the intended path).

export interface WorldResponse {
  id: string;
  name: string;
  seed: number;
  radius: number;
  maxPlayers: number;
  status: string;
  islandCount: number;
  createdAt: string;
  joinable: boolean;
  joinableReason: string;
  startsAt: string | null;
  endbossTriggered: boolean;
}

export interface TileCoordinate {
  q: number;
  r: number;
}

/** Mirrors `RiverTileResponse` — see that record's own doc comments for field semantics. */
export interface RiverTileResponse {
  q: number;
  r: number;
  shape: 'spring' | 'straight' | 'bend' | 'confluence' | 'mouth';
  inDirections: string[];
  outDirection: string | null;
}

export interface IslandResponse {
  id: string;
  index: number;
  name: string;
  q: number;
  r: number;
  tileCount: number;
  startPositions: TileCoordinate[];
  riverTiles: RiverTileResponse[];
}

export interface ResourceLine {
  wood: number;
  stone: number;
  food: number;
  iron: number;
}

export interface ResourcesResponse {
  stock: ResourceLine;
  ratePerHour: ResourceLine;
  capacity: ResourceLine;
}

export interface PlacedBuildingResponse {
  q: number;
  r: number;
  type: string;
  level: number;
  /** Which art-pack rotation to render with — set only for a building whose art has a fixed connection to something around it (e.g. the fishing hut's dock). */
  orientation?: string | null;
}

export interface BuildOrderResponse {
  id: string;
  q: number;
  r: number;
  building: string;
  targetLevel: number;
  completesAtGameTime: string;
  completesInSeconds: number | null;
}

export interface WorldClockResponse {
  state: string;
  running: boolean;
  acceptsCommands: boolean;
  gameTime: string;
}

export interface SettlementResponse {
  id: string;
  worldId: string;
  islandId: string;
  name: string;
  ownerName: string;
  q: number;
  r: number;
  longhouseLevel: number;
  claimRadius: number;
  resources: ResourcesResponse;
  buildings: PlacedBuildingResponse[];
  queue: BuildOrderResponse[];
  world: WorldClockResponse;
}

export interface SettlementSummary {
  id: string;
  name: string;
  ownerName: string;
  q: number;
  r: number;
  longhouseLevel: number;
}

export interface CreateWorldRequest {
  name: string;
  seed?: number;
  radius?: number;
  maxPlayers?: number;
}

export interface FoundSettlementRequest {
  islandId: string;
  q: number;
  r: number;
  name: string;
  ownerName: string;
  /** Stable local player id (see `stores/player.ts`); one settlement per id per world. */
  ownerId: string;
}

export interface QueueBuildRequest {
  building: string;
  q: number;
  r: number;
}

// Mirrors src/backend/src/Bjarnoy.Api/Contracts/AuthContracts.cs.

export interface RegisterRequest {
  userName: string;
  password: string;
  /** The local player id (`stablePlayerId()` in `stores/player.ts`), so any settlement founded under it gets claimed. */
  existingOwnerId?: string | null;
}

export interface LoginRequest {
  userName: string;
  password: string;
}

export interface UserResponse {
  id: string;
  userName: string;
  role: string;
  status: string;
  displayName: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserResponse;
}

// Mirrors src/backend/src/Bjarnoy.Api/Contracts/AdminWorldContracts.cs.

export interface AdminWorldResponse {
  id: string;
  name: string;
  status: string;
  maxPlayers: number;
  playerCount: number;
  speedFactor: number;
  startsAt: string | null;
  joinsClosed: boolean;
  endbossAt: string | null;
  endbossTriggeredAt: string | null;
  runState: string;
  runStateSince: string;
  createdAt: string;
}

/**
 * All fields optional: only send what should change. `startsAt`/`endbossAt`
 * are omitted from the request body (not sent as `null`) when left
 * unchanged — send explicit `null` to clear them, matching the backend's
 * `Optional<T>` PATCH semantics (see `Bjarnoy.Api.Json.Optional`).
 */
export interface UpdateWorldSettingsRequest {
  speedFactor?: number;
  startsAt?: string | null;
  joinsClosed?: boolean;
  endbossAt?: string | null;
}

/** `action`: one of `pause`, `maintenance`, `lock`, `resume`. */
export interface SetWorldRunStateRequest {
  action: string;
  graceMinutes?: number;
}

// Mirrors src/backend/src/Bjarnoy.Api/Contracts/AdminUserContracts.cs.

export interface AdminUserResponse {
  id: string;
  userName: string;
  displayName: string | null;
  role: string;
  status: string;
  statusReason: string | null;
  statusChangedAt: string | null;
  settlementCount: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserSettlementSummary {
  id: string;
  worldId: string;
  worldName: string;
  name: string;
}

export interface AdminUserDetailResponse {
  id: string;
  userName: string;
  displayName: string | null;
  role: string;
  status: string;
  statusReason: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  settlements: AdminUserSettlementSummary[];
}

export interface PagedAdminUsersResponse {
  items: AdminUserResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/** All fields optional: only send what should change. */
export interface UpdateAdminUserRequest {
  displayName?: string;
  role?: string;
}

/** `status`: one of `active`, `locked`, `banned`. */
export interface SetUserStatusRequest {
  status: string;
  reason?: string;
}

// Mirrors src/backend/src/Bjarnoy.Api/Contracts/AdminSettlementContracts.cs.

export interface AdminSettlementSummary {
  id: string;
  worldId: string;
  worldName: string;
  name: string;
  ownerName: string;
  q: number;
  r: number;
  longhouseLevel: number;
}

export interface PagedAdminSettlementsResponse {
  items: AdminSettlementSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/** Signed deltas; a negative value removes resources. Omitted components default to 0. */
export interface GrantResourcesRequest {
  wood?: number;
  stone?: number;
  food?: number;
  iron?: number;
}

export interface SetBuildingLevelRequest {
  level: number;
}

// Mirrors src/backend/src/Bjarnoy.Api/Contracts/ProfileContracts.cs.

export interface ProfileResponse {
  id: string;
  userName: string;
  displayName: string | null;
  /** Plain text with significant whitespace (ASCII art) — render escaped, `white-space: pre`. */
  bio: string | null;
  createdAt: string;
  settlementCount: number;
}

/** `bio: null` (or empty) clears the bio. */
export interface UpdateBioRequest {
  bio: string | null;
}

export interface ReportProfileRequest {
  reason: string;
  note?: string | null;
}

export interface ProfileReportResponse {
  id: string;
  reporterUserId: string;
  reporterUserName: string;
  reportedUserId: string;
  reportedUserName: string;
  reason: string;
  note: string | null;
  /** One of `pending`, `reviewed`, `dismissed`, `actioned`. */
  status: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface PagedProfileReportsResponse {
  items: ProfileReportResponse[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/** `status`: one of `pending`, `reviewed`, `dismissed`, `actioned`. */
export interface ResolveProfileReportRequest {
  status: string;
}

export interface ProblemDetails {
  title?: string;
  detail?: string;
  status?: number;
  /**
   * Machine-readable rejection reason, present on FoundSettlement's 409s —
   * see `Bjarnoy.Infrastructure.Services.FoundingRejection`. Several distinct
   * rejections (AlreadyFounded, PlotTaken, TooCloseToNeighbour, ...) share
   * the same 409 status but call for very different frontend reactions, so
   * this is what actually distinguishes them.
   */
  rejection?: string;
}

// Mirrors src/backend/src/Bjarnoy.Api/Contracts/LeaderboardContracts.cs.

export type LeaderboardScope = 'user' | 'settlement' | 'guild';

export type LeaderboardCategory =
  | 'score'
  | 'biggestSettlement'
  | 'weeklyScoreGained'
  | 'weeklyFightsWon'
  | 'weeklyFightsLost'
  | 'weeklyResourcesLooted'
  | 'biggestArmy';

/**
 * `reason` is set only when `available` is false — one of `noBattleSystemYet`,
 * `noArmySystemYet`, `noGuildSystemYet`, `noWeeklyWindowsYet`, `notComputedYet`,
 * or `unknownBoard` (issue #43 §5).
 */
export interface LeaderboardBoardInfoResponse {
  scope: LeaderboardScope;
  category: LeaderboardCategory;
  available: boolean;
  reason: string | null;
  computedAt: string | null;
  entryCount: number | null;
}

export interface WeeklyWindowResponse {
  periodStart: string;
  periodEnd: string;
}

export interface LeaderboardDirectoryResponse {
  boards: LeaderboardBoardInfoResponse[];
  weeklyWindows: WeeklyWindowResponse[];
}

/** `delta`: `previousRank` minus `rank` — positive means the subject moved up. `null` for a new entrant. */
export interface LeaderboardEntryResponse {
  rank: number;
  subjectId: string;
  subjectName: string;
  value: number;
  previousRank: number | null;
  delta: number | null;
}

export interface LeaderboardBoardResponse {
  scope: LeaderboardScope;
  category: LeaderboardCategory;
  available: boolean;
  reason: string | null;
  isFinal: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  computedAt: string | null;
  items: LeaderboardEntryResponse[];
  nextAfterRank: number | null;
}

export interface LeaderboardMeResponse {
  myRank: number;
  items: LeaderboardEntryResponse[];
}

/** A single (building type, level) entry from the tech-tree catalogue — see `GET /api/v1/buildings`. */
export interface BuildingDefinitionResponse {
  type: string;
  level: number;
  cost: ResourceLine;
  buildSeconds: number;
  productionPerHour: ResourceLine;
  storageCapacity: ResourceLine;
  /** Empty both for "any land" and for a requiresCoastalWater building — check that flag first. */
  allowedTerrain: string[];
  /** Placed on shallow (coastal) water instead of any land terrain — see BuildingDefinition.RequiresCoastalWater. */
  requiresCoastalWater: boolean;
  requiredLonghouseLevel: number;
}
