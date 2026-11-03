// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import LandingIntro from './LandingIntro.vue';
import { BEATS } from './beats/registry';
import { introText, readingMs } from './introText';

// jsdom has no canvas 2D context; the texture is irrelevant to the host's behaviour.
vi.mock('./fogTexture', () => ({ introFogUrl: () => 'data:image/png;base64,' }));

type Props = { mode: 'landing' | 'replay'; locale: 'en' | 'de'; reducedMotion: boolean; loaded: boolean };
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
});
