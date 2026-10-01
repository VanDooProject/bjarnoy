export type Terrain = 'sea' | 'sand' | 'grass' | 'forest' | 'mountain' | 'bog' | 'lake';

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
 * The `bend60` family (the tight turn between two *adjacent* edges — also its
 * `bend60_loop` variant and `lavastream_bend60`) is one fixed curve,
 * camera-rotated six ways, like `bend`'s — but it is not `bend`'s rotation
 * convention: pixel-measured, file index `D` touches polygon edges `D` and
 * `D+1`, not `D-1`/`D+1`. Through the self-inverse edge formula above those
 * are directions `{ (2-D) mod 6, (3-D) mod 6 }` — an adjacent pair whose
 * lower member `anchor` (the one the other is `+1` from) gives
 * `D = (2 - anchor) mod 6`, i.e. `bendFileIndexFor(anchor)` again, only with
 * a `+1` anchor test instead of `bendOrientationOf`'s `+2`. Order-independent:
 * the curve is the same whichever way the water runs.
 *
 * Reusing `bendOrientationOf` here (as this used to) never matched its `+2`
 * test for an adjacent pair and fell back to `outDirection` as the anchor —
 * right for one flow direction, the wrong file for the other.
 */
export function bend60OrientationOf(inDirection: TileOrientation, outDirection: TileOrientation): TileOrientation {
  const inIndex = TILE_ORIENTATIONS.indexOf(inDirection);
  const outIndex = TILE_ORIENTATIONS.indexOf(outDirection);
  const anchor = (inIndex + 1) % 6 === outIndex ? inIndex : outIndex;
  return TILE_ORIENTATIONS[bendFileIndexFor(anchor)];
}

/**
 * A spring tile's art — the mountain spring families the game draws
 * (`mountaintile_corrie_spring`, `mountaintile_saddleback_spring`, the frozen
 * `mountaintile_glacier_spring` and the wasted
 * `mountaintile_volcano_lavaspring(_flows)`) — has exactly one outflow edge.
 * Pixel-measured on all of them: file index `D` drains over polygon edge
 * `D+1`. Through the self-inverse edge formula that edge is direction
 * `(2-D) mod 6`, so the file a given `outDirection` needs is
 * `D = (2 - outIndex) mod 6`.
 *
 * (This used to be `(4 - outIndex)`, measured on the flat placeholder
 * `rivertile_spring`, whose outflow is edge `D-1` — two edges round from the
 * mountain springs that replaced it, so every water spring drained out the
 * wrong side; the lava spring only looked right because it carried its own
 * two-step correction on top.)
 */
export function springOrientationOf(outDirection: TileOrientation): TileOrientation {
  const outIndex = TILE_ORIENTATIONS.indexOf(outDirection);
  return TILE_ORIENTATIONS[(2 - outIndex + 6) % 6];
}

/**
 * The bog lake shore families (`boglake_inlet`, `boglake_shore`, `boglake_half`: one, two or three
 * contiguous water edges) and the lake `mouth` (`boglake_mouth`: an inlet with the creek on the
 * opposite edge) are one fixed shape camera-rotated six ways. Pixel-measured against the polygon
 * edges like the river families (`docs/design/bog.md`, "Art pack orientation convention"): file `D`
 * carries its water on polygon edges `D+4` (inlet, mouth), `D+3` and `D+4` (shore), `D+2`, `D+3`
 * and `D+4` (half). Through the self-inverse edge formula (`edge(d) = (3 - d) mod 6`) those are the
 * directions `(5-D)` (inlet), `(5-D)` and `(6-D)` (shore), `(5-D)`, `(6-D)` and `(7-D)` (half), all
 * mod 6: a run of water directions that starts at `a = (5-D) mod 6` and continues `a+1`, `a+2`. So
 * the file a shore with water run `a, a+1, ...` needs is `D = (5 - a) mod 6`. `waterEdges` is the
 * run in ascending cyclic order (`BogTile.waterEdges`), so its first entry is `a`.
 */
export function bogShoreOrientationOf(waterEdges: readonly TileOrientation[]): TileOrientation {
  const start = TILE_ORIENTATIONS.indexOf(waterEdges[0]!);
  return TILE_ORIENTATIONS[(5 - start + 6) % 6]!;
}

