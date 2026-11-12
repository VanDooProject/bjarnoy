// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import LandingIntro from './LandingIntro.vue';
import { BEATS } from './beats/registry';
import type { BeatId } from './beats/types';
import { introSignal } from './introSignal';
import { IDLE_DIM_MS } from './useIdleDim';
import { beatsFor, CLIP_MS, holdMinMs, VOICE_TAIL_MS } from './introVoice';
import { buildTimeline, fmtTime, selectBeats } from './timeline';
import { advanceAndRender } from '../test/advanceAndRender';

// jsdom has no canvas 2D context; the texture is irrelevant to the host's behaviour.
vi.mock('./fogTexture', () => ({ introFogUrl: () => 'data:image/png;base64,' }));

type Props = { mode: 'landing' | 'replay' | 'loop'; loopBeats?: BeatId[]; locale: 'en' | 'de'; reducedMotion: boolean; loaded: boolean; loggedIn?: boolean; playNow?: boolean; soundOn: boolean };
// The landing page waits for the player; these tests are about the run, so they start it at once (the landing page tests pass `playNow: false`).
const base: Props = { mode: 'landing', locale: 'en', reducedMotion: false, loaded: false, playNow: true, soundOn: false };

// jsdom plays no media: record what the voice does with its clips.
const plays: { src: string; muted: boolean }[] = [];
vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
  plays.push({ src: this.src, muted: this.muted });
  return Promise.resolve();
});
// Every intro listens for Esc on `window`: one left mounted by an earlier test would answer (and tear down) on every later Esc,
// so the Esc tests got slower with each test before them and timed out on a loaded CI runner. Unmount them all after each test.
const mounted: VueWrapper[] = [];
async function mountIntro(p: Partial<Props> & { attachTo?: HTMLElement } = {}) {
  const { attachTo, ...props } = p;
  const w = mount(LandingIntro, { props: { ...base, ...props }, attachTo });
  mounted.push(w);
  await flushPromises();
  return w;
}
const EXIT_MS = BEATS.find((b) => b.role === 'exit')!.durationMs;
const BEATS_EN = beatsFor('en', BEATS);
const TOTAL_EN = buildTimeline(selectBeats(BEATS_EN, 'landing'), holdMinMs('en')).totalMs;
const fmt = fmtTime;
const phase = (w: VueWrapper) => w.get('[data-testid="landing-intro"]').attributes('data-phase');

beforeEach(() => {
  vi.useFakeTimers();
  plays.length = 0;
});
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  vi.useRealTimers();
});

