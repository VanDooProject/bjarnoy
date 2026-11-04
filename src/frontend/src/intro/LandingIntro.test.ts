// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import LandingIntro from './LandingIntro.vue';
import { BEATS } from './beats/registry';
import type { BeatId } from './beats/types';
import { introText, readingMs } from './introText';

// jsdom has no canvas 2D context; the texture is irrelevant to the host's behaviour.
vi.mock('./fogTexture', () => ({ introFogUrl: () => 'data:image/png;base64,' }));

type Props = { mode: 'landing' | 'replay' | 'loop'; loopBeats?: BeatId[]; locale: 'en' | 'de'; reducedMotion: boolean; loaded: boolean };
const base: Props = { mode: 'landing', locale: 'en', reducedMotion: false, loaded: false };
async function mountIntro(p: Partial<Props> = {}) {
  const w = mount(LandingIntro, { props: { ...base, ...p } });
  await flushPromises();
  return w;
}
const EXIT_MS = BEATS.find((b) => b.role === 'exit')!.durationMs;
const phase = (w: VueWrapper) => w.get('[data-testid="landing-intro"]').attributes('data-phase');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('LandingIntro', () => {
  it('shows the play button in reduced motion and runs after pressing it', async () => {
    const w = await mountIntro({ reducedMotion: true });
    expect(phase(w)).toBe('waitingForPlay');
    expect(w.find('[data-testid="intro-skip"]').exists()).toBe(false);
    await w.get('[data-testid="intro-play"]').trigger('click');
    expect(phase(w)).toBe('playing');
    expect(w.find('[data-testid="intro-play"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(BEATS[0].durationMs);
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
    const introMs = BEATS.filter((b) => b.role === 'intro').reduce((t, b) => t + b.durationMs, 0);
    await vi.advanceTimersByTimeAsync(introMs);
    expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe('hold');
    const scene = w.get('.longship').element;
    await w.setProps({ loaded: true });
    const minMs = readingMs(introText('de', 'beats.hold'));
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
    const total = BEATS.reduce((t, b) => t + (b.role === 'hold' ? readingMs(introText('en', 'beats.hold')) : b.durationMs), 0);
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
      const order = w.findAll('.actions button').map((b) => b.attributes('data-testid'));
      expect(order.indexOf('intro-restart')).toBe(order.length - 2);
      expect(order[order.length - 1]).toBe('intro-pause');
    });

    it('click goes back to the first beat and unpauses', async () => {
      const w = await mountIntro();
      await vi.advanceTimersByTimeAsync(BEATS[0].durationMs + 100);
      expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe(BEATS[1].id);
      await w.get('[data-testid="intro-pause"]').trigger('click');
      await w.get('[data-testid="intro-restart"]').trigger('click');
      expect(w.get('[data-testid="landing-intro"]').attributes('data-beat')).toBe(BEATS[0].id);
      expect(w.get('[data-testid="intro-pause"]').attributes('aria-pressed')).toBe('false');
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
      await vi.advanceTimersByTimeAsync(BEATS[0].durationMs * 3);
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
});
