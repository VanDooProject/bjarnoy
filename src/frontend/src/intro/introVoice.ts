import type { BeatId, BeatMeta } from './beats/types';
import type { IntroLocale } from './introText';

/** Length of each voice clip in ms (ffprobe of `audio/<locale>/<n>-<beat>.mp3`); `introVoice.test.ts` checks them against the files. */
export const CLIP_MS: Record<IntroLocale, Record<BeatId, number>> = {
  en: { fire: 6113, prophecy: 6609, sending: 10998, ravens: 7967, hold: 8281, landfall: 1071 },
  de: { fire: 6766, prophecy: 7393, sending: 12513, ravens: 8673, hold: 8046, landfall: 1228 },
};

/** Silence after a clip before the next beat starts. */
export const VOICE_TAIL_MS = 800;

/** The beats with the player's language timing: each intro beat lasts its clip plus the tail. Hold and landfall keep their meta. */
export function beatsFor(locale: IntroLocale, beats: BeatMeta[]): BeatMeta[] {
  return beats.map((b) => (b.role === 'intro' ? { ...b, durationMs: CLIP_MS[locale][b.id] + VOICE_TAIL_MS } : b));
}

/** Shortest hold: its clip plus the tail. */
export function holdMinMs(locale: IntroLocale): number {
  return CLIP_MS[locale].hold + VOICE_TAIL_MS;
}

const BEAT_ORDER: BeatId[] = ['fire', 'prophecy', 'sending', 'ravens', 'hold', 'landfall'];

// Hashed by Vite: `audio/<locale>/<n>-<beat>.mp3`.
const files = import.meta.glob<string>('./audio/*/*.mp3', { query: '?url', import: 'default', eager: true });
const CLIP_URLS: Partial<Record<IntroLocale, Partial<Record<BeatId, string>>>> = {};
for (const [path, url] of Object.entries(files)) {
  const m = /\/(en|de)\/\d+-([a-z]+)\.mp3$/.exec(path);
  if (!m) continue;
  (CLIP_URLS[m[1] as IntroLocale] ??= {})[m[2] as BeatId] = url;
}

/** The part of HTMLAudioElement the voice uses (so tests can inject a fake). */
export type VoiceAudio = Pick<
  HTMLAudioElement,
  'preload' | 'muted' | 'currentTime' | 'readyState' | 'src' | 'play' | 'pause' | 'load' | 'addEventListener' | 'removeEventListener'
>;

export type VoiceState = 'playing' | 'paused' | 'stopped';

/** The part of the Web Audio API the volume uses (so tests can inject a fake). */
export interface VoiceGain {
  gain: { value: number };
  connect: (destination: unknown) => unknown;
}
export interface VoiceAudioContext {
  destination: unknown;
  state?: string;
  resume?: () => Promise<void>;
  close?: () => Promise<void>;
  createGain: () => VoiceGain;
  createMediaElementSource: (audio: never) => { connect: (node: unknown) => unknown };
}

export interface IntroVoiceOptions {
  locale: IntroLocale;
  /** initial sound state; off still plays the clips, muted */
  sound: boolean;
  createAudio?: (url: string) => VoiceAudio;
  /** the browser refused sound without a user gesture: the voice switched sound off */
  onSoundBlocked?: () => void;
  /** current clip / state changed (for the host's data attributes) */
  onStateChange?: (beat: BeatId | null, state: VoiceState) => void;
  /** a clip finished loading (or failed to); called once at the start with 0 loaded */
  onLoadProgress?: (loaded: number, total: number) => void;
  createAudioContext?: () => VoiceAudioContext;
}

interface Clip {
  audio: VoiceAudio;
  loadStarted: boolean;
}

const HAVE_FUTURE_DATA = 3;

/**
 * The narration clips of the landing intro. Framework-free. A clip starts with its beat and plays on while the
 * sound is off (muted), so turning the sound on simply unmutes it at the point the beat has reached.
 */
export class IntroVoice {
  private readonly clips = new Map<BeatId, Clip>();
  private sound: boolean;
  private current: BeatId | null = null;
  private state: VoiceState = 'stopped';
  private beatStartedAt = 0;
  private pausedAt = 0;
  private cancelWait: (() => void) | null = null;
  private loadQueue: BeatId[] = [];
  private disposed = false;
  private volume = 1;
  private audioContext: VoiceAudioContext | null = null;
  private gain: VoiceGain | null = null;
  private readonly settled = new Set<BeatId>();
  private readonly opts: IntroVoiceOptions;
  private readonly create: (url: string) => VoiceAudio;

  constructor(opts: IntroVoiceOptions) {
    this.opts = opts;
    this.sound = opts.sound;
    this.create = opts.createAudio ?? ((url) => {
      const a = new Audio(url);
      return a;
    });
    for (const beat of BEAT_ORDER) {
      const url = CLIP_URLS[opts.locale]?.[beat];
      if (!url) continue;
      const audio = this.create(url);
      audio.preload = 'none';
      audio.muted = !this.sound;
      this.clips.set(beat, { audio, loadStarted: false });
      this.loadQueue.push(beat);
    }
    opts.onLoadProgress?.(0, this.clips.size);
    this.loadNext();
  }

  get soundOn(): boolean {
    return this.sound;
  }

  /** Loads the clips one after another so they do not compete with each other (and the map tiles). */
  private loadNext(): void {
    const beat = this.loadQueue.shift();
    if (beat === undefined || this.disposed) return;
    this.startLoad(beat, () => this.loadNext());
  }

