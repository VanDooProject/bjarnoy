export type Terrain = 'sea' | 'sand' | 'grass' | 'forest' | 'mountain';

/**
 * Which of the tile art pack's six camera rotations a hex renders with.
 * Mirrors `TileOrientation` in `Bjarnoy.Domain.World` — see that type for why
 * this exists (today every tile hardcodes `_SE`).
 */
export type TileOrientation = 'E' | 'NE' | 'NW' | 'W' | 'SW' | 'SE';

/** `TileOrientation` values in the same order as `neighbors()`'s direction indices. */
export const TILE_ORIENTATIONS: readonly TileOrientation[] = ['E', 'NE', 'NW', 'W', 'SW', 'SE'];

/**
 * A direction's own screen edge under this renderer's isometric projection
 * — verified against `isoTopPoints`/`isoGridPosition` (see
 * `docs/design/river-generation.md`'s "Art pack orientation convention" for
 * the full derivation): direction index `d`'s shared border with that
 * neighbour is polygon edge `(3 - d) mod 6`, not edge `d` — the projection
 * reflects, it doesn't just relabel. (No standalone helper for that
 * formula — every call site below only ever needs its self-inverse, folded
 * directly into each derivation.)
 *
 * Every `rivertile_*` art file is pixel-verified to touch the two polygon
 * edges *adjacent to* its own filename index, not the index itself — edges
 * `D-1` and `D+1` (mod 6) for the `bend`/`spring` families' rotation
 * convention. Converting those edges back to directions via the edge
 * formula above (self-inverse) gives the direction pair a file numbered `D`
 * actually renders: `{ (2-D) mod 6, (4-D) mod 6 }`. Solving that for the
 * `D` a given direction pair needs is `D = (2 - anchor) mod 6`, for whichever
 * direction `anchor` is not offset by the other transformation.
 */
function bendFileIndexFor(anchor: number): number {
  return (2 - anchor + 6) % 6;
}

/**
 * The art pack's bend asset is one fixed curve, camera-rotated six ways. A
 * bend tile's `(inDirection, outDirection)` pair is always 2 orientation
 * indices apart (see `RiverGenerator.TracePath`'s 120°-turn exclusion) —
 * `anchor` is whichever of the two the other is `+2` from, and
 * `bendFileIndexFor` derives the actual art file that pair needs (see that
 * function and `docs/design/river-generation.md`'s "Art pack orientation
 * convention" for why the file index isn't `anchor` itself).
 */
export function bendOrientationOf(inDirection: TileOrientation, outDirection: TileOrientation): TileOrientation {
  const inIndex = TILE_ORIENTATIONS.indexOf(inDirection);
  const outIndex = TILE_ORIENTATIONS.indexOf(outDirection);
  const anchor = (inIndex + 2) % 6 === outIndex ? inIndex : outIndex;
  return TILE_ORIENTATIONS[bendFileIndexFor(anchor)];
}

/**
 * The `spring` family's pond touches exactly one edge (its only outflow) —
 * pixel-verified to be file index `D`'s edge `D-1`, the same rotation
 * convention `bendFileIndexFor` uses but resolved for a single direction
 * instead of a pair: `edgeOf`'s inverse of `D-1` is `(4-D) mod 6`, so the
 * file a given `outDirection` needs is `D = (4 - outIndex) mod 6`.
 */
export function springOrientationOf(outDirection: TileOrientation): TileOrientation {
  const outIndex = TILE_ORIENTATIONS.indexOf(outDirection);
  return TILE_ORIENTATIONS[(4 - outIndex + 6) % 6];
}

/**
 * The `straight` family (also used for `mouth`) touches an opposite edge
 * pair, pixel-verified as file index `D`'s edges `D+1` and `D+4` — so a file
 * index and its own `+3` touch the *same* edge pair (opposite pairs are
 * 180°-symmetric) and either direction of a straight/mouth tile's flow can
 * be solved for the same way: `D = (2 - index) mod 6`.
 */
export function straightOrientationOf(direction: TileOrientation): TileOrientation {
  const index = TILE_ORIENTATIONS.indexOf(direction);
  return TILE_ORIENTATIONS[(2 - index + 6) % 6];
}

