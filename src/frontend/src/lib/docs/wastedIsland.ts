// Pure data for the Wasted Lands docs page's "turning island" (WastedIsland.vue):
// a made-up island, not from a real world, whose hexes swap living art for
// wasted art as a blight-stage slider advances. No Vue/DOM dependency here —
// everything is plain data so it can be unit tested directly
// (wastedIsland.test.ts).
//
// The island lives on the same axial lattice as the real game
// (src/lib/hex/coords.ts, src/lib/hex/geometry.ts) and reuses the `showcase`
// atlas category's pre-composited, high-res frames (src/lib/map/atlas.ts) —
// the same source the docs' other art thumbnails use — rather than the
// runtime's split base/top layers.
import {
  coordKey,
  hexDistance,
  neighbors,
  type AxialCoord,
} from "../hex/coords";
import { isoGridPosition } from "../hex/geometry";
import { findAtlasFrame, type AtlasFrameRect } from "../map/atlas";
import { TILE_ORIENTATIONS, type TileOrientation } from "../map/types";

/** One island hex's terrain family, or one of the two giants. */
export type IslandKind =
  | "grass"
  | "forest"
  | "mountain"
  | "sand"
  | "coast"
  | "sea"
  | "utgard"
  | "volcano";

export interface IslandPlacement {
  /** Stable across rotations (keyed on the hex's pre-rotation coordinate), so Vue can key a `v-for` on it without a rotation causing every sprite to remount. */
  key: string;
  kind: IslandKind;
  livingFrame: string;
  wastedFrame: string;
  /** Top-left of this placement's *untrimmed source canvas* (400x600 for a tile, 1200x1800 for a giant) — see the module doc below for how a resolved frame's own `spriteSourceSize` offsets into it. */
  x: number;
  y: number;
  /** Painter's-algorithm sort key — render placements in ascending order. */
  depth: number;
  /** Blight stage (1..4) at which this placement turns from living to wasted. */
  turnsAt: number;
  /** Per-hex delay fraction (0..1) for staggering the cross-fade. */
  delay: number;
  /** The (rotated) hexes this placement covers — 1 for an ordinary tile, 7 for a giant. */
  hexes: AxialCoord[];
}

// Showcase geometry (see VanDooProject/3D_assets docs/asset-inventory.md and
// scripts/build_atlas.py): a tile's source canvas is 400x600 with its top
// face's bounding box starting at y=280; a giant's is exactly three tiles
// wide/tall (1200x1800), centred on the same top-face origin as the normal
// tile it replaces.
const TILE_W = 400;
const TOP_FACE_H = 184;
const TOP_FACE_Y = 280;
const TILE_SOURCE_H = 600;

const ISLAND_RADIUS = 5;
const ORIGIN: AxialCoord = { q: 0, r: 0 };
const VOLCANO_CENTER: AxialCoord = { q: -3, r: 1 };

// ---------------------------------------------------------------------------
// Deterministic hashing — no Math.random, so the island (and its tests) are
// exactly reproducible. FNV-1a-ish: cheap, fine avalanche for our purposes.
// ---------------------------------------------------------------------------

