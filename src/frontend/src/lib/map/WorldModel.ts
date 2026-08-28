// Plain (non-reactive) game-state container. Deliberately outside Vue's
// reactivity: Vue's proxy-based reactivity walks and wraps every property it
// sees, which is fine for a handful of HUD numbers but pathological for a
// tile map that can span thousands of hexes as the camera roams. The
// renderer reads this directly every frame; Vue components only ever see
// small, explicitly-copied summaries (see stores/world.ts).
import { coordKey, hexDistance, hexesInRadius, type AxialCoord } from '../hex/coords';
import { generateTile } from './worldGenerator';
import { emptyResources, type Fleet, type IslandLabel, type Resources, type Settlement, type Tile } from './types';

const BASE_BORDER_RADIUS = 2;
// zip 9: "unexplored hexes are hidden; scouted but not currently-visible
// hexes are greyed out" — three distinct rings, not two. Ownership only ever
// reaches borderRadius, visibleHexes (line-of-sight) reaches one hex further,
// and explored reaches further still so there's an actual ring of greyed-out
// scouted terrain between the clear realm and the hidden unknown, instead of
// unexplored starting immediately at the border.
const FOG_SCOUT_RING = 3;
// Border-anchoring (docs/design decision: "Border radius grows with
// longhouse level and with border-anchoring buildings (watchtower)"). A
// tower can only be placed inside the settlement's existing border (see the
// hexDistance guard in placeBuilding), so claiming a ring around it only
// ever pushes the border outward in whichever direction the tower faces —
// the settlement's owned-tile silhouette stops being a pure hex and gains a
// bump wherever a tower sits near the edge.
const TOWER_CLAIM_RADIUS = 1;

export class WorldModel {
  readonly seed: number;
  private tiles = new Map<string, Tile>();
  private settlements = new Map<string, Settlement>();
  private fleets = new Map<string, Fleet>();
  private explored = new Set<string>();
  private lastTick = performance.now();
  /** Islands known from the backend (live mode only) — id, name, and centre, for world-map labels. */
  private islands: IslandLabel[] = [];

  constructor(seed = 1) {
    this.seed = seed;
  }

  /** Live mode: island names/centres fetched from the backend (see `stores/world.ts`). */
  setIslands(islands: IslandLabel[]) {
    this.islands = islands;
  }

