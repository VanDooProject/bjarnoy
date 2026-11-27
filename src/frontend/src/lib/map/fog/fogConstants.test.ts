// The backend decides which rival data a read delivers from where the client's fog is fully opaque, so these numbers are
// owned by the backend too: FogVisionRadii.MistOpaqueAtRamp / SourceMistOpaqueMargin / ArmyFogWhiteOffsetHexes /
// ArmyFogWhiteMarginHexes / ArmyMistOpaqueMargin and FogMaskOptions.DefaultUnknownMarginHexes, pinned by
// `FogVisionRadiiTests.The_fog_opacity_constants_the_rival_gate_reads_are_pinned`. This is its frontend half: change a value
// here and the backend (and the pin there) has to change with it, or rivals appear and vanish at the wrong distance.
import { describe, expect, it } from 'vitest';
import { FOG_MIST_OPAQUE_AT_RAMP, OUT_OF_SIGHT_RAMP_MARGIN_HEXES, UNKNOWN_RAMP_MARGIN_HEXES, SOURCE_MIST_OPAQUE_MARGIN_HEXES } from './fogRamp';
import { ARMY_FOG_BLACK_MARGIN, ARMY_FOG_WHITE_MARGIN, ARMY_FOG_WHITE_OFFSET, ARMY_MIST_OPAQUE_MARGIN_HEXES } from './FogMaskLayer';

describe('fog opacity constants shared with the backend', () => {
  it('pins the numbers the backend rival gate reads', () => {
    expect(FOG_MIST_OPAQUE_AT_RAMP).toBeCloseTo(0.8, 12);
    expect(UNKNOWN_RAMP_MARGIN_HEXES).toBe(14);
    expect(ARMY_FOG_WHITE_OFFSET).toBe(0.75);
    expect(ARMY_FOG_WHITE_MARGIN).toBe(6);
  });

  // The shader's dark edge window is in ramp units of the mask's dark margin (`FogMaskOptions.OutOfSightMarginHexes`, 4), and
  // the troop's dark ramp shares that window, so its margin must be the same width.
  it('keeps the dark ramp widths in step with the backend mask and with the troop ramp', () => {
    expect(OUT_OF_SIGHT_RAMP_MARGIN_HEXES).toBe(4);
    expect(ARMY_FOG_BLACK_MARGIN).toBe(OUT_OF_SIGHT_RAMP_MARGIN_HEXES);
  });

  it('derives the two visible-past-the-source margins the backend uses', () => {
    expect(SOURCE_MIST_OPAQUE_MARGIN_HEXES).toBeCloseTo(11.2, 9);
    expect(ARMY_MIST_OPAQUE_MARGIN_HEXES).toBeCloseTo(5.55, 9);
  });
});
