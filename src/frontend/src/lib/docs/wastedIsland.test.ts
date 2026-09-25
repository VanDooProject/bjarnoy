// Guards the Wasted Lands docs page's "turning island" data (WastedIsland.vue
// renders whatever this produces): every generated frame name must be a real
// showcase atlas frame (so an art-pack rename shows up here, not as a blank
// tile on the docs page), the two giants must cover exactly seven hexes each
// with no overlap against the rest of the island, and the "never put a tall
// tile in front of Utgard" rule must hold for every one of the six rotations
// the page's rotate buttons can reach.
import { describe, expect, it } from "vitest";
import { buildIsland, resolvesDirectly } from "./wastedIsland";
import { hexDistance } from "../hex/coords";

const ORIGIN = { q: 0, r: 0 };
const ROTATIONS = [0, 1, 2, 3, 4, 5];

describe("buildIsland", () => {
  for (const rotation of ROTATIONS) {
    describe(`rotation ${rotation}`, () => {
      const placements = buildIsland(rotation);

      it("resolves every living and wasted frame without the fallback chain", () => {
        for (const p of placements) {
          expect(
            resolvesDirectly(p.livingFrame),
            `${p.key} living "${p.livingFrame}"`,
          ).toBe(true);
          expect(
            resolvesDirectly(p.wastedFrame),
            `${p.key} wasted "${p.wastedFrame}"`,
          ).toBe(true);
        }
      });

      it("has exactly two giants, each covering seven hexes", () => {
        const giants = placements.filter(
          (p) => p.kind === "utgard" || p.kind === "volcano",
        );
        expect(giants).toHaveLength(2);
        for (const g of giants) expect(g.hexes).toHaveLength(7);
      });

      it("covers no hex twice", () => {
        const seen = new Set<string>();
        for (const p of placements) {
          for (const h of p.hexes) {
            const key = `${h.q},${h.r}`;
            expect(seen.has(key), `hex ${key} covered twice`).toBe(false);
            seen.add(key);
          }
        }
      });

      it("never places forest/mountain immediately around the Utgard flower", () => {
        // The ring at hex-distance 2 from Utgard's centre (origin, fixed under
        // rotation) is exactly the ring adjacent to the 7-hex flower — over the
        // full 0..5 rotation sweep every hex in it ends up "south of Utgard" at
        // some rotation, so none of them may ever carry a tall sprite.
        for (const p of placements) {
          if (p.kind !== "forest" && p.kind !== "mountain") continue;
          for (const h of p.hexes) {
            expect(hexDistance(h, ORIGIN)).not.toBe(2);
          }
        }
      });

      it("is sorted by depth ascending", () => {
        for (let i = 1; i < placements.length; i++) {
          expect(placements[i]!.depth).toBeGreaterThanOrEqual(
            placements[i - 1]!.depth,
          );
        }
      });

      it("has turnsAt within 1..4", () => {
        for (const p of placements) {
          expect(p.turnsAt).toBeGreaterThanOrEqual(1);
          expect(p.turnsAt).toBeLessThanOrEqual(4);
        }
      });
    });
  }

  it("turnsAt is monotone with ring: flower(1) <= land/volcano(2) <= coast(3) <= sea(4)", () => {
    const placements = buildIsland(0);
    const byKind = new Map(placements.map((p) => [p.kind, p.turnsAt] as const));
    expect(byKind.get("utgard")).toBe(1);
    expect(byKind.get("volcano")).toBe(2);
    for (const p of placements) {
      if (
        p.kind === "grass" ||
        p.kind === "forest" ||
        p.kind === "mountain" ||
        p.kind === "sand"
      ) {
        expect(p.turnsAt).toBe(2);
      } else if (p.kind === "coast") {
        expect(p.turnsAt).toBe(3);
      } else if (p.kind === "sea") {
        expect(p.turnsAt).toBe(4);
      }
    }
  });

  it("produces a stable, rotation-independent set of placement keys", () => {
    const keys0 = new Set(buildIsland(0).map((p) => p.key));
    const keys3 = new Set(buildIsland(3).map((p) => p.key));
    expect(keys3).toEqual(keys0);
  });
});
