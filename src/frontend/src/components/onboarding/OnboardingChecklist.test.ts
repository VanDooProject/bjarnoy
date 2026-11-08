// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import OnboardingChecklist from './OnboardingChecklist.vue';
import { deriveOnboardingGuidance } from '../../lib/map/onboardingGuidance';
import { createTestI18n } from '../../test/i18n';
import enLanding from '../../i18n/locales/en/landing.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

function mountChecklist(hasFounded: boolean, placedTypes: string[] = [], canFocus = false) {
  return mount(OnboardingChecklist, {
    props: {
      guidance: deriveOnboardingGuidance(hasFounded, placedTypes as never),
      canFocus,
    },
    global: { plugins: [createTestI18n({ landing: enLanding, catalogue: enCatalogue })] },
  });
}

describe('OnboardingChecklist', () => {
  it('shows real building names, not a generic "Building N"', () => {
    const wrapper = mountChecklist(true, ['longhouse']);
    expect(wrapper.text()).toContain('Reindeer Herder');
    expect(wrapper.text()).toContain('Lumberjack');
    expect(wrapper.text()).not.toContain('Building 2');
    expect(wrapper.text()).not.toContain('Building 3');
  });

  it('is a bare stepper line: no title, no panel, no bar', () => {
    const wrapper = mountChecklist(true, ['longhouse']);
    expect(wrapper.text()).not.toContain('first three moves');
    expect(wrapper.find('.panel').exists()).toBe(false);
    expect(wrapper.find('[class*="progress"]').exists()).toBe(false);
  });

  it('draws one numbered node per step and one line segment between each pair', () => {
    const wrapper = mountChecklist(false, []);
    expect(wrapper.findAll('.node').map((n) => n.text())).toEqual(['1', '2', '3']);
    expect(wrapper.findAll('.seg')).toHaveLength(2);
  });

  it('names the step count for assistive tech', () => {
    expect(mountChecklist(true, ['longhouse']).get('[data-testid="onboarding-checklist"]').attributes('aria-label')).toBe(
      'Step 2 of 3',
    );
  });

  it('marks exactly one step current, and it is the first not-yet-done step', () => {
    const wrapper = mountChecklist(true, ['longhouse', 'lumberjack']);
    const current = wrapper.findAll('.step.current');
    expect(current).toHaveLength(1);
    expect(current[0].text()).toContain('Reindeer Herder');
  });

  it('only the current step says what to do', () => {
    const wrapper = mountChecklist(true, ['longhouse']);
    expect(wrapper.findAll('.sub')).toHaveLength(1);
    expect(wrapper.get('.step.current .sub').text()).toBe('Click an empty hex in your border');
    expect(mountChecklist(false, []).get('.step.current .sub').text()).toBe('Click your plot to place it');
  });

  it('a done step shows a check instead of its number and no instruction', () => {
    const wrapper = mountChecklist(true, ['longhouse', 'reindeerherder']);
    const done = wrapper.findAll('.step.done');
    expect(done).toHaveLength(2);
    for (const step of done) {
      expect(step.find('.node svg.check').exists()).toBe(true);
      expect(step.find('.node').text()).toBe('');
      expect(step.find('.sub').exists()).toBe(false);
    }
    expect(wrapper.get('.step.current .node').text()).toBe('3');
  });

  it('before founding, only the longhouse step is current and the others are upcoming', () => {
    const wrapper = mountChecklist(false, []);
    expect(wrapper.findAll('.step').map((s) => s.classes().filter((c) => c !== 'step')[0])).toEqual(['current', 'upcoming', 'upcoming']);
  });

  it('tapping the current step emits focus (the arrow pokes its target)', async () => {
    const wrapper = mountChecklist(true, ['longhouse', 'reindeerherder'], true);
    const buttons = wrapper.findAll('button.step');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].classes()).toContain('current');
    expect(buttons[0].attributes('data-testid')).toBe('onboarding-focus');
    await buttons[0].trigger('click');
    expect(wrapper.emitted('focus')).toHaveLength(1);
  });

  it('the current step is no button while there is no arrow to poke', () => {
    const wrapper = mountChecklist(true, ['longhouse'], false);
    expect(wrapper.find('button').exists()).toBe(false);
  });
});
