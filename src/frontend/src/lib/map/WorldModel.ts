// Plain (non-reactive) game-state container. Deliberately outside Vue's
// reactivity: Vue's proxy-based reactivity walks and wraps every property it
// sees, which is fine for a handful of HUD numbers but pathological for a
// tile map that can span thousands of hexes as the camera roams. The
// renderer reads this directly every frame; Vue components only ever see
// small, explicitly-copied summaries (see stores/world.ts).
import { coordKey, hexDistance, hexesInRadius, type AxialCoord } from '../hex/coords';
import { generateTile } from './worldGenerator';
import type { Fleet, Resources, Settlement, Tile } from './types';

const BASE_BORDER_RADIUS = 2;

export class WorldModel {
  readonly seed: number;
  private tiles = new Map<string, Tile>();
  private settlements = new Map<string, Settlement>();
  private fleets = new Map<string, Fleet>();
  private explored = new Set<string>();
  private lastTick = performance.now();

  constructor(seed = 1) {
    this.seed = seed;
  }

  getTile(q: number, r: number): Tile {
    const k = coordKey({ q, r });
    let tile = this.tiles.get(k);
    if (!tile) {
      tile = generateTile(q, r, { seed: this.seed });
      this.tiles.set(k, tile);
    }
    return tile;
  }

  /** Inclusive axial rectangle, used by the renderer's viewport cull. */
  getTilesInRect(qMin: number, qMax: number, rMin: number, rMax: number): Tile[] {
    const out: Tile[] = [];
    for (let q = qMin; q <= qMax; q++) {
      for (let r = rMin; r <= rMax; r++) {
        out.push(this.getTile(q, r));
      }
    }
    return out;
  }

  isLand(q: number, r: number): boolean {
    return this.getTile(q, r).terrain !== 'sea';
  }

  findLandfall(near: AxialCoord, maxRadius = 40): AxialCoord | null {
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (const c of hexesInRadius(near, radius)) {
        if (this.isLand(c.q, c.r)) return c;
      }
    }
    return null;
  }

  foundSettlement(ownerId: string, name: string, at: AxialCoord): Settlement {
    const id = `stl_${ownerId}_${Date.now().toString(36)}`;
    return this.registerSettlement({
      id,
      ownerId,
      name,
      q: at.q,
      r: at.r,
      level: 1,
      resources: { wood: 400, stone: 300, food: 500, iron: 100 },
      rates: { wood: 60, stone: 45, food: 90, iron: 20 },
      foundedAt: Date.now(),
    });
  }

  /**
   * Registers a fully-formed settlement — used when the backend (not this
   * client) is the source of truth for identity and starting stock (live
   * mode; see `stores/world.ts`). Claims its border hexes exactly like
   * `foundSettlement`, which delegates here for the demo-mode case.
   */
  registerSettlement(settlement: Settlement): Settlement {
    this.settlements.set(settlement.id, settlement);
    const at = { q: settlement.q, r: settlement.r };
    const home = this.getTile(at.q, at.r);
    home.ownerId = settlement.id;
    home.buildingType = 'longhouse';
    home.buildingLevel = 1;
    for (const c of hexesInRadius(at, this.borderRadius(settlement))) {
      const tile = this.getTile(c.q, c.r);
      if (!tile.ownerId) tile.ownerId = settlement.id;
      this.explored.add(coordKey(c));
    }
    return settlement;
  }

  getSettlement(id: string): Settlement | undefined {
    return this.settlements.get(id);
  }

  listSettlements(): Settlement[] {
    return [...this.settlements.values()];
  }

  borderRadius(settlement: Settlement): number {
    return BASE_BORDER_RADIUS + Math.floor(settlement.level / 2);
  }

  /** Hexes visible right now (line-of-sight radius around a settlement). */
  visibleHexes(settlement: Settlement): Set<string> {
    const radius = this.borderRadius(settlement) + 1;
    return new Set(hexesInRadius({ q: settlement.q, r: settlement.r }, radius).map(coordKey));
  }

  /** Hexes ever scouted — greyed out (not live) once out of sight. */
  isExplored(q: number, r: number): boolean {
    return this.explored.has(coordKey({ q, r }));
  }

  /**
   * Applies a settlement snapshot fetched from the backend (live mode; see
   * `stores/world.ts`) — resources/rate/level and any buildings the queue has
   * completed since the last poll. Only building types the frontend has art
   * for are placed on their hex; the rest are silently skipped rather than
   * risking a texture lookup failure (see `lib/map/textures.ts`).
   */
  applyServerSnapshot(
    settlementId: string,
    snapshot: {
      level: number;
      resources: Resources;
      rates: Resources;
      buildings: { q: number; r: number; type: string; level: number }[];
    },
  ) {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return;

    if (snapshot.level > settlement.level) {
      settlement.level = snapshot.level;
      for (const c of hexesInRadius({ q: settlement.q, r: settlement.r }, this.borderRadius(settlement))) {
        const tile = this.getTile(c.q, c.r);
        if (!tile.ownerId) tile.ownerId = settlementId;
        this.explored.add(coordKey(c));
      }
    }
    settlement.resources = snapshot.resources;
    settlement.rates = snapshot.rates;

    const RENDERABLE_TYPES = new Set(['longhouse', 'farm', 'tower']);
    for (const building of snapshot.buildings) {
      if (!RENDERABLE_TYPES.has(building.type)) continue;
      const tile = this.getTile(building.q, building.r);
      tile.ownerId = settlementId;
      tile.buildingType = building.type as Tile['buildingType'];
      tile.buildingLevel = building.level;
    }
  }

  placeBuilding(settlementId: string, at: AxialCoord, type: Tile['buildingType']): boolean {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return false;
    if (hexDistance({ q: settlement.q, r: settlement.r }, at) > this.borderRadius(settlement)) {
      return false;
    }
    const tile = this.getTile(at.q, at.r);
    if (tile.terrain === 'sea' || tile.buildingType) return false;
    tile.ownerId = settlementId;
    tile.buildingType = type;
    tile.buildingLevel = 1;
    return true;
  }

  addFleet(fleet: Fleet) {
    this.fleets.set(fleet.id, fleet);
  }

  listFleets(): Fleet[] {
    const now = Date.now();
    for (const [id, fleet] of this.fleets) {
      if (fleet.etaAt < now - 5000) this.fleets.delete(id);
    }
    return [...this.fleets.values()];
  }

  /** Advances resource stockpiles by elapsed real time. Call from a game loop, not from Vue. */
  tick(nowMs = performance.now()) {
    const dtHours = (nowMs - this.lastTick) / 1000 / 3600;
    this.lastTick = nowMs;
    if (dtHours <= 0) return;
    for (const settlement of this.settlements.values()) {
      const res = settlement.resources;
      const rate = settlement.rates;
      res.wood += rate.wood * dtHours;
      res.stone += rate.stone * dtHours;
      res.food += rate.food * dtHours;
      res.iron += rate.iron * dtHours;
    }
  }
}
