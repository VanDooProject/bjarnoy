// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestI18n } from '../../test/i18n';
import enOnboarding from '../../i18n/locales/en/onboarding.json';

/** Fresh module graph per test: the preferences are singletons that read localStorage once. */
async function mountPrompt({ reduced = true, stored = {} as Record<string, string> } = {}) {
  vi.resetModules();
  localStorage.clear();
  for (const [k, v] of Object.entries(stored)) localStorage.setItem(k, v);
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  const { default: MotionPrompt } = await import('./MotionPrompt.vue');
  const { motionPreferences } = await import('../../lib/perf/motionPreferences');
  const { animationPreference } = await import('../../lib/perf/animationPreference');
  const wrapper = mount(MotionPrompt, { global: { plugins: [createTestI18n({ onboarding: enOnboarding })] } });
  return { wrapper, motionPreferences, animationPreference };
}

describe('MotionPrompt', () => {
  beforeEach(() => localStorage.clear());

  it('shows the copy when the device asks for reduced motion and nothing was answered', async () => {
    const { wrapper } = await mountPrompt();
    expect(wrapper.find('[data-testid="motion-prompt"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Animations reduced');
    expect(wrapper.text()).toContain('Play with animations?');
    expect(wrapper.text()).toContain('Change anytime: Profile → Graphics');
  });

  it('renders nothing when the device does not ask for reduced motion', async () => {
    const { wrapper } = await mountPrompt({ reduced: false });
    expect(wrapper.find('[data-testid="motion-prompt"]').exists()).toBe(false);
  });

  it('renders nothing once it was answered', async () => {
    const { wrapper } = await mountPrompt({ stored: { 'bjarnoy.motionPrompt': 'dismissed' } });
    expect(wrapper.find('[data-testid="motion-prompt"]').exists()).toBe(false);
  });

  it('renders nothing when any animation setting was already chosen', async () => {
    const { wrapper } = await mountPrompt({ stored: { 'bjarnoy.motion.fog': 'off' } });
    expect(wrapper.find('[data-testid="motion-prompt"]').exists()).toBe(false);
  });

  it('"Turn on" sets all four settings, records the answer and hides the bubble', async () => {
    const { wrapper, motionPreferences, animationPreference } = await mountPrompt();
    await wrapper.get('[data-testid="motion-prompt-on"]').trigger('click');
    expect(animationPreference.setting).toBe('on');
    expect([motionPreferences.water, motionPreferences.fog, motionPreferences.hud]).toEqual(['on', 'on', 'on']);
    expect(localStorage.getItem('bjarnoy.motionPrompt')).toBe('on');
    expect(wrapper.find('[data-testid="motion-prompt"]').exists()).toBe(false);
  });

  it.each(['motion-prompt-dismiss', 'motion-prompt-close'])('%s records "dismissed", keeps settings on auto and hides the bubble', async (testId) => {
    const { wrapper, motionPreferences, animationPreference } = await mountPrompt();
    await wrapper.get(`[data-testid="${testId}"]`).trigger('click');
    expect(localStorage.getItem('bjarnoy.motionPrompt')).toBe('dismissed');
    expect(animationPreference.setting).toBe('auto');
    expect([motionPreferences.water, motionPreferences.fog, motionPreferences.hud]).toEqual(['auto', 'auto', 'auto']);
    expect(wrapper.find('[data-testid="motion-prompt"]').exists()).toBe(false);
  });
});
