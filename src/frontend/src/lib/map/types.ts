export type Terrain = 'sea' | 'sand' | 'grass' | 'forest' | 'mountain';

/**
 * Which of the tile art pack's six camera rotations a hex renders with.
 * Mirrors `TileOrientation` in `Bjarnoy.Domain.World` — see that type for why
 * this exists (today every tile hardcodes `_SE`).
 */
export type TileOrientation = 'E' | 'NE' | 'NW' | 'W' | 'SW' | 'SE';

/** `TileOrientation` values in the same order as `neighbors()`'s direction indices. */
export const TILE_ORIENTATIONS: readonly TileOrientation[] = ['E', 'NE', 'NW', 'W', 'SW', 'SE'];

export type ResourceKind = 'wood' | 'stone' | 'food' | 'iron';

export type Resources = Record<ResourceKind, number>;

export interface Tile {
  q: number;
  r: number;
  terrain: Terrain;
  /** Sea that borders land — the ring a coastal-water sprite belongs on. */
  isCoastalWater?: boolean;
  /** Which art-pack rotation to render this hex with. */
  orientation?: TileOrientation;
  /** Which numbered variant of this terrain's tile art to use. */
  variant?: number;
  /** Settlement id that currently claims this hex, if any (Settlers II style borders). */
  ownerId?: string;
  buildingType?:
    | 'longhouse'
    | 'hut'
    | 'farm'
    | 'tower'
    | 'fishinghut'
    | 'magictower'
    | 'pumpkinfarm'
    | 'lumberjack'
    | 'quarry';
  buildingLevel?: number;
  /** True while `buildingType`/`buildingLevel` reflect a queued-but-not-yet-completed order (rendered at level 0, the foundation graphic) rather than a finished building. */
  underConstruction?: boolean;
}

export interface Settlement {
  id: string;
  ownerId: string;
  /** Display name of the player who holds it (Settlers-II-style label on the world map). */
  ownerName: string;
  name: string;
  q: number;
  r: number;
  level: number;
  resources: Resources;
  rates: Resources;
  /** Live mode only — the backend's real per-resource storage cap (`ResourcesResponse.capacity`). Undefined in demo mode, where `WorldModel.storageCapFor` remains the fallback. */
  capacity?: Resources;
  foundedAt: number;
  /** Which island (see `IslandLabel`) this settlement sits on, live mode only — used to gold-highlight the player's own island on the world map. */
  islandId?: string;
}

export interface Fleet {
  id: string;
  ownerId: string;
  fromQ: number;
  fromR: number;
  toQ: number;
  toR: number;
  departedAt: number;
  etaAt: number;
}

/**
 * A trade cart in transit between two settlements, interpolated on the
 * world map exactly like `Fleet` above (same `{from,to}Q/R` +
 * `departedAt`/`etaAt` shape, both wall-clock-comparable millisecond
 * timestamps) — see `HexMapRenderer`'s cart-rendering loop, which shares
 * that interpolation code rather than inventing a second scheme. Live mode
 * populates this straight from `ShipmentResponse`'s own frozen path
 * endpoints (`WorldModel.setCartShipments`, see `stores/world.ts`'s
 * `refreshTradeAsync`); demo mode seeds one cosmetic cart per accepted
 * offer (`WorldModel.acceptTradeOffer`).
 */
export interface CartShipment {
  id: string;
  fromQ: number;
  fromR: number;
  toQ: number;
  toR: number;
  departedAt: number;
  etaAt: number;
  cargoResource: ResourceKind;
  cargoAmount: number;
}

/** An island's name and centre, as known from the backend (live mode) — for world-map labels. */
export interface IslandLabel {
  id: string;
  name: string;
  q: number;
  r: number;
}

/** Mirrors the backend's `RiverTileShape` wire names. */
export type RiverTileShape = 'spring' | 'straight' | 'bend' | 'confluence' | 'mouth';

/**
 * A single hex of a generated river, as served by the backend (see
 * `RiverTileResponse`) — live mode only, since a river's shape depends on
 * the whole island (and its other rivers), not just the hex's own
 * coordinate, so it can't be derived client-side the way terrain/
 * orientation/variant can.
 */
export interface RiverTile {
  q: number;
  r: number;
  shape: RiverTileShape;
  inDirections: TileOrientation[];
  outDirection: TileOrientation | null;
}

export function emptyResources(): Resources {
  return { wood: 0, stone: 0, food: 0, iron: 0 };
}
