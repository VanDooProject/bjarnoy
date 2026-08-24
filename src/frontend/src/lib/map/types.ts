export type Terrain = 'sea' | 'sand' | 'grass' | 'forest' | 'mountain';

export type ResourceKind = 'wood' | 'stone' | 'food' | 'iron';

export type Resources = Record<ResourceKind, number>;

export interface Tile {
  q: number;
  r: number;
  terrain: Terrain;
  /** Settlement id that currently claims this hex, if any (Settlers II style borders). */
  ownerId?: string;
  buildingType?: 'longhouse' | 'hut' | 'farm' | 'watchtower';
  buildingLevel?: number;
}

export interface Settlement {
  id: string;
  ownerId: string;
  name: string;
  q: number;
  r: number;
  level: number;
  resources: Resources;
  rates: Resources;
  foundedAt: number;
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

export function emptyResources(): Resources {
  return { wood: 0, stone: 0, food: 0, iron: 0 };
}