/**
 * A `Mouth` tile has no `outDirection` (it's the end of the walk, not a
 * turn) — but it still needs to visually flow *toward the sea*, and the
 * sea neighbour isn't necessarily geometrically opposite the inflow the
 * way `straightOrientationOf` assumes (`RiverGenerator.TracePath` stops the
 * walk as soon as any neighbour is sea, regardless of the angle that lands
 * at). `seaDirection` — the caller's own lookup of which neighbour is
 * actually sea, since a `RiverTile` doesn't carry terrain — decides which
 * asset can represent that angle: 3 apart (opposite) is `straight`'s native
 * case; 2 apart is bend-representable via `bendOrientationOf`, same as an
 * ordinary mid-river turn; 1 apart (120°) is unrepresentable by either
 * family (nothing on the generation side prevents this, unlike an ordinary
 * bend's 120°-turn exclusion — the sea isn't a tile in the walk), so this
 * falls back to the inflow-opposite `straight` file as a documented
 * best-effort rather than picking a misleading direction.
 */
export function mouthOrientationOf(
  inDirection: TileOrientation,
  seaDirection: TileOrientation | null,
): { shape: 'straight' | 'bend'; orientation: TileOrientation } {
  if (seaDirection) {
    const inIndex = TILE_ORIENTATIONS.indexOf(inDirection);
    const seaIndex = TILE_ORIENTATIONS.indexOf(seaDirection);
    const diff = Math.abs(inIndex - seaIndex);
    const turn = Math.min(diff, 6 - diff);
    if (turn === 2) {
      return { shape: 'bend', orientation: bendOrientationOf(inDirection, seaDirection) };
    }
  }
  return { shape: 'straight', orientation: straightOrientationOf(inDirection) };
}

/**
 * The `y_narrow` confluence asset's rotation convention, pixel-sampled the
 * same way `docs/design/river-generation.md`'s "Art pack orientation
 * convention" derived Bend/Spring/Straight — `is_blue` sampling along each
 * of a rendered file's six polygon edges (inset toward centre) against
 * every orientation, not eyeballed. File `D` touches edges `1+D`, `4+D`,
 * `5+D` (mod 6) — a fixed *opposite* pair (`1+D`/`4+D`, the trunk: a
 * straight line clear across the hex) plus a third edge (`5+D`) adjacent to
 * the second of that pair, where the art shows a branch joining the trunk
 * right before it exits. Converting through `edge(d) = (3-d) mod 6` (see
 * that doc section) gives the three directions file `D` actually renders:
 * `out = (5-D) mod 6` (the far end of the trunk, where the merged flow
 * exits), `trunkIn = (2-D) mod 6` (the trunk's near end — one tributary,
 * unbranched all the way across), `branchIn = (4-D) mod 6` (the branch —
 * the other tributary, joining in right at the exit).
 *
 * Unlike Bend/Spring, this pattern only covers *one* fixed relative
 * arrangement of (in1, in2, out) — confluences come from two independently
 * traced paths colliding (`RiverGenerator.ResolveCollisions`), so nothing
 * on the generation side constrains their angles the way an ordinary bend's
 * fixed 2-apart turn does. Most real confluences won't match this asset's
 * one rotation-class at all; this returns `null` for those (a real,
 * currently-unrepresentable case — fixing it for every possible triple
 * would mean the collision resolution itself choosing tiles that fit a
 * representable angle, not just picking a rotation after the fact), and
 * the caller falls back to its own best-effort the way `mouthOrientationOf`
 * does for its one unrepresentable angle.
 *
 * A confluence always has exactly two inflows (`RiverGenerator`'s own
 * `ins.Count >= 2` classification), but `outDirection` can be absent — a
 * confluence that also sits at the coast, with nothing downstream to point
 * at. Without a real `out` to anchor the trunk's far end, this instead
 * looks for any rotation whose three touched directions cover both real
 * inflows (in either trunk/branch role), so the picture is at least
 * hydrologically coherent even though which slot is nominally "out" is
 * arbitrary in that case.
 */
export function confluenceOrientationOf(
  inDirections: readonly TileOrientation[],
  outDirection: TileOrientation | null,
): TileOrientation | null {
  const ins = inDirections.map((d) => TILE_ORIENTATIONS.indexOf(d));

  if (outDirection) {
    const outIndex = TILE_ORIENTATIONS.indexOf(outDirection);
    const d = (5 - outIndex + 6) % 6;
    const trunkIn = (2 - d + 6) % 6;
    const branchIn = (4 - d + 6) % 6;
    if (ins.length === 2 && ins.includes(trunkIn) && ins.includes(branchIn)) {
      return TILE_ORIENTATIONS[d]!;
    }
    return null;
  }

  for (let d = 0; d < 6; d++) {
    const out = (5 - d + 6) % 6;
    const trunkIn = (2 - d + 6) % 6;
    const branchIn = (4 - d + 6) % 6;
    const touched = new Set([out, trunkIn, branchIn]);
    if (ins.every((i) => touched.has(i))) {
      return TILE_ORIENTATIONS[d]!;
    }
  }
  return null;
}

