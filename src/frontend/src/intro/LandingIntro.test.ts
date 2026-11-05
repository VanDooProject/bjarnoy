// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import LandingIntro from './LandingIntro.vue';
import { BEATS } from './beats/registry';
import type { BeatId } from './beats/types';
import { introSignal } from './introSignal';
import { IDLE_DIM_MS } from './useIdleDim';
import { beatsFor, CLIP_MS, holdMinMs, VOICE_TAIL_MS } from './introVoice';

// jsdom has no canvas 2D context; the texture is irrelevant to the host's behaviour.
vi.mock('./fogTexture', () => ({ introFogUrl: () => 'data:image/png;base64,' }));

type Props = { mode: 'landing' | 'replay' | 'loop'; loopBeats?: BeatId[]; locale: 'en' | 'de'; reducedMotion: boolean; loaded: boolean; loggedIn?: boolean; soundOn: boolean };
const base: Props = { mode: 'landing', locale: 'en', reducedMotion: false, loaded: false, soundOn: false };

// jsdom plays no media: record what the voice does with its clips.
const plays: { src: string; muted: boolean }[] = [];
vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
  plays.push({ src: this.src, muted: this.muted });
  return Promise.resolve();
});
async function mountIntro(p: Partial<Props> = {}) {
  const w = mount(LandingIntro, { props: { ...base, ...p } });
  await flushPromises();
  return w;
}
const EXIT_MS = BEATS.find((b) => b.role === 'exit')!.durationMs;
const BEATS_EN = beatsFor('en', BEATS);
const phase = (w: VueWrapper) => w.get('[data-testid="landing-intro"]').attributes('data-phase');

beforeEach(() => {
  vi.useFakeTimers();
  plays.length = 0;
});
afterEach(() => vi.useRealTimers());

describe('LandingIntro', () => {
  it('shows the play button in reduced motion and runs after pressing it', async () => {
    const w = await mountIntro({ reducedMotion: true });
    expect(phase(w)).toBe('waitingForPlay');
    expect(w.find('[data-testid="intro-skip"]').exists()).toBe(false);
    await w.get('[data-testid="intro-play"]').trigger('click');
    expect(phase(w)).toBe('playing');
    expect(w.find('[data-testid="intro-play"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(BEATS_EN[0].durationMs);
    expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe('prophecy');
  });

  it('emits done at once when loaded before play in reduced motion', async () => {
    const w = await mountIntro({ reducedMotion: true });
    await w.setProps({ loaded: true });
    expect(w.emitted('done')).toHaveLength(1);
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
    await vi.advanceTimersByTimeAsync(introMs);
    expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe('hold');
    const scene = w.get('.longship').element;
    await w.setProps({ loaded: true });
    const minMs = holdMinMs('de');
    await vi.advanceTimersByTimeAsync(minMs - 1);
    expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe('hold');
    await vi.advanceTimersByTimeAsync(1);
    expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe('landfall');
    expect(w.get('.longship').element).toBe(scene);
    expect(w.get('.longship').classes()).toContain('is-landfall');
    expect(w.get('[data-testid="intro-narration"]').text()).toBe('Land!');
  });

  it('loop: restarts after landfall, never fades out, emits nothing and shows no end screen', async () => {
    const w = await mountIntro({ mode: 'loop' });
    const total = BEATS_EN.reduce((t, b) => t + (b.role === 'hold' ? holdMinMs('en') : b.durationMs), 0);
    await vi.advanceTimersByTimeAsync(total);
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

  describe('restart', () => {
    it('is shown between skip and pause exactly when pause is shown, icon-only with a label', async () => {
      const w = await mountIntro({ reducedMotion: true });
      expect(w.find('[data-testid="intro-restart"]').exists()).toBe(false);
      await w.get('[data-testid="intro-play"]').trigger('click');
      const btn = w.get('[data-testid="intro-restart"]');
      expect(btn.attributes('aria-label')).toBe('Restart');
      expect(btn.text()).toBe('⟲');
      // skip only shows once the tiles are loaded
      const order = w.findAll('.actions button').map((b) => b.attributes('data-testid'));
      expect(order).toEqual(['intro-restart', 'intro-pause', 'intro-sound']);
    });

    it('click goes back to the first beat and unpauses', async () => {
      const w = await mountIntro();
      await vi.advanceTimersByTimeAsync(CLIP_MS.en.fire + VOICE_TAIL_MS + 100);
      expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe(BEATS[1].id);
      await w.get('[data-testid="intro-pause"]').trigger('click');
      await w.get('[data-testid="intro-restart"]').trigger('click');
      expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe(BEATS[0].id);
      expect(w.get('[data-testid="intro-pause"]').attributes('aria-pressed')).toBe('false');
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
      // restart unpauses and does not toggle again
      await w.get('[data-testid="intro-restart"]').trigger('click');
      expect(paused(w)).toBe(false);
    });

    it('does nothing where pause is not shown (play screen, end screen)', async () => {
      const w = await mountIntro({ reducedMotion: true });
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

  describe('Esc', () => {
    const esc = (init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, ...init }));

    it('emits close at once, with no exit beat, and nothing fires afterwards', async () => {
      const w = await mountIntro();
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

    it('starts with the sound on when asked to (replay), and the order is skip, restart, pause, sound', async () => {
      const w = await mountIntro({ mode: 'replay', soundOn: true });
      expect(w.get('[data-testid="intro-sound"]').attributes('data-sound')).toBe('on');
      const order = w.findAll('.actions button').map((b) => b.attributes('data-testid'));
      expect(order).toEqual(['intro-skip', 'intro-restart', 'intro-pause', 'intro-sound']);
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
      expect(pauseBtn(w).text()).toBe('Pause');
      expect(pauseBtn(w).attributes('aria-pressed')).toBe('false');
      expect(beatPaused(w)).toBe(false);
      await pauseBtn(w).trigger('click');
      expect(pauseBtn(w).text()).toBe('Resume');
      expect(pauseBtn(w).attributes('aria-pressed')).toBe('true');
      expect(beatPaused(w)).toBe(true);
      await vi.advanceTimersByTimeAsync(BEATS_EN[0].durationMs * 3);
      expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe(BEATS[0].id);
      await pauseBtn(w).trigger('click');
      expect(pauseBtn(w).text()).toBe('Pause');
      expect(beatPaused(w)).toBe(false);
      expect(w.emitted()).not.toHaveProperty('done');
      expect(w.emitted()).not.toHaveProperty('back-to-docs');
      expect(w.emitted()).not.toHaveProperty('enter-game');
    });

    it('is not shown while waiting for play', async () => {
      const w = await mountIntro({ reducedMotion: true });
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
      const landing = await mountIntro({ reducedMotion: true });
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