/** The `boglake_mouth` file for a mouth whose lake lies in `water`; the creek is on the opposite edge. Same convention as `bogShoreOrientationOf`. */
export function bogMouthOrientationOf(water: TileOrientation): TileOrientation {
  return bogShoreOrientationOf([water]);
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
): { shape: 'straight' | 'bend' | 'bend60'; orientation: TileOrientation } {
  if (seaDirection) {
    const inIndex = TILE_ORIENTATIONS.indexOf(inDirection);
    const seaIndex = TILE_ORIENTATIONS.indexOf(seaDirection);
    const diff = Math.abs(inIndex - seaIndex);
    const turn = Math.min(diff, 6 - diff);
    if (turn === 2) {
      return { shape: 'bend', orientation: bendOrientationOf(inDirection, seaDirection) };
    }
    if (turn === 1) {
      return { shape: 'bend60', orientation: bend60OrientationOf(inDirection, seaDirection) };
    }
  }
  return { shape: 'straight', orientation: straightOrientationOf(inDirection) };
}

/**
 * Which neighbour a `Mouth` tile drains into, given which of its six neighbours are sea
 * (`isSea[d]`, `neighbors()` order) and the direction its river comes in from. Prefers the sea
 * straight ahead (opposite the inflow, the only case the delta and the smallwide straight can
 * draw), then a 60-degree turn either way, then the hairpin. Ties break in `TILE_ORIENTATIONS`
 * order. Mirrors what the generator assumes when it widens a mouth: it only lets a stream reach
 * a mouth whose opposite neighbour is sea.
 */
export function mouthSeaDirection(inDirection: TileOrientation, isSea: readonly boolean[]): TileOrientation | null {
  const inIndex = TILE_ORIENTATIONS.indexOf(inDirection);
  for (const turn of [3, 2, 1]) {
    for (let d = 0; d < 6; d++) {
      const diff = Math.abs(inIndex - d);
      if (isSea[d] && Math.min(diff, 6 - diff) === turn) return TILE_ORIENTATIONS[d]!;
    }
  }
  for (let d = 0; d < 6; d++) if (isSea[d]) return TILE_ORIENTATIONS[d]!;
  return null;
}

/**
 * The stream-to-river straight (`rivertile_smallwide_bend180_island`) and the delta
 * (`rivertile_delta`) share the plain straight's rotation - file `D` touches polygon edges `D+1`
 * and `D+4` - but are asymmetric, and pixel-measuring the water width along each edge gives the
 * ends: the narrow (stream) edge of the smallwide straight is `D+1`, the wide (river) edge `D+4`;
 * the delta takes the river in on `D+1` and opens to the sea on `D+4`. Through the self-inverse
 * edge formula the `D+1` end is direction `(2-D) mod 6`, so the file for a tile whose upstream
 * (stream / river) inflow comes from `inDirection` is `D = (2 - inDirection) mod 6` - the plain
 * straight's formula, but here only the *inflow* end is right (the far end is the river / sea).
 */
export function widenStraightOrientationOf(inDirection: TileOrientation): TileOrientation {
  return straightOrientationOf(inDirection);
}

/** See `widenStraightOrientationOf`: the delta's river edge is `D+1`, its sea edge `D+4`. */
export function deltaOrientationOf(inDirection: TileOrientation): TileOrientation {
  return straightOrientationOf(inDirection);
}

/** Which of the two Y assets a confluence renders with. */
export type ConfluenceKind = 'narrow' | 'wide' | 'riverstreamwide';

/**
 * Which Y asset can draw a confluence with inflows `inA`/`inB` and outflow `out` (direction
 * indices), or `null` when none can. With `o` the outflow, the narrow Y has its inflows at `o+2`
 * and `o+3`, the wide Y at `o+2` and `o+4`; there is no mirror image of the narrow Y. The single
 * definition the tracer's merge rule uses - mirrors `RiverConfluence.Classify` (backend); both are
 * checked against `src/shared/confluence-representability.json`.
 */
export function confluenceKind(inA: number, inB: number, out: number): ConfluenceKind | null {
  if (inA === inB || inA === out || inB === out) return null;
  const a = (inA - out + 6) % 6;
  const b = (inB - out + 6) % 6;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo === 2 && hi === 3) return 'narrow';
  if (lo === 2 && hi === 4) return 'wide';
  return null;
}

/**
 * `confluenceKind` once the inflows' widths are known — mirrors `RiverConfluence.Classify` (widths
 * overload): two rivers or two streams keep the Y their geometry allows; one river and one stream
 * is drawable only as the wide-Y geometry (`'riverstreamwide'`, the stream on either side arm).
 */