/**
 * The `y_wide` confluence asset's rotation convention — a second, later-
 * added junction (`VanDooProject/3d_assets`' asset-inventory.md: "the
 * **second** junction and the other way to pick three edges... every pair
 * 120 degrees apart... three arms radiating rather than two turned toward
 * each other"), pixel-sampled the same way as `confluenceOrientationOf`
 * above. File `D` touches edges `1+D`, `3+D`, `5+D` (mod 6) — every other
 * edge, evenly spaced, unlike `y_narrow`'s opposite-pair-plus-branch.
 * Converting through `edge(d) = (3-d) mod 6` gives directions `{(2-D),
 * (0-D), (4-D)} mod 6` — three directions each exactly 2 apart (120°) from
 * both others, with no distinguished "trunk" or "branch": since the three
 * arms are geometrically identical and evenly spaced, the whole pattern
 * repeats every 2 steps of `D` (only two distinct pictures exist, at even
 * and odd `D`) and any of the three real directions can fill any of the
 * three touched slots.
 *
 * A real (in1, in2, out) triple matches only when all three directions are
 * mutually 120° apart — the two possible sets on a six-direction wheel are
 * `{E, NW, SW}` and `{NE, W, SE}` — which `confluenceOrientationOf`'s
 * opposite-pair-anchored `y_narrow` pattern can never itself satisfy (a
 * 120°-only spacing never contains an opposite, 180°-apart pair), so the two
 * functions' representable triples never overlap: a caller can safely try
 * this one as a second, independent chance after `y_narrow`'s fails.
 */
export function confluenceWideOrientationOf(
  inDirections: readonly TileOrientation[],
  outDirection: TileOrientation | null,
): TileOrientation | null {
  const known = [...inDirections, ...(outDirection ? [outDirection] : [])].map((d) =>
    TILE_ORIENTATIONS.indexOf(d),
  );
  if (known.length < 2) return null;

  for (let d = 0; d < 6; d++) {
    const touched = new Set([(2 - d + 6) % 6, (0 - d + 6) % 6, (4 - d + 6) % 6]);
    if (known.every((i) => touched.has(i))) {
      return TILE_ORIENTATIONS[d]!;
    }
  }
  return null;
}

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
    | 'shrineofthor'
    | 'shrineoffreyja'
    | 'lumberjack'
    | 'quarry'
    | 'storagehouse'
    | 'archeryrange'
    | 'dockyard'
    | 'greatstorehouse'
    | 'barracks'
    | 'fisherhut'
    | 'sawmill'
    | 'shrineofullr'
    | 'shrineofnjord'
    | 'meadery'
    | 'townsquare'
    | 'cropmill'
    | 'smithy'
    | 'druidhut'
    | 'cartworkshop'
    | 'claybrickworks';
  buildingLevel?: number;
  /**
   * This hex's place in a "giant tile" — one art object spanning a centre
   * hex plus its six neighbours (see `giantTiles.ts`'s module doc comment
   * for the full frame-name/rendering contract). Set on all 7 covered hexes,
   * `part: 'C'` on the anchor itself. `orientation` is carried here (rather
   * than re-derived from the anchor tile's own `orientation` at render time)
   * so a covered tile's render doesn't depend on the anchor tile having been
   * materialised yet — all 7 parts of one giant always share it.
   *
   * A spike: no backend/API notion of this exists yet (`WorldModel.placeGiant`
   * is demo-mode/client-only), and a giant tile carries no building economy
   * of its own (it isn't a `buildingType`).
   */
  giant?: {
    family: 'giantmountain' | 'giantshrine' | 'giantvolcano';
    anchor: { q: number; r: number };
    part: import('./giantTiles').GiantPart;
    orientation: TileOrientation;
  };
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
  /**
   * Per-resource storage cap, live mode only (from `ResourcesResponse.Capacity`
   * — see `SettlementService.GrantResourcesAsync`/`ResourcePool.Adjust`, which
   * actually enforce it server-side). Demo settlements leave this unset;
   * `WorldModel.storageCapFor` derives a synthetic cap for them instead.
   */
  capacity?: Resources;
  foundedAt: number;
  /** Which island (see `IslandLabel`) this settlement sits on, live mode only — used to gold-highlight the player's own island on the world map. */
  islandId?: string;
}

/**
 * A trade cart in transit between two settlements, interpolated on the
 * world map (same `{from,to}Q/R` + `departedAt`/`etaAt` shape as a fleet's
 * army overlay leg, both wall-clock-comparable millisecond timestamps) —
 * see `HexMapRenderer`'s cart-rendering loop. Live mode
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
export type RiverTileShape = 'spring' | 'straight' | 'bend' | 'confluence' | 'mouth' | 'bend60';

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
