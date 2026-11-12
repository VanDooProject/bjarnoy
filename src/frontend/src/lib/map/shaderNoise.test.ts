import { describe, expect, it } from "vitest";
import { FOG_FIELD_FRAGMENT } from "./fog/fogShader";
import { WATER_FRAGMENT } from "./water/waterShader";
import { RIVER_FRAGMENT } from "./water/riverShader";
import { NOISE_LATTICE_GLSL } from "./shaderNoise";

// Every map fragment shader belongs in this list. A new one must be added here.
const MAP_FRAGMENT_SHADERS: Record<string, string> = {
  FOG_FIELD_FRAGMENT,
  WATER_FRAGMENT,
  RIVER_FRAGMENT,
};

const WHY =
  "float hashes are not bit-stable on mobile GPUs (Mali) and seam the noise along lattice lines; " +
  "use the texture-backed hash from shaderNoise.ts's NOISE_LATTICE_GLSL";

/** The argument text of every `fract(...)` call, with balanced parentheses. */
function fractArguments(src: string): string[] {
  const args: string[] = [];
  for (const m of src.matchAll(/\bfract\s*\(/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    args.push(src.slice(start, i - 1));
  }
  return args;
}

// A numeric literal >= 10 (two or more integer digits).
const BIG = /(?<![\w.])[1-9]\d+(?:\.\d*)?(?![\w.])/;

/** A `fract()` argument that multiplies by a large literal: the float-hash pattern. */
function isFloatHash(arg: string): boolean {
  const mul = arg.split("*").slice(1).join("*");
  return mul !== "" && BIG.test(mul);
}

describe.each(Object.entries(MAP_FRAGMENT_SHADERS))("%s noise", (name, src) => {
  it(`has no sin-based hash (${name})`, () => {
    expect(/fract\s*\(\s*sin\s*\(/.test(src), WHY).toBe(false);
  });

  it(`has no fract() hash scaled by a large literal (${name})`, () => {
    const offenders = fractArguments(src).filter(isFloatHash);
    expect(offenders, WHY).toEqual([]);
  });

  it(`defines hash only through NOISE_LATTICE_GLSL (${name})`, () => {
    expect(src.includes(NOISE_LATTICE_GLSL), WHY).toBe(true);
    expect(src.match(/\bfloat\s+hash\s*\(/g)?.length, WHY).toBe(1);
  });
});

describe("the guard itself", () => {
  it("flags the old Mali-unstable hash", () => {
    expect(
      fractArguments("p = fract(p * vec2(123.34, 456.21));").some(isFloatHash),
    ).toBe(true);
    expect(fractArguments("fract(x * 43758.5453)").some(isFloatHash)).toBe(
      true,
    );
    expect(fractArguments("fract(m.r * 8.0)").some(isFloatHash)).toBe(false);
  });
});