  private startLoad(beat: BeatId, onDone?: () => void): void {
    const clip = this.clips.get(beat);
    if (!clip) return onDone?.();
    if (clip.loadStarted) return onDone?.();
    clip.loadStarted = true;
    const { audio } = clip;
    const done = () => {
      audio.removeEventListener('canplaythrough', done);
      audio.removeEventListener('error', done);
      if (!this.settled.has(beat)) {
        this.settled.add(beat);
        this.opts.onLoadProgress?.(this.settled.size, this.clips.size);
      }
      onDone?.();
    };
    audio.addEventListener('canplaythrough', done);
    audio.addEventListener('error', done);
    audio.preload = 'auto';
    audio.load();
    if (audio.readyState >= 4) done();
  }

  private emitState(): void {
    this.opts.onStateChange?.(this.current, this.state);
  }

  private seekTo(audio: VoiceAudio, ms: number): void {
    try {
      audio.currentTime = ms / 1000;
    } catch {
      // not seekable before its metadata is there; it starts at 0 anyway
    }
  }

  private halt(): void {
    this.cancelWait?.();
    this.cancelWait = null;
    if (this.current === null) return;
    const clip = this.clips.get(this.current);
    if (clip) {
      clip.audio.pause();
      this.seekTo(clip.audio, 0);
    }
  }

  /** The beat started `offsetMs` ago (after a seek): its clip plays from there, muted while the sound is off. */
  enterBeat(beat: BeatId, offsetMs = 0): void {
    if (this.disposed) return;
    this.halt();
    this.current = beat;
    this.beatStartedAt = Date.now() - offsetMs;
    this.state = 'playing';
    this.emitState();
    const clip = this.clips.get(beat);
    if (!clip) return;
    const { audio } = clip;
    if (!this.gain) audio.muted = !this.sound;
    this.startLoad(beat);
    if (offsetMs >= CLIP_MS[this.opts.locale][beat]) return; // the clip is over by then
    if (audio.readyState >= HAVE_FUTURE_DATA) {
      this.seekTo(audio, offsetMs);
      this.play(audio);
      return;
    }
    // not loaded yet: join at the point the beat has reached once it is
    const ready = () => {
      audio.removeEventListener('canplay', ready);
      this.cancelWait = null;
      if (this.current !== beat) return;
      const elapsed = (this.state === 'paused' ? this.pausedAt : Date.now()) - this.beatStartedAt;
      if (elapsed >= CLIP_MS[this.opts.locale][beat]) return;
      try {
        audio.currentTime = elapsed / 1000;
      } catch {
        // see rewind
      }
      if (this.state === 'paused') return; // resume() plays it
      this.play(audio);
    };
    audio.addEventListener('canplay', ready);
    this.cancelWait = () => audio.removeEventListener('canplay', ready);
  }

  private play(audio: VoiceAudio): void {
    const started = audio.play();
    if (!started) return;
    started.catch((error: unknown) => {
      if (this.disposed || !(error instanceof Error) || error.name !== 'NotAllowedError') return;
      if (!this.sound) return;
      // sound before any click: carry on muted
      this.sound = false;
      this.applyLevel();
      this.opts.onSoundBlocked?.();
      if (this.current !== null && this.clips.get(this.current)?.audio === audio && this.state === 'playing') {
        audio.play()?.catch(() => undefined);
      }
    });
  }

  /** Sound on/off: the clip is already running in sync, so this only (un)mutes it. */
  setSound(on: boolean): void {
    this.sound = on;
    if (on) this.ensureGain();
    this.applyLevel();
  }

  /** Volume 0..1. Goes through Web Audio, since iOS Safari keeps `audio.volume` read-only. */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.ensureGain();
    this.applyLevel();
  }

  private applyLevel(): void {
    if (this.gain) this.gain.gain.value = this.sound ? this.volume : 0;
    else for (const c of this.clips.values()) c.audio.muted = !this.sound;
  }

  /**
   * The first call happens in a user gesture, which is when an AudioContext may start: every clip is routed through
   * one gain node from then on (their own `muted` stays off, since a muted element feeds the context silence).
   */
  private ensureGain(): void {
    if (this.disposed) return;
    if (!this.gain) {
      try {
        const create = this.opts.createAudioContext ?? defaultAudioContext;
        const ctx = create();
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        for (const c of this.clips.values()) {
          ctx.createMediaElementSource(c.audio as never).connect(gain);
          c.audio.muted = false;
        }
        this.audioContext = ctx;
        this.gain = gain;
      } catch {
        return; // no Web Audio: the clips keep the muted switch and the volume has no effect
      }
    }
    if (this.audioContext?.state === 'suspended') this.audioContext.resume?.()?.catch(() => undefined);
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.pausedAt = Date.now();
    if (this.current !== null) this.clips.get(this.current)?.audio.pause();
    this.emitState();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.beatStartedAt += Date.now() - this.pausedAt;
    if (this.current !== null) {
      const audio = this.clips.get(this.current)?.audio;
      // a clip still loading starts by itself once ready
      const over = Date.now() - this.beatStartedAt >= CLIP_MS[this.opts.locale][this.current];
      if (audio && !over && audio.readyState >= HAVE_FUTURE_DATA && !this.cancelWait) this.play(audio);
    }
    this.emitState();
  }

  /** Stops the current clip; the next `enterBeat` plays again. */
  stop(): void {
    this.halt();
    this.current = null;
    this.state = 'stopped';
    this.emitState();
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.loadQueue = [];
    for (const c of this.clips.values()) {
      c.audio.pause();
      c.audio.src = '';
    }
    this.clips.clear();
    this.audioContext?.close?.()?.catch(() => undefined);
    this.audioContext = null;
    this.gain = null;
  }
}

function defaultAudioContext(): VoiceAudioContext {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error('no Web Audio');
  return new Ctor() as unknown as VoiceAudioContext;
}