export function confluenceKindWithWidths(
  inA: number,
  aIsRiver: boolean,
  inB: number,
  bIsRiver: boolean,
  out: number,
): ConfluenceKind | null {
  const geometry = confluenceKind(inA, inB, out);
  if (aIsRiver === bIsRiver) return geometry;
  return geometry === 'wide' ? 'riverstreamwide' : null;
}

/**
 * The Y assets' rotation convention (`y_narrow`, `ywide` and their stream twins
 * `smallwide_y_narrow`, `smallwide_ywide`), pixel-sampled like Bend/Spring/Straight in
 * `docs/design/river-generation.md`. File `D` touches edges `1+D`, `4+D`, `5+D` (narrow) or
 * `1+D`, `3+D`, `5+D` (wide). The stream twins settle which edge is the outflow: the water
 * measures river width on edge `1+D` and stream width on the other two, so the river leaves by
 * edge `1+D` = direction `(2-D) mod 6`. The narrow Y's two inflows are then `(4-D)` and `(5-D)`
 * (edges `5+D`, `4+D`, 60 degrees apart, "two tributaries running nearly parallel"), the wide
 * Y's `(4-D)` and `(0-D)` (120 degrees each way). So for a known outflow `o`:
 * `D = (2 - o) mod 6`, inflows `{o+2, o+3}` (narrow) or `{o+2, o+4}` (wide) - exactly
 * `confluenceKind`.
 *
 * (An earlier pass took the narrow Y's outflow to be edge `4+D`, which no measurement can tell
 * apart on an all-river tile; the stream twins can.)
 */
export function confluenceOrientationOf(
  inDirections: readonly TileOrientation[],
  outDirection: TileOrientation | null,
): TileOrientation | null {
  return confluenceFileFor(inDirections, outDirection, 'narrow');
}

/**
 * The `rivertile_smallwide_bend120_tributary` file for a stream joining a river from direction
 * `streamIn` (the river arms then lie at `streamIn + 2` and `streamIn + 4`). Pixel-measured against
 * `isoTopPoints` (docs/design/river-generation.md): file D has the stream on polygon edge D+3 and the
 * river on D+1 / D+5, and edge(d) = (3 - d) mod 6 gives D = (6 - streamIn) mod 6.
 */
export function tributaryOrientationOf(streamIn: TileOrientation): TileOrientation {
  const s = TILE_ORIENTATIONS.indexOf(streamIn);
  return TILE_ORIENTATIONS[(6 - s) % 6]!;
}

/** `confluenceOrientationOf` for the `ywide` family; see there. */
export function confluenceWideOrientationOf(
  inDirections: readonly TileOrientation[],
  outDirection: TileOrientation | null,
): TileOrientation | null {
  return confluenceFileFor(inDirections, outDirection, 'wide');
}

function confluenceFileFor(
  inDirections: readonly TileOrientation[],
  outDirection: TileOrientation | null,
  kind: 'narrow' | 'wide',
): TileOrientation | null {
  if (inDirections.length !== 2) return null;
  const a = TILE_ORIENTATIONS.indexOf(inDirections[0]!);
  const b = TILE_ORIENTATIONS.indexOf(inDirections[1]!);
  // A confluence stored without an outflow (a row from before merge-aware tracing dropped the
  // third river at a full confluence): any outflow that makes the Y drawable will do.
  const candidates = outDirection ? [TILE_ORIENTATIONS.indexOf(outDirection)] : [0, 1, 2, 3, 4, 5];
  for (const o of candidates) {
    if (confluenceKind(a, b, o) === kind) return TILE_ORIENTATIONS[(2 - o + 6) % 6]!;
  }
  return null;
}

/** How wide the water is on a river hex; mirrors the backend's `RiverWidth`. */
export type RiverWidth = 'river' | 'stream' | 'widen' | 'riverstream';

export type ResourceKind = 'wood' | 'stone' | 'food' | 'iron';

export type Resources = Record<ResourceKind, number>;

