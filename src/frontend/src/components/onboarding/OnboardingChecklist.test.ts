// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import OnboardingChecklist from './OnboardingChecklist.vue';
import { deriveOnboardingGuidance } from '../../lib/map/onboardingGuidance';
import { createTestI18n } from '../../test/i18n';
import enLanding from '../../i18n/locales/en/landing.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

function mountChecklist(hasFounded: boolean, placedTypes: string[] = []) {
  return mount(OnboardingChecklist, {
    props: {
      guidance: deriveOnboardingGuidance(hasFounded, placedTypes as never),
      hasFounded,
    },
    global: { plugins: [createTestI18n({ landing: enLanding, catalogue: enCatalogue })] },
  });
}

describe('OnboardingChecklist', () => {
  it('shows real building names, not a generic "Building N"', () => {
    const wrapper = mountChecklist(true, ['longhouse']);
    expect(wrapper.text()).toContain('Farm');
    expect(wrapper.text()).toContain('Lumberjack');
    expect(wrapper.text()).not.toContain('Building 2');
    expect(wrapper.text()).not.toContain('Building 3');
  });

  it('shows the header step count and a progress bar matching guidance.progress', () => {
    const wrapper = mountChecklist(true, ['longhouse']);
    expect(wrapper.text()).toContain('Step 2 of 3');
    const fill = wrapper.get('.tray-progress-fill');
    expect(fill.attributes('style')).toContain('width: 33%');
  });

  it('marks exactly one row current, and it is the first not-yet-done row', () => {
    const wrapper = mountChecklist(true, ['longhouse', 'lumberjack']);
    const current = wrapper.findAll('.tray-item.current');
    expect(current).toHaveLength(1);
    expect(current[0].text()).toContain('Farm');
  });

  it('a done row shows the checkmark styling and "Placed"', () => {
    const wrapper = mountChecklist(true, ['longhouse', 'farm']);
    const done = wrapper.findAll('.tray-item.done');
    expect(done).toHaveLength(2);
    expect(done.some((row) => row.text().includes('Farm') && row.text().includes('Placed'))).toBe(true);
  });

  it('before founding, guided rows point at founding first, not "click an empty hex"', () => {
    const wrapper = mountChecklist(false, []);
    expect(wrapper.text()).toContain('Found your longhouse first');
    expect(wrapper.text()).not.toContain('Click an empty hex');
  });
});