function hash32(q: number, r: number, salt: number): number {
  let h = 0x811c9dc5;
  for (const v of [q, r, salt]) {
    h ^= v | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** A hash of (q, r, salt) as a float in [0, 1) — `salt` picks an independent draw for the same hex (orientation, variant, delay, ...). */
function hashFloat(q: number, r: number, salt: number): number {
  return hash32(q, r, salt) / 0x100000000;
}

function hashInt(q: number, r: number, salt: number, count: number): number {
  return Math.floor(hashFloat(q, r, salt) * count);
}

const SALT = {
  landExtend: 1,
  kind: 2,
  livingVariant: 3,
  wastedVariant: 4,
  orientation: 5,
  delay: 6,
  beach: 7,
} as const;

// ---------------------------------------------------------------------------
// Hex enumeration + rotation
// ---------------------------------------------------------------------------

function hexesInDistance(center: AxialCoord, radius: number): AxialCoord[] {
  const out: AxialCoord[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++)
      out.push({ q: center.q + dq, r: center.r + dr });
  }
  return out;
}

/** Rotates an axial coord by `steps` x 60 degrees about the origin (cube-coordinate rotation) — used to spin the whole island's layout for `buildIsland`'s rotation argument. */
export function rotateAxial(c: AxialCoord, steps: number): AxialCoord {
  const n = ((steps % 6) + 6) % 6;
  let x = c.q;
  let z = c.r;
  let y = -x - z;
  for (let i = 0; i < n; i++) {
    const nx = -z;
    const ny = -x;
    const nz = -y;
    x = nx;
    y = ny;
    z = nz;
  }
  return { q: x, r: z };
}

// ---------------------------------------------------------------------------
// Static classification — computed once, independent of rotation (kind,
// variant and orientation are properties of the hex itself; only screen
// position and the orientation *label* rotate with the viewer).
// ---------------------------------------------------------------------------

interface IslandHexRecord {
  q: number;
  r: number;
  kind: Exclude<IslandKind, "utgard" | "volcano">;
  livingPrefix: string;
  livingSuffix: string;
  wastedPrefix: string;
  wastedSuffix: string;
  baseOrientIndex: number;
  turnsAt: number;
  delay: number;
}

const UTGARD_HEXES = hexesInDistance(ORIGIN, 1);
const VOLCANO_HEXES = hexesInDistance(VOLCANO_CENTER, 1);
const GIANT_KEYS = new Set([...UTGARD_HEXES, ...VOLCANO_HEXES].map(coordKey));

function isGiantHex(c: AxialCoord): boolean {
  return GIANT_KEYS.has(coordKey(c));
}

let cachedHexes: IslandHexRecord[] | null = null;

function classifyIsland(): IslandHexRecord[] {
  if (cachedHexes) return cachedHexes;

  const all = hexesInDistance(ORIGIN, ISLAND_RADIUS).filter(
    (c) => !isGiantHex(c),
  );

  // Pass 1: land vs not-land, purely from distance + a hash extending the
  // core out to a ragged edge at d===4.
  // The giants' own hexes are land too: without them here, every hex
  // touching a flower would read as shoreline and turn to sand.
  const landKeys = new Set<string>(GIANT_KEYS);
  for (const c of all) {
    const d = hexDistance(c, ORIGIN);
    const land =
      d <= 3 || (d === 4 && hashFloat(c.q, c.r, SALT.landExtend) < 0.6);
    if (land) landKeys.add(coordKey(c));
  }

  const utgardCentreY = isoGridPosition(ORIGIN, TILE_W, TOP_FACE_H).y;

  const records: IslandHexRecord[] = [];
  for (const c of all) {
    const d = hexDistance(c, ORIGIN);
    const isLand = landKeys.has(coordKey(c));
    // A patchy beach rather than a full ring of it: only about half the
    // shoreline hexes are sand, the rest run green down to the water.
    const isEdge =
      isLand &&
      neighbors(c).some((n) => !landKeys.has(coordKey(n))) &&
      hashFloat(c.q, c.r, SALT.beach) < 0.45;

    let kind: IslandHexRecord["kind"];
    if (isLand) {
      if (isEdge) {
        kind = "sand";
      } else {
        // Never forest/mountain at d===2 (the ring immediately around the
        // Utgard flower, radius 1): over the full 0..5 rotation sweep every
        // hex in that ring lands "south of Utgard, adjacent to the flower"
        // at some rotation, so it stays grass for all of them.
        const northOfUtgard =
          isoGridPosition(c, TILE_W, TOP_FACE_H).y < utgardCentreY;
        const nearVolcano = hexDistance(c, VOLCANO_CENTER) <= 3;
        const roll = hashFloat(c.q, c.r, SALT.kind);
        if (d <= 2) {
          kind = "grass";
        } else if (northOfUtgard && nearVolcano) {
          kind = roll < 0.15 ? "grass" : roll < 0.6 ? "forest" : "mountain";
        } else {
          kind = roll < 0.75 ? "grass" : roll < 0.9 ? "forest" : "mountain";
        }
      }
    } else {
      const coastal = neighbors(c).some((n) => landKeys.has(coordKey(n)));
      kind = coastal ? "coast" : "sea";
    }

    const turnsAt = isLand ? 2 : kind === "coast" ? 3 : 4;

    const [livingPrefix, livingSuffix] = livingArt(kind, c);
    const [wastedPrefix, wastedSuffix] = wastedArt(kind, c);

    records.push({
      q: c.q,
      r: c.r,
      kind,
      livingPrefix,
      livingSuffix,
      wastedPrefix,
      wastedSuffix,
      baseOrientIndex: hashInt(c.q, c.r, SALT.orientation, 6),
      turnsAt,
      delay: hashFloat(c.q, c.r, SALT.delay),
    });
  }

  cachedHexes = records;
  return records;
}

/** `[framePrefix, frameSuffix]` for a living hex's frame name (orientation slots between them): `${prefix}_<O>${suffix}`. */
function livingArt(
  kind: IslandHexRecord["kind"],
  c: AxialCoord,
): [string, string] {
  switch (kind) {
    case "grass": {
      const n = hashInt(c.q, c.r, SALT.livingVariant, 4); // '', variant000..002
      return [
        "grasstile",
        n === 0 ? "" : `_variant${String(n - 1).padStart(3, "0")}`,
      ];
    }
    case "forest": {
      const n = hashInt(c.q, c.r, SALT.livingVariant, 3); // '', variant000..001
      return [
        "foresttile",
        n === 0 ? "" : `_variant${String(n - 1).padStart(3, "0")}`,
      ];
    }
    case "sand":
      return ["sandtile", ""];
    case "mountain":
      return ["mountaintile", "_level000"];
    case "coast": {
      const n = hashInt(c.q, c.r, SALT.livingVariant, 3); // '', variant000..001
      return [
        "coastalwatertile",
        n === 0 ? "" : `_variant${String(n - 1).padStart(3, "0")}`,
      ];
    }
    case "sea":
      return ["watertile", ""];
  }
}

/** Same shape as `livingArt`, for the wasted counterpart. */
function wastedArt(
  kind: IslandHexRecord["kind"],
  c: AxialCoord,
): [string, string] {
  switch (kind) {
    case "grass": {
      const n = hashInt(c.q, c.r, SALT.wastedVariant, 6); // '', variant001..005
      return [
        "wasteland",
        n === 0 ? "" : `_variant${String(n).padStart(3, "0")}`,
      ];
    }
    case "forest": {
      const n = hashInt(c.q, c.r, SALT.wastedVariant, 2); // '', variant001
      return ["deadforest", n === 0 ? "" : "_variant001"];
    }
    case "sand": {
      const n = hashInt(c.q, c.r, SALT.wastedVariant, 2); // '', variant001
      return ["blacksand", n === 0 ? "" : "_variant001"];
    }
    case "mountain":
      return ["mountaintile_jagged", "_level000"];
    case "coast": {
      const n = hashInt(c.q, c.r, SALT.wastedVariant, 4); // '', variant000..002
      return [
        "blacksandcoast",
        n === 0 ? "" : `_variant${String(n - 1).padStart(3, "0")}`,
      ];
    }
    case "sea":
      return ["taintedwater", ""];
  }
}

function orientationAt(baseIndex: number, rotation: number): TileOrientation {
  const idx = (((baseIndex + rotation) % 6) + 6) % 6;
  return TILE_ORIENTATIONS[idx]!;
}

// ---------------------------------------------------------------------------
// Placements (rotation-dependent)
// ---------------------------------------------------------------------------

export function buildIsland(rotation: number): IslandPlacement[] {
  const placements: IslandPlacement[] = [];

  for (const record of classifyIsland()) {
    const original = { q: record.q, r: record.r };
    const rotated = rotateAxial(original, rotation);
    const orientation = orientationAt(record.baseOrientIndex, rotation);
    const g = isoGridPosition(rotated, TILE_W, TOP_FACE_H);

    placements.push({
      key: `${record.kind}:${coordKey(original)}`,
      kind: record.kind,
      livingFrame: `${record.livingPrefix}_${orientation}${record.livingSuffix}`,
      wastedFrame: `${record.wastedPrefix}_${orientation}${record.wastedSuffix}`,
      x: g.x,
      y: g.y - TOP_FACE_Y,
      depth: g.y,
      turnsAt: record.turnsAt,
      delay: record.delay,
      hexes: [rotated],
    });
  }

  placements.push(
    giantPlacement("utgard", ORIGIN, "giantshrine", "giantutgard", 1, rotation),
  );
  placements.push(
    giantPlacement(
      "volcano",
      VOLCANO_CENTER,
      "giantmountain",
      "giantvolcano",
      2,
      rotation,
    ),
  );

  placements.sort(
    (a, b) => a.depth - b.depth || positionOf(a).x - positionOf(b).x,
  );
  return placements;
}

// Depth tie-break needs the *front-most covered hex's* x — recomputed here
// rather than stashed on the placement (which only exposes `depth`).
function positionOf(p: IslandPlacement): { x: number } {
  let best = p.hexes[0]!;
  let bestY = isoGridPosition(best, TILE_W, TOP_FACE_H).y;
  for (const h of p.hexes) {
    const y = isoGridPosition(h, TILE_W, TOP_FACE_H).y;
    if (y > bestY) {
      bestY = y;
      best = h;
    }
  }
  return isoGridPosition(best, TILE_W, TOP_FACE_H);
}

function giantPlacement(
  kind: "utgard" | "volcano",
  center: AxialCoord,
  livingFamily: string,
  wastedFamily: string,
  turnsAt: number,
  rotation: number,
): IslandPlacement {
  const rotatedCenter = rotateAxial(center, rotation);
  const covered = hexesInDistance(rotatedCenter, 1);
  const orientation = orientationAt(5, rotation); // giants render at a fixed base camera ('SE')
  const g = isoGridPosition(rotatedCenter, TILE_W, TOP_FACE_H);

  let frontY = -Infinity;
  for (const h of covered) {
    const hg = isoGridPosition(h, TILE_W, TOP_FACE_H);
    if (hg.y > frontY) frontY = hg.y;
  }

  return {
    key: `${kind}:${coordKey(center)}`,
    kind,
    livingFrame: `${livingFamily}_${orientation}_level000`,
    wastedFrame: `${wastedFamily}_${orientation}_level000`,
    x: g.x - TILE_W,
    y: g.y - TOP_FACE_Y - TILE_SOURCE_H,
    depth: frontY,
    turnsAt,
    delay: 0,
    hexes: covered,
  };
}

// ---------------------------------------------------------------------------
// Frame resolution
// ---------------------------------------------------------------------------

const VARIANT_SUFFIX_RE = /_variant\d{3}$/;

/**
 * Resolves an island frame name to a real showcase `AtlasFrameRect`, with a
 * defensive fallback chain for an atlas rename/variant-count change: drop the
 * `_variantNNN` suffix, then force orientation `SE`. Never throws — a name
 * that resolves nowhere returns `undefined` and the caller skips that sprite
 * rather than crashing the page.
 */
export function resolveIslandFrame(name: string): AtlasFrameRect | undefined {
  const direct = findAtlasFrame("showcase", name);
  if (direct) return direct;

  const withoutVariant = name.replace(VARIANT_SUFFIX_RE, "");
  if (withoutVariant !== name) {
    const frame = findAtlasFrame("showcase", withoutVariant);
    if (frame) return frame;
  }

  const seOriented = withOrientation(withoutVariant);
  if (seOriented !== withoutVariant) {
    const frame = findAtlasFrame("showcase", seOriented);
    if (frame) return frame;
  }
  return undefined;
}

function withOrientation(name: string): string {
  return name
    .split("_")
    .map((part) =>
      (TILE_ORIENTATIONS as readonly string[]).includes(part) ? "SE" : part,
    )
    .join("_");
}

/** True if `name` resolves without needing `resolveIslandFrame`'s fallback chain — used by tests to guard against a silent atlas rename. */
export function resolvesDirectly(name: string): boolean {
  return findAtlasFrame("showcase", name) !== undefined;
}

export const GIANT_HEXES_FOR_TESTS = {
  utgard: UTGARD_HEXES,
  volcano: VOLCANO_HEXES,
};
