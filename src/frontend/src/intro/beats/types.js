/** The current beat, provided by the host to beats that span more than one beat (see `scene`). */
export const INTRO_BEAT = Symbol('introBeat');
/** The length of a beat in the player's language (its voice clip plus tail), provided by the host to beats that start from another beat's end. */
export const INTRO_BEAT_MS = Symbol('introBeatMs');
