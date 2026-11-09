// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import OnboardingChecklist from './OnboardingChecklist.vue';
import { deriveOnboardingGuidance } from '../../lib/map/onboardingGuidance';
import { createTestI18n } from '../../test/i18n';
import enLanding from '../../i18n/locales/en/landing.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';
import { motionPreferences } from '../../lib/perf/motionPreferences';
function mountChecklist(hasFounded, placedTypes = [], canFocus = false) {
    return mount(OnboardingChecklist, {
        props: {
            guidance: deriveOnboardingGuidance(hasFounded, placedTypes),
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
        expect(wrapper.findAll('.node .num').map((n) => n.text())).toEqual(['1', '2', '3']);
        expect(wrapper.findAll('.seg')).toHaveLength(2);
    });
    it('names the step count for assistive tech', () => {
        expect(mountChecklist(true, ['longhouse']).get('[data-testid="onboarding-checklist"]').attributes('aria-label')).toBe('Step 2 of 3');
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
    it('a done step carries the check (the number fades out in CSS) and no instruction', () => {
        const wrapper = mountChecklist(true, ['longhouse', 'reindeerherder']);
        const done = wrapper.findAll('.step.done');
        expect(done).toHaveLength(2);
        for (const step of done) {
            expect(step.find('.node svg.check').exists()).toBe(true);
            expect(step.find('.sub').exists()).toBe(false);
        }
        expect(wrapper.get('.step.current .num').text()).toBe('3');
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
    describe('progress animation', () => {
        afterEach(() => {
            motionPreferences.hud = 'auto';
        });
        async function finishStep(wrapper, placed) {
            await wrapper.setProps({ guidance: deriveOnboardingGuidance(true, placed) });
        }
        it('plays nothing on the first render', () => {
            const wrapper = mountChecklist(true, ['longhouse']);
            expect(wrapper.findAll('.just-done, .line-in, .ignite')).toHaveLength(0);
            expect(wrapper.classes()).not.toContain('all-done');
        });
        it('a current to done change flips that node, runs the ember into the next step and ignites it', async () => {
            motionPreferences.hud = 'on';
            const wrapper = mountChecklist(true, ['longhouse']);
            await finishStep(wrapper, ['longhouse', 'reindeerherder']);
            const steps = wrapper.findAll('.step');
            expect(steps[1].classes()).toContain('just-done');
            expect(steps[2].classes()).toEqual(expect.arrayContaining(['current', 'line-in', 'ignite']));
            expect(steps[0].classes()).not.toContain('just-done');
            expect(steps[1].find('.seg .ember').exists()).toBe(true);
            expect(steps[2].find('.seg .fill').exists()).toBe(true);
        });
        it('finishing the last step waves all nodes instead of igniting one', async () => {
            motionPreferences.hud = 'on';
            const wrapper = mountChecklist(true, ['longhouse', 'reindeerherder']);
            await finishStep(wrapper, ['longhouse', 'reindeerherder', 'lumberjack']);
            expect(wrapper.classes()).toContain('all-done');
            expect(wrapper.findAll('.ignite')).toHaveLength(0);
            expect(wrapper.findAll('.step')[2].classes()).toContain('just-done');
        });
        it('with menu animations off the states just change: no animation classes', async () => {
            motionPreferences.hud = 'off';
            const wrapper = mountChecklist(true, ['longhouse']);
            expect(wrapper.classes()).toContain('is-reduced');
            await finishStep(wrapper, ['longhouse', 'reindeerherder']);
            expect(wrapper.findAll('.just-done, .line-in, .ignite')).toHaveLength(0);
            expect(wrapper.findAll('.step')[1].classes()).toContain('done');
            expect(wrapper.findAll('.step')[2].classes()).toContain('current');
        });
    });
});
