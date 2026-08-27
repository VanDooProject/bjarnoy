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
}

export interface TileCoordinate {
  q: number;
  r: number;
}

export interface IslandResponse {
  id: string;
  index: number;
  name: string;
  q: number;
  r: number;
  tileCount: number;
  startPositions: TileCoordinate[];
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