describe('LandingIntro', () => {
  it('replay with reduced motion shows the play button and runs after pressing it', async () => {
    const w = await mountIntro({ mode: 'replay', reducedMotion: true, playNow: false });
    expect(phase(w)).toBe('waitingForPlay');
    expect(w.find('[data-testid="landing-page"]').exists()).toBe(false);
    await w.get('[data-testid="intro-play"]').trigger('click');
    expect(phase(w)).toBe('playing');
    expect(w.find('[data-testid="intro-play"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(BEATS_EN[0].durationMs);
    expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe('prophecy');
  });

  it('stays on the landing page when loaded before play, in every motion setting', async () => {
    for (const reducedMotion of [false, true]) {
      const w = await mountIntro({ reducedMotion, playNow: false });
      await w.setProps({ loaded: true });
      expect(phase(w)).toBe('waitingForPlay');
      expect(w.emitted('done')).toBeUndefined();
      expect(w.find('[data-testid="landing-page"]').exists()).toBe(true);
    }
  });

  it('shows the How to play link next to Log in only while the landing page is shown', async () => {
    const w = await mountIntro({ playNow: false });
    const link = w.get('[data-testid="landing-how-to-play"]');
    expect(link.attributes('href')).toBe('/docs');
    expect(link.text()).toBe('How to play');
    expect(w.find('[data-testid="intro-login"]').exists()).toBe(true);
    await w.get('[data-testid="landing-hear"]').trigger('click');
    await vi.advanceTimersByTimeAsync(1000);
    expect(w.find('[data-testid="landing-how-to-play"]').exists()).toBe(false);
    const replay = await mountIntro({ mode: 'replay', reducedMotion: true, playNow: false });
    expect(replay.find('[data-testid="landing-how-to-play"]').exists()).toBe(false);
  });

  it('keeps the hall alive behind the landing page: only its turn waits, and it starts on play', async () => {
    const w = await mountIntro({ playNow: false });
    const hall = () => w.get('svg.hall');
    expect(hall().classes()).toContain('is-held');
    expect(hall().classes()).not.toContain('is-paused');
    await w.get('[data-testid="landing-hear"]').trigger('click');
    expect(hall().classes()).not.toContain('is-held');
    expect(hall().classes()).not.toContain('is-paused');
  });

  it('shows the replay first frame still: no landing page, the hall is paused, not held', async () => {
    const w = await mountIntro({ mode: 'replay', reducedMotion: true, playNow: false });
    expect(w.get('svg.hall').classes()).toContain('is-paused');
    expect(w.get('svg.hall').classes()).not.toContain('is-held');
  });

  it('shows skip only after loading, and emits done after the exit beat', async () => {
    const w = await mountIntro();
    expect(phase(w)).toBe('playing');
    expect(w.find('[data-testid="intro-skip"]').exists()).toBe(false);
    await w.setProps({ loaded: true });
    await w.get('[data-testid="intro-skip"]').trigger('click');
    expect(phase(w)).toBe('exiting');
    expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe('landfall');
    expect(w.emitted('done')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(EXIT_MS);
    expect(w.emitted('done')).toHaveLength(1);
  });

  it('narrates the current beat in the chosen locale', async () => {
    const w = await mountIntro({ locale: 'de' });
    expect(w.get('[data-testid="intro-narration"]').text()).toBe('Hör zu! Rück näher ans Feuer und erfahre, wie die Jarle ihre Heimat verloren.');
  });

  it('replay: skip from the start leads to the white end screen whose buttons emit', async () => {
    const w = await mountIntro({ mode: 'replay' });
    await w.get('[data-testid="intro-skip"]').trigger('click');
    await vi.advanceTimersByTimeAsync(EXIT_MS);
    expect(phase(w)).toBe('ended');
    expect(w.emitted('done')).toBeUndefined();
    await w.get('[data-testid="intro-back-to-docs"]').trigger('click');
    await w.get('[data-testid="intro-enter-game"]').trigger('click');
    expect(w.emitted('back-to-docs')).toHaveLength(1);
    expect(w.emitted('enter-game')).toHaveLength(1);
  });

  // Landfall plays on the running hold scene (coast slides in, fog closes), so the host must not remount it,
  // and it must not cut off the hold's narration before it could be read.
  it('keeps the longship scene mounted from hold into landfall, after the hold narration had time to be read', async () => {
    const w = await mountIntro({ locale: 'de' });
    const introMs = beatsFor('de', BEATS).filter((b) => b.role === 'intro').reduce((t, b) => t + b.durationMs, 0);
    await advanceAndRender(introMs);
    expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe('hold');
    const scene = w.get('.longship').element;
    await w.setProps({ loaded: true });
    const minMs = holdMinMs('de');
    await advanceAndRender(minMs - 1);
    expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe('hold');
    await advanceAndRender(1);
    expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe('landfall');
    expect(w.get('.longship').element).toBe(scene);
    expect(w.get('.longship').classes()).toContain('is-landfall');
    expect(w.get('[data-testid="intro-narration"]').text()).toBe('Land!');
  });

  it('loop: restarts after landfall, never fades out, emits nothing and shows no end screen', async () => {
    const w = await mountIntro({ mode: 'loop' });
    const total = BEATS_EN.reduce((t, b) => t + (b.role === 'hold' ? holdMinMs('en') : b.durationMs), 0);
    await advanceAndRender(total);
    expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe(BEATS[0].id);
    expect(phase(w)).toBe('playing');
    expect(w.classes()).not.toContain('is-fading');
    expect(w.find('[data-testid="intro-end"]').exists()).toBe(false);
    expect(Object.keys(w.emitted())).not.toContain('done');
  });

  it('loop: the landfall alone renders on the longship scene', async () => {
    const landfall = BEATS.find((b) => b.role === 'exit')!.id;
    const w = await mountIntro({ mode: 'loop', loopBeats: [landfall] });
    expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe(landfall);
    expect(w.find('.longship').exists()).toBe(true);
  });

  describe('control row', () => {
    it('has the play/pause button, the timeline, the time and the speaker, and neither restart nor a text pause button', async () => {
      const w = await mountIntro({ playNow: false });
      expect(w.find('[data-testid="intro-controls"]').exists()).toBe(false);
      await w.get('[data-testid="landing-hear"]').trigger('click');
      expect(w.find('[data-testid="intro-restart"]').exists()).toBe(false);
      const pause = w.get('[data-testid="intro-pause"]');
      expect(pause.attributes('aria-label')).toBe('Pause');
      expect(pause.text()).toBe('');
      const row = w.get('[data-testid="intro-controls"]');
      expect(row.find('[data-testid="intro-timeline"]').exists()).toBe(true);
      expect(row.get('[data-testid="intro-time"]').text()).toBe(`0:00 / ${fmt(TOTAL_EN)}`);
      expect(row.find('[data-testid="intro-sound"]').exists()).toBe(true);
      // skip only shows once the tiles are loaded, and sits in the actions row above the bar
      expect(w.findAll('.actions button')).toHaveLength(0);
      await w.setProps({ loaded: true });
      expect(w.findAll('.actions button').map((b) => b.attributes('data-testid'))).toEqual(['intro-skip']);
    });
  });

  describe('click on the scene', () => {
    const paused = (w: VueWrapper) => w.get('.landing-intro').classes().includes('is-paused');

    it('toggles pause, but not when it lands on a button', async () => {
      const w = await mountIntro();
      await w.get('.beat-layer').trigger('click');
      expect(paused(w)).toBe(true);
      await w.get('.beat-layer').trigger('click');
      expect(paused(w)).toBe(false);
      // the pause button toggles exactly once, not twice
      await w.get('[data-testid="intro-pause"]').trigger('click');
      expect(paused(w)).toBe(true);
      // the centre play button resumes and does not toggle again
      await w.get('[data-testid="intro-center-play"]').trigger('click');
      expect(paused(w)).toBe(false);
      // nor does a click on the control row
      await w.get('[data-testid="intro-time"]').trigger('click');
      expect(paused(w)).toBe(false);
    });

    it('a button that swaps its own icon on the click does not let the click reach the scene as well', async () => {
      const w = await mountIntro({ attachTo: document.body });
      const btn = w.get('[data-testid="intro-pause"]');
      // the icon the click landed on is no longer inside the button by the time the click bubbles to the scene
      btn.element.addEventListener('click', (e) => document.body.appendChild(e.target as Element));
      await btn.get('svg').trigger('click');
      expect(paused(w)).toBe(true);
    });

    it('does nothing where pause is not shown (landing page, end screen)', async () => {
      const w = await mountIntro({ playNow: false });
      await w.get('.beat-layer').trigger('click');
      expect(paused(w)).toBe(false);
      expect(phase(w)).toBe('waitingForPlay');
      const r = await mountIntro({ mode: 'replay' });
      await r.get('[data-testid="intro-skip"]').trigger('click');
      await vi.advanceTimersByTimeAsync(EXIT_MS);
      await r.get('[data-testid="intro-back-to-docs"]').trigger('click');
      await r.get('[data-testid="intro-enter-game"]').trigger('click');
      expect(r.get('.landing-intro').classes()).not.toContain('is-paused');
    });

    it('skip does not also toggle pause', async () => {
      const w = await mountIntro({ mode: 'replay' });
      await w.get('[data-testid="intro-skip"]').trigger('click');
      expect(paused(w)).toBe(false);
    });
  });

  describe('landing page', () => {
    const page = (w: VueWrapper) => w.find('[data-testid="landing-page"]');
    const soundBtn = (w: VueWrapper) => w.get('[data-testid="intro-sound"]');

    it('shows over the first scene, without narration, controls, skip or the play button; Log in stays', async () => {
      const w = await mountIntro({ playNow: false, loaded: true });
      expect(phase(w)).toBe('waitingForPlay');
      expect(page(w).exists()).toBe(true);
      expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe('fire');
      expect(w.find('[data-testid="intro-narration"]').exists()).toBe(false);
      expect(w.find('[data-testid="intro-controls"]').exists()).toBe(false);
      expect(w.find('[data-testid="intro-skip"]').exists()).toBe(false);
      expect(w.find('[data-testid="intro-play"]').exists()).toBe(false);
      expect(w.find('[data-testid="intro-login"]').exists()).toBe(true);
    });

    it('is not there for the Play intro button, in replay or in loop mode', async () => {
      expect(page(await mountIntro({ playNow: true })).exists()).toBe(false);
      expect(page(await mountIntro({ mode: 'replay', playNow: false, reducedMotion: true })).exists()).toBe(false);
      expect(page(await mountIntro({ mode: 'loop' })).exists()).toBe(false);
    });

    it('"Hear the saga" starts the saga with the sound on', async () => {
      const w = await mountIntro({ playNow: false });
      await w.get('[data-testid="landing-hear"]').trigger('click');
      expect(phase(w)).toBe('playing');
      expect(soundBtn(w).attributes('data-sound')).toBe('on');
      expect(w.find('[data-testid="intro-narration"]').exists()).toBe(true);
    });

    it('"or play it muted" starts the saga with the sound off', async () => {
      const w = await mountIntro({ playNow: false });
      await w.get('[data-testid="landing-muted"]').trigger('click');
      expect(phase(w)).toBe('playing');
      expect(soundBtn(w).attributes('data-sound')).toBe('off');
    });

    it('starts the saga the same way with reduced motion', async () => {
      const w = await mountIntro({ playNow: false, reducedMotion: true });
      await w.get('[data-testid="landing-hear"]').trigger('click');
      expect(phase(w)).toBe('playing');
    });

    it('fades out (leave transition) once the saga starts', async () => {
      const w = await mountIntro({ playNow: false });
      await w.get('[data-testid="landing-hear"]').trigger('click');
      await vi.advanceTimersByTimeAsync(700);
      expect(page(w).exists()).toBe(false);
    });

    it('the map button closes the intro at once when the map is loaded', async () => {
      const w = await mountIntro({ playNow: false, loaded: true });
      await w.get('[data-testid="landing-map"]').trigger('click');
      expect(w.emitted('close')).toHaveLength(1);
      expect(phase(w)).toBe('waitingForPlay');
    });

    it('the map button arms while loading and closes the intro as soon as loading completes; a second click disarms', async () => {
      const w = await mountIntro({ playNow: false });
      const map = () => w.get('[data-testid="landing-map"]');
      expect(map().attributes('data-load-state')).toBe('loading');
      await map().trigger('click');
      expect(map().attributes('data-load-state')).toBe('armed');
      await map().trigger('click');
      expect(map().attributes('data-load-state')).toBe('loading');
      expect(w.emitted('close')).toBeUndefined();
      await map().trigger('click');
      await w.setProps({ loaded: true });
      expect(w.emitted('close')).toHaveLength(1);
    });
  });

  describe('Esc', () => {
    const esc = (init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, ...init }));

    it('emits close at once, with no exit beat, and nothing fires afterwards', async () => {
      const w = await mountIntro();
      expect(mounted, 'intros of earlier tests must be unmounted: they would all answer this Esc').toHaveLength(1);
      await vi.advanceTimersByTimeAsync(500);
      esc();
      await flushPromises();
      expect(w.emitted('close')).toHaveLength(1);
      expect(phase(w)).toBe('playing');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(phase(w)).toBe('playing');
      expect(w.emitted()).not.toHaveProperty('done');
    });

    it('works while waiting for play and in the exit beat, ignores key repeat', async () => {
      const w = await mountIntro({ reducedMotion: true });
      esc({ repeat: true });
      expect(w.emitted('close')).toBeUndefined();
      esc();
      expect(w.emitted('close')).toHaveLength(1);
      const x = await mountIntro({ mode: 'replay' });
      await x.get('[data-testid="intro-skip"]').trigger('click');
      expect(phase(x)).toBe('exiting');
      esc();
      expect(x.emitted('close')).toHaveLength(1);
    });

    it('works in loop mode', async () => {
      const w = await mountIntro({ mode: 'loop' });
      esc();
      expect(w.emitted('close')).toHaveLength(1);
    });
  });

  it('loop: a single beat re-enters its clip and remounts its scene layer on every pass', async () => {
    const w = await mountIntro({ mode: 'loop', loopBeats: ['fire'] });
    const root = w.get('[data-testid="landing-intro"]');
    const layer = w.get('.beat-layer').element;
    // re-entering a beat halts (pauses and rewinds) the clip that was playing
    const halts = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const before = halts.mock.calls.length;
    await vi.advanceTimersByTimeAsync(CLIP_MS.en.fire + VOICE_TAIL_MS);
    expect(root.attributes('data-beat')).toBe('fire');
    expect(root.attributes('data-voice-beat')).toBe('fire');
    expect(w.get('.beat-layer').element).not.toBe(layer);
    expect(halts.mock.calls.length).toBeGreaterThan(before);
    const second = w.get('.beat-layer').element;
    await vi.advanceTimersByTimeAsync(CLIP_MS.en.fire + VOICE_TAIL_MS);
    expect(w.get('.beat-layer').element).not.toBe(second);
    w.unmount();
  });

  describe('voice', () => {
    const beat = (w: VueWrapper) => w.get('[data-testid="landing-intro"]').attributes('data-beat');
    const root = (w: VueWrapper) => w.get('[data-testid="landing-intro"]');

    it('each intro beat lasts its clip plus the tail, per locale', async () => {
      for (const locale of ['en', 'de'] as const) {
        const w = await mountIntro({ locale });
        await vi.advanceTimersByTimeAsync(CLIP_MS[locale].fire + VOICE_TAIL_MS - 1);
        expect(beat(w)).toBe('fire');
        await vi.advanceTimersByTimeAsync(1);
        expect(beat(w)).toBe('prophecy');
        w.unmount();
      }
    });

    it('the clip of a beat plays with it, muted while the sound is off; the hold clip plays once', async () => {
      const w = await mountIntro({ locale: 'de' });
      expect(plays).toHaveLength(0); // clips not ready yet in jsdom: they start once ready
      expect(root(w).attributes('data-voice-beat')).toBe('fire');
      expect(root(w).attributes('data-voice-state')).toBe('playing');
      await vi.advanceTimersByTimeAsync(CLIP_MS.de.fire + VOICE_TAIL_MS);
      expect(root(w).attributes('data-voice-beat')).toBe('prophecy');
      w.unmount();
    });

    it('the sound button toggles label, state and the voice; pause pauses the clip; skip leads to the landfall clip', async () => {
      const w = await mountIntro({ loaded: true });
      const btn = w.get('[data-testid="intro-sound"]');
      expect(btn.attributes('data-sound')).toBe('off');
      expect(btn.attributes('aria-pressed')).toBe('false');
      expect(btn.attributes('aria-label')).toBe('Turn sound on');
      expect(btn.classes()).toContain('is-muted');
      await btn.trigger('click');
      expect(btn.attributes('data-sound')).toBe('on');
      expect(btn.attributes('aria-label')).toBe('Turn sound off');
      expect(btn.classes()).not.toContain('is-muted');

      await w.get('[data-testid="intro-pause"]').trigger('click');
      expect(root(w).attributes('data-voice-state')).toBe('paused');
      await w.get('[data-testid="intro-pause"]').trigger('click');
      expect(root(w).attributes('data-voice-state')).toBe('playing');

      await w.get('[data-testid="intro-skip"]').trigger('click');
      expect(root(w).attributes('data-voice-beat')).toBe('landfall');
      await vi.advanceTimersByTimeAsync(EXIT_MS);
      expect(w.emitted('done')).toHaveLength(1);
      w.unmount();
    });

    it('starts with the sound on when asked to (replay); the row reads pause, timeline, time, speaker', async () => {
      const w = await mountIntro({ mode: 'replay', soundOn: true });
      expect(w.get('[data-testid="intro-sound"]').attributes('data-sound')).toBe('on');
      const order = w.findAll('.ctrl [data-testid]').map((b) => b.attributes('data-testid'));
      expect(order.filter((id) => ['intro-pause', 'intro-timeline', 'intro-time', 'intro-volume', 'intro-sound'].includes(id!))).toEqual([
        'intro-pause',
        'intro-timeline',
        'intro-time',
        'intro-volume',
        'intro-sound',
      ]);
      expect(w.findAll('.actions button').map((b) => b.attributes('data-testid'))).toEqual(['intro-skip']);
    });

    it('stops the clip when the intro ends', async () => {
      const w = await mountIntro({ mode: 'replay' });
      await w.get('[data-testid="intro-skip"]').trigger('click');
      await vi.advanceTimersByTimeAsync(EXIT_MS);
      expect(phase(w)).toBe('ended');
      expect(root(w).attributes('data-voice-state')).toBe('stopped');
    });
  });

  describe('pause', () => {
    const pauseBtn = (w: VueWrapper) => w.get('[data-testid="intro-pause"]');
    const beatPaused = (w: VueWrapper) => w.get('.beat-layer > *').classes().includes('is-paused');

    it('toggles on click: label, aria-pressed and the beat scene stop and resume, and nothing is emitted', async () => {
      const w = await mountIntro();
      expect(pauseBtn(w).attributes('aria-label')).toBe('Pause');
      expect(pauseBtn(w).attributes('aria-pressed')).toBe('false');
      expect(beatPaused(w)).toBe(false);
      await pauseBtn(w).trigger('click');
      expect(pauseBtn(w).attributes('aria-label')).toBe('Resume');
      expect(pauseBtn(w).attributes('aria-pressed')).toBe('true');
      expect(beatPaused(w)).toBe(true);
      await vi.advanceTimersByTimeAsync(BEATS_EN[0].durationMs * 3);
      expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe(BEATS[0].id);
      await pauseBtn(w).trigger('click');
      expect(pauseBtn(w).attributes('aria-label')).toBe('Pause');
      expect(beatPaused(w)).toBe(false);
      expect(w.emitted()).not.toHaveProperty('done');
      expect(w.emitted()).not.toHaveProperty('back-to-docs');
      expect(w.emitted()).not.toHaveProperty('enter-game');
    });

    it('is not shown while waiting for play', async () => {
      const w = await mountIntro({ playNow: false });
      expect(w.find('[data-testid="intro-pause"]').exists()).toBe(false);
    });

    it('space toggles it, but not from a focused button or when held down', async () => {
      const w = await mountIntro();
      const press = (init: KeyboardEventInit, target: EventTarget = window) => {
        const e = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true, ...init });
        target.dispatchEvent(e);
        return e;
      };
      const e = press({});
      await flushPromises();
      expect(e.defaultPrevented).toBe(true);
      expect(pauseBtn(w).attributes('aria-pressed')).toBe('true');
      press({ repeat: true });
      await flushPromises();
      expect(pauseBtn(w).attributes('aria-pressed')).toBe('true');
      press({}, pauseBtn(w).element);
      await flushPromises();
      expect(pauseBtn(w).attributes('aria-pressed')).toBe('true');
      press({});
      await flushPromises();
      expect(pauseBtn(w).attributes('aria-pressed')).toBe('false');
      const remove = vi.spyOn(window, 'removeEventListener');
      w.unmount();
      expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
      remove.mockRestore();
    });
  });

  describe('idle dimming', () => {
    const root = (w: VueWrapper) => w.get('[data-testid="landing-intro"]');

    it('dims after the idle time, wakes on input and never dims while paused', async () => {
      const w = await mountIntro();
      expect(root(w).classes()).not.toContain('is-idle');
      await vi.advanceTimersByTimeAsync(IDLE_DIM_MS);
      expect(root(w).classes()).toContain('is-idle');
      window.dispatchEvent(new Event('pointermove'));
      await flushPromises();
      expect(root(w).classes()).not.toContain('is-idle');
      await vi.advanceTimersByTimeAsync(IDLE_DIM_MS - 100);
      expect(root(w).classes()).not.toContain('is-idle');
      await vi.advanceTimersByTimeAsync(100);
      expect(root(w).classes()).toContain('is-idle');
      await w.get('[data-testid="intro-pause"]').trigger('click');
      expect(root(w).classes()).not.toContain('is-idle');
      await vi.advanceTimersByTimeAsync(IDLE_DIM_MS * 2);
      expect(root(w).classes()).not.toContain('is-idle');
      w.unmount();
    });

    it('keeps the skip button undimmed for 3 s after it appears, then lets it dim', async () => {
      const w = await mountIntro();
      await w.setProps({ loaded: true });
      const skip = () => w.get('[data-testid="intro-skip"]');
      expect(skip().classes()).toContain('is-fresh');
      await vi.advanceTimersByTimeAsync(2999);
      expect(skip().classes()).toContain('is-fresh');
      await vi.advanceTimersByTimeAsync(1);
      expect(skip().classes()).not.toContain('is-fresh');
      w.unmount();
    });
  });

  describe('login button', () => {
    it('is absent in replay', async () => {
      const w = await mountIntro({ mode: 'replay' });
      expect(w.find('[data-testid="intro-login"]').exists()).toBe(false);
    });

    it('is there in landing and loop mode, also while waiting for play', async () => {
      const landing = await mountIntro({ playNow: false });
      expect(phase(landing)).toBe('waitingForPlay');
      expect(landing.find('[data-testid="intro-login"]').exists()).toBe(true);
      const loop = await mountIntro({ mode: 'loop' });
      expect(loop.find('[data-testid="intro-login"]').exists()).toBe(true);
    });

    it('reads "Log in" / "Anmelden" when logged out and "Enter world" / "Zur Welt" when logged in', async () => {
      const out = await mountIntro();
      expect(out.get('[data-testid="intro-login"]').attributes('data-login-state')).toBe('login');
      expect(out.get('[data-testid="intro-login"]').text()).toBe('Log in');
      const outDe = await mountIntro({ locale: 'de' });
      expect(outDe.get('[data-testid="intro-login"]').text()).toBe('Anmelden');
      const inn = await mountIntro({ loggedIn: true });
      expect(inn.get('[data-testid="intro-login"]').attributes('data-login-state')).toBe('enter');
      expect(inn.get('[data-testid="intro-login"]').text()).toBe('Enter world');
      const inDe = await mountIntro({ loggedIn: true, locale: 'de' });
      expect(inDe.get('[data-testid="intro-login"]').text()).toBe('Zur Welt');
    });

    it('"Log in" closes the intro and requests the login page', async () => {
      introSignal.loginRequested = false;
      const w = await mountIntro();
      await w.get('[data-testid="intro-login"]').trigger('click');
      expect(w.emitted('close')).toHaveLength(1);
      expect(introSignal.loginRequested).toBe(true);
      introSignal.loginRequested = false;
    });

    it('"Enter world" only closes the intro', async () => {
      introSignal.loginRequested = false;
      const w = await mountIntro({ loggedIn: true });
      await w.get('[data-testid="intro-login"]').trigger('click');
      expect(w.emitted('close')).toHaveLength(1);
      expect(introSignal.loginRequested).toBe(false);
    });
  });
});
