import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BEATS } from './beats/registry';
import type { BeatId } from './beats/types';
import { beatsFor, CLIP_MS, holdMinMs, IntroVoice, VOICE_TAIL_MS, type VoiceAudio } from './introVoice';

const AUDIO_DIR = join(__dirname, 'audio');
const BEAT_IDS: BeatId[] = ['fire', 'prophecy', 'sending', 'ravens', 'hold', 'landfall'];

/** Duration of an MP3 in ms: walks the frame headers (MPEG-1 Layer III), skipping an ID3v2 tag. */
function mp3DurationMs(file: string): number {
  const buf = readFileSync(file);
  let pos = 0;
  if (buf.toString('latin1', 0, 3) === 'ID3') {
    pos = 10 + ((buf[6] & 0x7f) << 21) + ((buf[7] & 0x7f) << 14) + ((buf[8] & 0x7f) << 7) + (buf[9] & 0x7f);
  }
  const bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const rates = [44100, 48000, 32000];
  let samples = 0;
  let rate = 44100;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) {
      pos++;
      continue;
    }
    const version = (buf[pos + 1] >> 3) & 3;
    const layer = (buf[pos + 1] >> 1) & 3;
    const bitrate = bitrates[buf[pos + 2] >> 4];
    const rateIdx = (buf[pos + 2] >> 2) & 3;
    if (version !== 3 || layer !== 1 || !bitrate || rateIdx === 3) {
      pos++;
      continue;
    }
    rate = rates[rateIdx];
    const padding = (buf[pos + 2] >> 1) & 1;
    samples += 1152;
    pos += Math.floor((144 * bitrate * 1000) / rate) + padding;
  }
  return (samples / rate) * 1000;
}

describe('voice clip lengths', () => {
  for (const locale of ['en', 'de'] as const) {
    it(`${locale}: has all six beats, each within 30 ms of its mp3`, () => {
      expect(Object.keys(CLIP_MS[locale]).sort()).toEqual([...BEAT_IDS].sort());
      const files = readdirSync(join(AUDIO_DIR, locale));
      expect(files).toHaveLength(6);
      for (const file of files) {
        const beat = /^\d+-([a-z]+)\.mp3$/.exec(file)![1] as BeatId;
        expect(Math.abs(mp3DurationMs(join(AUDIO_DIR, locale, file)) - CLIP_MS[locale][beat]), `${locale}/${file}`).toBeLessThanOrEqual(30);
      }
    });
  }
});

describe('beatsFor / holdMinMs', () => {
  it('intro beats last clip + tail, hold and landfall keep their meta', () => {
    for (const locale of ['en', 'de'] as const) {
      for (const b of beatsFor(locale, BEATS)) {
        const orig = BEATS.find((o) => o.id === b.id)!;
        if (b.role === 'intro') expect(b.durationMs).toBe(CLIP_MS[locale][b.id] + VOICE_TAIL_MS);
        else expect(b).toEqual(orig);
      }
      expect(holdMinMs(locale)).toBe(CLIP_MS[locale].hold + VOICE_TAIL_MS);
    }
  });
});

class FakeAudio {
  preload = 'none';
  muted = false;
  currentTime = 0;
  readyState = 0;
  paused = true;
  loaded = false;
  plays: number[] = [];
  rejectWith: string | null = null;
  private listeners = new Map<string, Set<() => void>>();
  src: string;
  constructor(src: string) {
    this.src = src;
  }
  load() {
    this.loaded = true;
  }
  play() {
    if (this.rejectWith && !this.muted) {
      const err = new Error('blocked');
      err.name = this.rejectWith;
      return Promise.reject(err);
    }
    this.paused = false;
    this.plays.push(this.currentTime);
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener(type: string, fn: () => void) {
    (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)!).add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn);
  }
  fire(type: string) {
    if (type === 'canplay') this.readyState = 3;
    if (type === 'canplaythrough') this.readyState = 4;
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }
  ready() {
    this.fire('canplay');
    this.fire('canplaythrough');
  }
}

