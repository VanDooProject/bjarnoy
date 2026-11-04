import type { InjectionKey, Ref } from 'vue';

export type BeatId = 'fire' | 'prophecy' | 'ravens' | 'sending' | 'hold' | 'landfall';
export type BeatRole = 'intro' | 'hold' | 'exit';
export interface BeatMeta {
  id: BeatId;
  role: BeatRole;
  durationMs: number;
  /** hold only: one loop period */
  loopMs?: number;
  /** Beats with the same scene share one mounted component: the host switches beats on it instead of crossfading. */
  scene?: string;
}

/** The current beat, provided by the host to beats that span more than one beat (see `scene`). */
export const INTRO_BEAT: InjectionKey<Readonly<Ref<BeatId>>> = Symbol('introBeat');

/** The length of a beat in the player's language (its voice clip plus tail), provided by the host to beats that start from another beat's end. */
export const INTRO_BEAT_MS: InjectionKey<(id: BeatId) => number> = Symbol('introBeatMs');
