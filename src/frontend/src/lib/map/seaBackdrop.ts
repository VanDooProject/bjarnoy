// The world map's open-sea backdrop, drawn by the renderer itself. The canvas used to stay transparent over open sea with a CSS
// gradient on the container behind it; the fog's dark tier (fog/FogDesaturateFilter) can only grey what is in the canvas, so
// wherever the water mesh did not cover (it only spans the last baked water-mask rect) the CSS teal stayed saturated. This quad
// sits at the bottom of `underFogLayer`, inside the filtered subtree, so the dark tier greys it like everything else.
import { GlProgram, Mesh, MeshGeometry, Shader } from 'pixi.js';
import { hexToRgb01 } from './shaderResources';

export interface SeaGradientStop {
  /** Position along the gradient, 0 at the centre to 1 at the ellipse's edge. */
  at: number;
  color: number;
}

/**
 * The world map's sea gradient, the single source for the backdrop and the water mesh's shallow/deep colours (WaterLayer).
 * An elliptical radial gradient in screen space, the same shape as CSS `radial-gradient(115% 100% at 45% 40%, ...)`: `centre`
 * and `radius` are fractions of the screen width and height, and a pixel's position along the gradient is
 * `t = length((p - centre) / radius)`. Colours mix in sRGB between stops and stay at the last stop past it.
 */
export const WORLD_SEA_GRADIENT = {
  centre: [0.45, 0.4],
  radius: [1.15, 1.0],
  stops: [
    { at: 0, color: 0x2a92ae },
    { at: 0.48, color: 0x14657f },
    { at: 1, color: 0x0b3c50 },
  ],
} as const satisfies { centre: readonly [number, number]; radius: readonly [number, number]; stops: readonly SeaGradientStop[] };

const cssPercent = (n: number): string => `${Math.round(n * 1000) / 10}%`;
const cssHex = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

/**
 * The same gradient as a CSS background, for the map container behind the canvas: what shows before the renderer's first
 * frame and after a lost WebGL context. The dark tier never sees it (the canvas is opaque over it in world mode).
 */
export const WORLD_SEA_GRADIENT_CSS = `radial-gradient(${cssPercent(WORLD_SEA_GRADIENT.radius[0])} ${cssPercent(WORLD_SEA_GRADIENT.radius[1])} at ${cssPercent(WORLD_SEA_GRADIENT.centre[0])} ${cssPercent(WORLD_SEA_GRADIENT.centre[1])}, ${WORLD_SEA_GRADIENT.stops.map((s) => `${cssHex(s.color)} ${cssPercent(s.at)}`).join(', ')})`;

const glFloat = (n: number): string => n.toFixed(6);
const glVec3 = (hex: number): string => `vec3(${hexToRgb01(hex).map(glFloat).join(', ')})`;

/** GLSL for the piecewise mix between consecutive stops, generated from the gradient data so no number is copied by hand. */
function gradientGlsl(): string {
  const { stops } = WORLD_SEA_GRADIENT;
  const lines = [`vec3 col = ${glVec3(stops[0].color)};`];
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1];
    const to = stops[i];
    lines.push(
      `col = mix(col, ${glVec3(to.color)}, clamp((t - ${glFloat(from.at)}) / ${glFloat(to.at - from.at)}, 0.0, 1.0));`,
    );
  }
  return lines.join('\n  ');
}

/** A normal screen-space Pixi mesh vertex stage (positions in screen pixels through Pixi's matrices), passing the 0..1 UV on. */
export const SEA_BACKDROP_VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  vUV = aUV;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
`;

export const SEA_BACKDROP_FRAGMENT = `
precision highp float;
in vec2 vUV;
out vec4 finalColor;

void main() {
  vec2 centre = vec2(${glFloat(WORLD_SEA_GRADIENT.centre[0])}, ${glFloat(WORLD_SEA_GRADIENT.centre[1])});
  vec2 radius = vec2(${glFloat(WORLD_SEA_GRADIENT.radius[0])}, ${glFloat(WORLD_SEA_GRADIENT.radius[1])});
  float t = length((vUV - centre) / radius);
  ${gradientGlsl()}
  finalColor = vec4(col, 1.0);
}
`;

let sharedGlProgram: GlProgram | null = null;
function seaBackdropGlProgram(): GlProgram {
  sharedGlProgram ??= new GlProgram({ vertex: SEA_BACKDROP_VERTEX, fragment: SEA_BACKDROP_FRAGMENT, name: 'sea-backdrop' });
  return sharedGlProgram;
}

export class SeaBackdrop {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly geometry: MeshGeometry;

  constructor() {
    this.geometry = new MeshGeometry({
      positions: new Float32Array(8),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.mesh = new Mesh({ geometry: this.geometry, shader: new Shader({ glProgram: seaBackdropGlProgram(), resources: {} }) });
    // A screen-covering quad under everything must not swallow clicks meant for the hexes above it.
    this.mesh.eventMode = 'none';
  }

  /** Covers the screen rectangle 0..width x 0..height. */
  resize(width: number, height: number): void {
    this.geometry.getBuffer('aPosition').data = new Float32Array([0, 0, width, 0, width, height, 0, height]);
  }

  destroy(): void {
    this.mesh.destroy();
  }
}