  listIslands(): IslandLabel[] {
    return this.islands;
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

  foundSettlement(ownerId: string, ownerName: string, name: string, at: AxialCoord): Settlement {
    const id = `stl_${ownerId}_${Date.now().toString(36)}`;
    return this.registerSettlement({
      id,
      ownerId,
      ownerName,
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
    }
    for (const c of hexesInRadius(at, this.exploredRadius(settlement))) {
      this.explored.add(coordKey(c));
    }
    return settlement;
  }

  getSettlement(id: string): Settlement | undefined {
    return this.settlements.get(id);
  }

  /**
   * How many buildings a settlement has standing (the longhouse itself
   * counts as one, placed by `registerSettlement`/`foundSettlement`) — used
   * by the landing page's guided onboarding (zip 6a: place 2 more buildings
   * before onboarding is considered complete) instead of tracking a
   * separate counter that could drift from what's actually on the ground.
   */
  countBuildings(settlementId: string): number {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return 0;
    let count = 0;
    for (const c of hexesInRadius({ q: settlement.q, r: settlement.r }, this.borderRadius(settlement))) {
      if (this.getTile(c.q, c.r).ownerId === settlementId && this.getTile(c.q, c.r).buildingType) count++;
    }
    return count;
  }

  listSettlements(): Settlement[] {
    return [...this.settlements.values()];
  }

  /**
   * Issue #16: "the pop(ulation) thing should also be implemented like with
   * the other ressources" (current/max + a rate). Neither the backend
   * (`Bjarnoy.Domain`) nor the legacy game models a population field at
   * all, so rather than invent a server-side stat this derives a plausible
   * current/max/rate purely from what the client already knows — the
   * longhouse level and how many buildings are standing — the same inputs
   * `countBuildings` already uses for onboarding. `max` is housing capacity
   * (longhouse level + each building adds a little room), `current` grows
   * toward it as buildings are worked, and `rate` is how fast it's still
   * climbing (0 once capacity is reached, matching how the other resource
   * rates read 0 at their storage cap).
   */
  populationFor(settlementId: string): { current: number; max: number; rate: number } {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return { current: 0, max: 0, rate: 0 };
    const buildings = this.countBuildings(settlementId);
    const max = 20 + settlement.level * 15 + buildings * 5;
    const current = Math.min(max, 10 + settlement.level * 8 + buildings * 4);
    const rate = current < max ? Math.max(1, Math.round((max - current) * 0.2)) : 0;
    return { current, max, rate };
  }

  /**
   * Issue #16 header: the reference shows each resource pill with a
   * "current / cap" and a fill-progress underline, but no storage-cap field
   * exists anywhere in the data model (`Resources`, `Settlement`, the
   * backend) — same gap `populationFor` hit for population. Rather than
   * leave the pills capless, this derives a plausible per-resource cap the
   * same way: purely client-side, from the longhouse level, using a
   * different base per resource so the caps read as varied (as in the
   * reference: wood/stone/food/iron aren't all the same number) rather than
   * one flat value repeated four times.
   */
  storageCapFor(settlementId: string): Resources {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) return emptyResources();
    const growth = 1 + settlement.level * 0.5;
    return {
      wood: Math.round(2000 * growth),
      stone: Math.round(2000 * growth),
      food: Math.round(2400 * growth),
      iron: Math.round(1000 * growth),
    };
  }

  borderRadius(settlement: Settlement): number {
    return BASE_BORDER_RADIUS + Math.floor(settlement.level / 2);
  }

  /** Hexes visible right now (line-of-sight radius around a settlement). */
  visibleHexes(settlement: Settlement): Set<string> {
    const radius = this.borderRadius(settlement) + 1;
    return new Set(hexesInRadius({ q: settlement.q, r: settlement.r }, radius).map(coordKey));
  }

  /**
   * Hexes that get marked "ever scouted" once claimed/leveled — wider than
   * visibleHexes so a ring of greyed-out fog actually renders beyond it.
   * Public so HexMapRenderer can frame the initial camera wide enough to
   * show a real margin of white (unexplored) fog past this ring, rather
   * than a zoom level tight enough to hide it entirely.
   */
  exploredRadius(settlement: Settlement): number {
    return this.borderRadius(settlement) + FOG_SCOUT_RING;
  }

  /** Hexes ever scouted — greyed out (not live) once out of sight. */
  isExplored(q: number, r: number): boolean {
    return this.explored.has(coordKey({ q, r }));
  }

  /**
   * For an unexplored hex, how many hex-steps past the nearest settlement's
   * scouted ring (`exploredRadius`) it sits. Used by the renderer to fade
   * the unexplored fog in gradually from the ring's edge instead of a hard
   * white wall, so terrain drawn underneath (still true, just never
   * scouted) reads as a mist rolling in rather than a sudden cutoff.
   * 0 right past the ring, growing outward; Infinity with no settlements.
   */
  distanceBeyondExplored(q: number, r: number): number {
    let min = Infinity;
    for (const settlement of this.settlements.values()) {
      const d = hexDistance({ q: settlement.q, r: settlement.r }, { q, r }) - this.exploredRadius(settlement);
      if (d < min) min = d;
    }
    return min === Infinity ? Infinity : Math.max(0, min);
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
      }
      for (const c of hexesInRadius({ q: settlement.q, r: settlement.r }, this.exploredRadius(settlement))) {
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
    if (type === 'tower') {
      for (const c of hexesInRadius(at, TOWER_CLAIM_RADIUS)) {
        const claimed = this.getTile(c.q, c.r);
        if (!claimed.ownerId) claimed.ownerId = settlementId;
      }
    }
    return true;
  }

  /**
   * Issue #16 ring menu "tear down": demo-mode only — the backend
   * (`Bjarnoy.Domain.Buildings`) has no raze endpoint yet, so live mode
   * disables this action rather than pretending to support it (see
   * SettlementView.vue's ring-menu wiring). Clears the building but leaves
   * the hex claimed by the settlement.
   */
  razeBuilding(settlementId: string, at: AxialCoord): boolean {
    const tile = this.getTile(at.q, at.r);
    if (tile.ownerId !== settlementId || !tile.buildingType || tile.buildingType === 'longhouse') return false;
    tile.buildingType = undefined;
    tile.buildingLevel = undefined;
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
