import { describe, expect, it } from "vitest";
import { coordKey, hexDistance, type AxialCoord } from "../hex/coords";
import {
  computeGlowMist,
  glowKindFor,
  GLOW_COLORS,
  GLOW_STRENGTH,
} from "./glowMist";
import type { RiverTile, Tile } from "./types";

function tile(overrides: Partial<Tile> = {}): Tile {
  return { q: 0, r: 0, terrain: "grass", ...overrides };
}

describe("glowKindFor", () => {
  it("is rune for a giantutgard hex, wasted or not", () => {
    expect(
      glowKindFor(
        tile({
          giant: {
            family: "giantutgard",
            anchor: { q: 0, r: 0 },
            part: "C",
            orientation: "SE",
          },
        }),
        undefined,
      ),
    ).toBe("rune");
  });

  it("is ember for a wasted giantvolcano hex", () => {
    expect(
      glowKindFor(
        tile({
          wasted: true,
          giant: {
            family: "giantvolcano",
            anchor: { q: 0, r: 0 },
            part: "C",
            orientation: "SE",
          },
        }),
        undefined,
      ),
    ).toBe("ember");
  });

  it("is null for a non-wasted giantvolcano hex", () => {
    expect(
      glowKindFor(
        tile({
          giant: {
            family: "giantvolcano",
            anchor: { q: 0, r: 0 },
            part: "C",
            orientation: "SE",
          },
        }),
        undefined,
      ),
    ).toBeNull();
  });

  it("is ember for a wasted river (lava stream/spring)", () => {
    const river: RiverTile = {
      q: 0,
      r: 0,
      shape: "straight",
      inDirections: ["W"],
      outDirection: "E",
      wasted: true,
    };
    expect(glowKindFor(tile(), river)).toBe("ember");
  });

  it("is null for a plain (non-wasted) river", () => {
    const river: RiverTile = {
      q: 0,
      r: 0,
      shape: "straight",
      inDirections: ["W"],
      outDirection: "E",
    };
    expect(glowKindFor(tile(), river)).toBeNull();
  });

  it("is null for a plain tile with no giant and no river", () => {
    expect(glowKindFor(tile(), undefined)).toBeNull();
  });
});

const allMist = () => true;

describe("computeGlowMist", () => {
  it("scales an emitter hex by its kind strength, so ember is quieter than rune", () => {
    const rune = computeGlowMist(
      [{ coord: { q: 0, r: 0 }, kind: "rune" }],
      allMist,
      3,
    );
    const ember = computeGlowMist(
      [{ coord: { q: 0, r: 0 }, kind: "ember" }],
      allMist,
      3,
    );
    expect(rune.get(coordKey({ q: 0, r: 0 }))?.intensity).toBe(
      GLOW_STRENGTH.rune,
    );
    expect(ember.get(coordKey({ q: 0, r: 0 }))?.intensity).toBe(
      GLOW_STRENGTH.ember,
    );
    expect(GLOW_STRENGTH.ember).toBeLessThan(GLOW_STRENGTH.rune);
  });

  it("gives the emitter hex itself intensity 1", () => {
    const emitter = { coord: { q: 0, r: 0 }, kind: "rune" as const };
    const result = computeGlowMist([emitter], allMist, 3);
    expect(result.get(coordKey(emitter.coord))?.intensity).toBe(1);
  });

  it("falls off monotonically with distance and is zero (excluded) beyond radius", () => {
    const emitter = { coord: { q: 0, r: 0 }, kind: "rune" as const };
    const radius = 3;
    const result = computeGlowMist([emitter], allMist, radius);

    let prevIntensity = Infinity;
    for (let d = 0; d <= radius; d++) {
      const hex = { q: d, r: 0 };
      const entry = result.get(coordKey(hex));
      expect(entry).toBeDefined();
      expect(entry!.intensity).toBeLessThanOrEqual(prevIntensity);
      if (d > 0) expect(entry!.intensity).toBeLessThan(prevIntensity);
      prevIntensity = entry!.intensity;
    }
    expect(result.has(coordKey({ q: radius + 1, r: 0 }))).toBe(false);
  });

  it("averages colour on a hex equidistant from a rune and an ember source", () => {
    // Two emitters 6 apart along the q axis; the midpoint hex is equidistant
    // (distance 3) from both, so it should read as a pure 50/50 blend.
    const rune = { coord: { q: -3, r: 0 }, kind: "rune" as const };
    const ember = { coord: { q: 3, r: 0 }, kind: "ember" as const };
    const mid: AxialCoord = { q: 0, r: 0 };
    expect(hexDistance(rune.coord, mid)).toBe(3);
    expect(hexDistance(ember.coord, mid)).toBe(3);

    const result = computeGlowMist([rune, ember], allMist, 3);
    const entry = result.get(coordKey(mid));
    expect(entry).toBeDefined();

    const runeColor = GLOW_COLORS.rune;
    const emberColor = GLOW_COLORS.ember;
    const expectedR = Math.round(
      (((runeColor >> 16) & 0xff) + ((emberColor >> 16) & 0xff)) / 2,
    );
    const expectedG = Math.round(
      (((runeColor >> 8) & 0xff) + ((emberColor >> 8) & 0xff)) / 2,
    );
    const expectedB = Math.round(
      ((runeColor & 0xff) + (emberColor & 0xff)) / 2,
    );
    const expectedColor = (expectedR << 16) | (expectedG << 8) | expectedB;
    expect(entry!.color).toBe(expectedColor);
  });

  it("excludes hexes isMistHex rejects, even within radius of an emitter", () => {
    const emitter = { coord: { q: 0, r: 0 }, kind: "ember" as const };
    const excluded: AxialCoord = { q: 1, r: 0 };
    const result = computeGlowMist(
      [emitter],
      (c) => coordKey(c) !== coordKey(excluded),
      3,
    );
    expect(result.has(coordKey(excluded))).toBe(false);
    // A same-distance hex that isn't excluded is still included.
    expect(result.has(coordKey({ q: 0, r: 1 }))).toBe(true);
  });

  it("is deterministic and keyed by coordKey", () => {
    const emitter = { coord: { q: 2, r: -1 }, kind: "rune" as const };
    const a = computeGlowMist([emitter], allMist, 2);
    const b = computeGlowMist([emitter], allMist, 2);
    expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
    for (const [k, v] of a) {
      expect(b.get(k)).toEqual(v);
    }
  });
});
