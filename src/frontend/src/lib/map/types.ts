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
  buildingType?: 'longhouse' | 'hut' | 'farm' | 'tower';
  buildingLevel?: number;
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

/** An island's name and centre, as known from the backend (live mode) — for world-map labels. */
export interface IslandLabel {
  id: string;
  name: string;
  q: number;
  r: number;
}

export function emptyResources(): Resources {
  return { wood: 0, stone: 0, food: 0, iron: 0 };
}
