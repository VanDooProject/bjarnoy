// zip 9: "unexplored hexes are hidden" — a dense white mist, distinct from
// the darker grey used for the scouted-but-not-visible ring (FOG_SCOUTED).
// Drawn as a per-hex fill rather than a fixed CSS backdrop so it keeps
// covering new hexes as the camera pans past the settlement's explored
// radius, instead of a static gradient behind the terrain that peters out
// and makes the map read as a bounded box.
export const FOG_UNEXPLORED = 0xe9f0f4;
/** Same colour as CSS; the landing intro's closing fog fades into it. */
export const FOG_UNEXPLORED_CSS = '#e9f0f4';