describe('IntroVoice', () => {
  let made: FakeAudio[];
  const byBeat = (beat: BeatId) => made[BEAT_IDS.indexOf(beat)];
  const make = (sound = false, extra: Partial<ConstructorParameters<typeof IntroVoice>[0]> = {}) =>
    new IntroVoice({
      locale: 'en',
      sound,
      createAudio: (url) => {
        const a = new FakeAudio(url);
        made.push(a);
        return a as unknown as VoiceAudio;
      },
      ...extra,
    });
  beforeEach(() => {
    made = [];
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it('loads the clips of its language one after another in beat order, starting at once', () => {
    make();
    expect(made.map((a) => /\/(\d)-/.exec(a.src)![1])).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(made.map((a) => a.loaded)).toEqual([true, false, false, false, false, false]);
    byBeat('fire').fire('canplaythrough');
    expect(byBeat('prophecy').loaded).toBe(true);
    expect(byBeat('sending').loaded).toBe(false);
    byBeat('prophecy').fire('error'); // a failed clip does not block the rest
    expect(byBeat('sending').loaded).toBe(true);
    expect(byBeat('fire').preload).toBe('auto');
  });

  it('plays a ready clip from its start, muted while the sound is off', () => {
    const v = make(false);
    byBeat('fire').ready();
    byBeat('fire').currentTime = 2;
    v.enterBeat('fire');
    expect(byBeat('fire').plays).toEqual([0]);
    expect(byBeat('fire').muted).toBe(true);
  });

  it('setSound flips muted on the running clip without restarting it', () => {
    const v = make(false);
    byBeat('fire').ready();
    v.enterBeat('fire');
    byBeat('fire').currentTime = 3;
    v.setSound(true);
    expect(byBeat('fire').muted).toBe(false);
    expect(byBeat('fire').currentTime).toBe(3);
    expect(byBeat('fire').plays).toHaveLength(1);
    v.setSound(false);
    expect(byBeat('fire').muted).toBe(true);
  });

  it('the next beat takes the current sound state and stops the previous clip', () => {
    const v = make(true);
    byBeat('fire').ready();
    byBeat('prophecy').ready();
    v.enterBeat('fire');
    v.setSound(false);
    v.enterBeat('prophecy');
    expect(byBeat('prophecy').muted).toBe(true);
    expect(byBeat('fire').paused).toBe(true);
  });

  it('pause and resume pause and continue the clip', () => {
    const v = make(true);
    byBeat('fire').ready();
    v.enterBeat('fire');
    v.pause();
    expect(byBeat('fire').paused).toBe(true);
    v.resume();
    expect(byBeat('fire').paused).toBe(false);
    expect(byBeat('fire').plays).toHaveLength(2);
  });

  it('skip: landfall stops the previous clip and plays its own; a dropped beat is never played', () => {
    const v = make(true);
    for (const a of made) a.ready();
    v.enterBeat('sending');
    v.enterBeat('hold'); // ravens dropped
    v.enterBeat('landfall');
    expect(byBeat('hold').paused).toBe(true);
    expect(byBeat('landfall').paused).toBe(false);
    expect(byBeat('ravens').plays).toEqual([]);
  });

  it('the hold clip plays once per hold entry, not per loop cycle', () => {
    const v = make(true);
    for (const a of made) a.ready();
    v.enterBeat('hold');
    // loop cycles keep the beat: the host does not enter it again
    vi.advanceTimersByTime(30_000);
    expect(byBeat('hold').plays).toHaveLength(1);
  });

  it('a clip that is not ready yet starts once ready, at the time the beat has reached', () => {
    const v = make(true);
    v.enterBeat('prophecy');
    expect(byBeat('prophecy').loaded).toBe(true);
    expect(byBeat('prophecy').plays).toEqual([]);
    vi.advanceTimersByTime(2500);
    byBeat('prophecy').fire('canplay');
    expect(byBeat('prophecy').plays).toEqual([2.5]);
  });

  it('a late clip that is past its end is skipped; paused time does not count', () => {
    const v = make(true);
    v.enterBeat('landfall');
    vi.advanceTimersByTime(CLIP_MS.en.landfall + 10);
    byBeat('landfall').fire('canplay');
    expect(byBeat('landfall').plays).toEqual([]);

    v.enterBeat('fire');
    vi.advanceTimersByTime(1000);
    v.pause();
    vi.advanceTimersByTime(5000);
    v.resume();
    vi.advanceTimersByTime(500);
    byBeat('fire').fire('canplay');
    expect(byBeat('fire').plays).toEqual([1.5]);
  });

  it('stop halts the clip; dispose drops everything', () => {
    const states: string[] = [];
    const v = make(true, { onStateChange: (b, s) => states.push(`${b}:${s}`) });
    byBeat('fire').ready();
    v.enterBeat('fire');
    v.stop();
    expect(byBeat('fire').paused).toBe(true);
    v.dispose();
    v.enterBeat('fire');
    expect(byBeat('fire').plays).toHaveLength(1);
    expect(states).toEqual(['fire:playing', 'null:stopped', 'null:stopped']);
  });

  it('NotAllowedError with sound on: sound goes off, the host is told, the clip plays muted', async () => {
    const onSoundBlocked = vi.fn();
    const v = make(true, { onSoundBlocked });
    byBeat('fire').ready();
    byBeat('fire').rejectWith = 'NotAllowedError';
    v.enterBeat('fire');
    await vi.advanceTimersByTimeAsync(0);
    expect(onSoundBlocked).toHaveBeenCalledTimes(1);
    expect(v.soundOn).toBe(false);
    expect(byBeat('fire').muted).toBe(true);
    expect(byBeat('fire').paused).toBe(false);
  });
});