export interface Tile {
  q: number;
  r: number;
  terrain: Terrain;
  /** Sea that borders land — the ring a coastal-water sprite belongs on. */
  isCoastalWater?: boolean;
  /**
   * This hex is (or borders) a wasted island — hidden as sea until the
   * world's endboss triggers (see `WorldModel.setWastedRevealed`). Once
   * revealed, it renders with the wasted terrain families (wasteland/
   * deadforest/blacksand/blacksandcoast) instead of the plain green ones —
   * see `textures.ts`'s wasted family mapping.
   */
  wasted?: boolean;
  /** Which art-pack rotation to render this hex with. */
  orientation?: TileOrientation;
  /** Which numbered variant of this terrain's tile art to use. */
  variant?: number;
  /**
   * This hex is part of an island's bogland (moss, lake water, shore, creek, mouth or spring) — see `BogTile`. Its
   * `terrain` is `bog` (`lake` for the water) and the art family follows `kind` (`textures.ts`'s `bogArtFor`). Set by
   * `WorldModel.setBogTiles` (live mode) / demo-mode generation, never derived from the seed hex by hex.
   */
  bog?: BogTile;
  /** Settlement id that currently claims this hex, if any (Settlers II style borders). */
  ownerId?: string;
  buildingType?:
    | 'longhouse'
    | 'hut'
    | 'farm'
    | 'tower'
    | 'fishinghut'
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
    | 'sawmill'
    | 'shrineofullr'
    | 'shrineofnjord'
    | 'meadery'
    | 'townsquare'
    | 'cropmill'
    | 'smithy'
    | 'druidhut'
    | 'cartworkshop'
    | 'claybrickworks'
    | 'reindeerherder'
    | 'odinstatue'
    | 'bogoreworks'
    | 'hammerschmiede'
    | 'palisade'
    | 'palisadegate';
  buildingLevel?: number;
  /**
   * A decoration on this open-lake hex, drawn because of a building nearby (`lakeProps.ts`): a fish weir or fishing boat
   * next to a lake Fishing Hut, an ore boat next to a bog-ore works. Render-only and derived, like `bog`; set and cleared by
   * `WorldModel` whenever the buildings around a lake change, never by the server.
   */
  lakeProp?: 'weir' | 'oreboat' | 'fishboat';
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
    family: 'giantmountain' | 'giantshrine' | 'giantvolcano' | 'giantutgard';
    anchor: { q: number; r: number };
    part: import('./giantTiles').GiantPart;
    orientation: TileOrientation;
  };
  /**
   * A wildlife camp on this hex (see `campPlacement.ts` and
   * `docs/design/wildlife-camps.md`): an animated topping on the tile's own
   * ground. Spawn and render only — every camp is guarded (art level 1), and a
   * camp hex is not buildable. `orientation` is the tile's own rotation as
   * generated; the renderer maps it onto the rotations the guarded art
   * actually ships (`textures.ts`'s `campArtFor`).
   */
  camp?: {
    family: string;
    level: number;
    orientation: TileOrientation;
    strong: boolean;
    guardRange: number;
    /**
     * Live state from `GET /worlds/{id}/camps` (`WorldModel.setCampStates`); absent until it
     * arrives and always in demo mode, where every camp is guarded. A camp without it is
     * treated as pristine: full garrison at its rolled level, aggressive.
     */
    effectiveLevel?: number;
    garrison?: { young: number; adult: number; alpha: number };
    fullGarrison?: { young: number; adult: number; alpha: number };
    /** Cleared: nothing guards it, so it draws its cleared art and is buildable (not Fenrir's brood). */
    empty?: boolean;
    calmUntil?: string | null;
    aggressive?: boolean;
    clears?: number;
    /** A building stands on the hex: the camp is off the map for as long as it stands. */
    removed?: boolean;
    leftover?: { wood: number; stone: number; food: number; iron: number };
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
  /**
   * `'river'` (the default when absent: every tile of a lava stream and of a world stored before
   * streams), `'stream'` (half width on every edge), `'widen'` (stream in, river out) or `'riverstream'` (a wide-Y confluence of one river and one stream).
   */
  width?: RiverWidth;
  /** True for a lava stream on a wasted island — renders with the lavastream art families instead of rivertile. */
  wasted?: boolean;
}

/** What a bog hex is — mirrors the backend's `BogTileKind` wire names. */
export type BogTileKind = 'bog' | 'lake' | 'inlet' | 'shore' | 'half' | 'mouth' | 'creek' | 'creekspring';

/**
 * A single hex of an island's bogland, as served by the backend (`BogTileResponse`) or generated locally in demo mode
 * (`bogGenerator.ts`). A `lake` hex reads as terrain `lake`, every other kind as terrain `bog`. `inDirections` /
 * `outDirection` are the flow of a creek, mouth or spring (like a river tile's); `waterEdges` are the lake neighbours of
 * a shore or mouth, a contiguous run in ascending cyclic order.
 */
export interface BogTile {
  q: number;
  r: number;
  kind: BogTileKind;
  inDirections: TileOrientation[];
  outDirection: TileOrientation | null;
  waterEdges: TileOrientation[];
}

export function emptyResources(): Resources {
  return { wood: 0, stone: 0, food: 0, iron: 0 };
}
