export type BeatId = 'fire' | 'prophecy' | 'ravens' | 'sending' | 'hold' | 'landfall';
export type BeatRole = 'intro' | 'hold' | 'exit';
export interface BeatMeta {
  id: BeatId;
  role: BeatRole;
  durationMs: number;
  optional?: boolean;
  /** hold only: one loop period */
  loopMs?: number;
}
