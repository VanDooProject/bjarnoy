// Fog v2's mist stage quad (§4: "white mist", the never-scouted tier). A cheap composite: it samples the shared FogField
// textures (FogField.ts, which runs the expensive mask/noise shader once for both tiers) at its pixel's world position and
// tints the G channel with the constant mist colour. It is a quad of its own because markerLayer sits under it in the
// stage: the mist covers the markers. The dark tier is not a quad: FogDesaturateFilter greys what is under the markers.
import { GlProgram, Mesh, MeshGeometry, Shader, UniformGroup } from 'pixi.js';
import { hexToRgb01 } from '../shaderResources';
import { FOG_COMPOSITE_FRAGMENT, FOG_VERTEX } from './fogShader';
import { ARMY_FOG_WHITE_MARGIN, ARMY_FOG_WHITE_OFFSET, FOG_MIST_OPAQUE_AT_RAMP, OUT_OF_SIGHT_RAMP_MARGIN_HEXES } from './fogRamp';
import type { FogField } from './FogField';

/** One live army's fog reveal: its world-space point and its own vision radius in hexes (`ArmyResponse.visionRadius`). */
export interface ArmyVisionSource {
  x: number;
  y: number;
  radiusHexes: number;
}

/**
 * The troop's own fog ramps (fogShader.ts's armyRamps), in hexes. Offsets are
 * relative to the army vision radius R. The black (out-of-sight) ramp starts
 * a quarter hex inside the sight radius — pulled in so the dark band reads
 * before the white — and fades over the same 4 hexes as the mask's dark ramp (the shader's dark edge window is in ramp units of that width); the white (unknown) ramp starts
 * 0.75 hex past it and fades over 6 hexes, versus the village's 14, so the
 * troop's edge is the village look at a smaller scale.
 */
export const ARMY_FOG_BLACK_OFFSET = -0.25;
export const ARMY_FOG_BLACK_MARGIN = OUT_OF_SIGHT_RAMP_MARGIN_HEXES;
export { ARMY_FOG_WHITE_OFFSET, ARMY_FOG_WHITE_MARGIN };

/**
 * How far from a troop, in hex-euclidean distance, its fog can show the ground: past
 * `FOG_MIST_OPAQUE_AT_RAMP` of the troop's own white ramp the edge noise is shut off and the mist is fully opaque
 * (the same bound the settlement terrain cull uses). HexMapRenderer's terrain cull draws ground out to here.
 */
export function armyFogClearReachHexes(visionRadiusHexes: number): number {
  return visionRadiusHexes + ARMY_MIST_OPAQUE_MARGIN_HEXES;
}

/**
 * How far past a troop's vision radius the ground is still visible through its mist (5.55): the part of `armyFogClearReachHexes`
 * that does not depend on the radius. The backend's `FogVisionRadii.ArmyMistOpaqueMargin` decides which rival data to deliver
 * from the same numbers.
 */
export const ARMY_MIST_OPAQUE_MARGIN_HEXES = ARMY_FOG_WHITE_OFFSET + ARMY_FOG_WHITE_MARGIN * FOG_MIST_OPAQUE_AT_RAMP;

// NOISE_REACH and FOG_MIST_OPAQUE_AT_RAMP live in fogRamp.ts (no pixi there, so FogCoverage and the store can read them).
export { FOG_MIST_OPAQUE_AT_RAMP };

let sharedGlProgram: GlProgram | null = null;
function fogCompositeGlProgram(): GlProgram {
  sharedGlProgram ??= new GlProgram({ vertex: FOG_VERTEX, fragment: FOG_COMPOSITE_FRAGMENT, name: 'fog-composite' });
  return sharedGlProgram;
}

/** The screen-covering quad both the field pass and the composite quads draw. */
export function fullscreenGeometry(): MeshGeometry {
  // Clip-space corners paired with DOM-style (top=0) UVs — see fogShader.ts's
  // vertex shader: this mesh always covers the whole framebuffer, with no
  // projection/world matrix of its own, so the geometry itself is the only
  // place the screen-covering quad is defined.
  return new MeshGeometry({
    positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
    uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
}

export class FogMaskLayer {
  readonly mesh: Mesh<MeshGeometry, Shader>;

  constructor(unexploredColor: number, field: FogField) {
    const [unexploredR, unexploredG, unexploredB] = hexToRgb01(unexploredColor);

    const mistUniforms = new UniformGroup({
      uUnexploredColor: { value: new Float32Array([unexploredR, unexploredG, unexploredB]), type: 'vec3<f32>' },
    });

    const shader = new Shader({
      glProgram: fogCompositeGlProgram(),
      resources: {
        fogMistUniforms: mistUniforms,
        fogFieldUniforms: field.compositeUniforms,
        uFieldA: field.textures[0].source,
        uFieldB: field.textures[1].source,
      },
    });

    this.mesh = new Mesh({ geometry: fullscreenGeometry(), shader });
    // A screen-space full-viewport quad in clip space needs no hit-testing —
    // and would otherwise sit directly over every hex, army marker, and
    // waypoint pin underneath it.
    this.mesh.eventMode = 'none';
  }

  destroy(): void {
    this.mesh.destroy();
  }
}
