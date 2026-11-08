// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import OnboardingBanner from './OnboardingBanner.vue';
import { createTestI18n } from '../../test/i18n';
import enLanding from '../../i18n/locales/en/landing.json';

function mountBanner(variant: 'landfall' | 'complete') {
  return mount(OnboardingBanner, {
    props: { variant },
    global: { plugins: [createTestI18n({ landing: enLanding })] },
  });
}

describe('OnboardingBanner', () => {
  it('landfall variant shows the landfall copy and no continue button', () => {
    const wrapper = mountBanner('landfall');
    expect(wrapper.text()).toContain('Your longhouse stands.');
    expect(wrapper.text()).toContain('Build two more buildings.');
    expect(wrapper.find('[data-testid="onboarding-continue"]').exists()).toBe(false);
  });

  it('complete variant shows the completion copy and a continue button that emits continue', async () => {
    const wrapper = mountBanner('complete');
    expect(wrapper.text()).toContain('Three buildings built');
    const cta = wrapper.get('[data-testid="onboarding-continue"]');
    await cta.trigger('click');
    expect(wrapper.emitted('continue')).toHaveLength(1);
  });
});
