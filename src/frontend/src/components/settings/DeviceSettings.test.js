// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DeviceSettings from './DeviceSettings.vue';
import { animationPreference } from '../../lib/perf/animationPreference';
import { motionPreferences } from '../../lib/perf/motionPreferences';
import { antialiasPreference } from '../../lib/perf/antialiasPreference';
import { ringSizePreference } from '../../lib/map/ringSize';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { createTestI18n } from '../../test/i18n';
import enProfile from '../../i18n/locales/en/profile.json';
// No auth store user is set anywhere in this file: the settings are
// per-device and must work for an anonymous player.
function mountSettings(options = {}) {
    return mount(DeviceSettings, {
        ...options,
        global: { plugins: [createTestI18n({ profile: enProfile })] },
    });
}
beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.removeItem('bjarnoy.animations');
    animationPreference.setting = 'auto';
});
afterEach(() => {
    // Restore the plain getter the reduced-motion cases override.
    Object.defineProperty(animationPreference, 'reducedMotion', {
        get() {
            return false;
        },
        configurable: true,
    });
});
describe('DeviceSettings', () => {
    it('shows the HUD bar, menu size and graphics sections without an account', () => {
        const wrapper = mountSettings();
        expect(wrapper.text()).toContain('HUD bar');
        expect(wrapper.text()).toContain('Bar position');
        expect(wrapper.text()).toContain('Graphics');
        expect(wrapper.text()).toContain('Building animations');
    });
    it('labels each button group with what it sets', () => {
        const wrapper = mountSettings({ attachTo: document.body });
        const names = wrapper
            .findAll('[role="group"]')
            .map((group) => document.getElementById(group.attributes('aria-labelledby'))?.textContent);
        expect(names).toEqual([
            'Bar position',
            'Menu size',
            'Building animations',
            'Water motion',
            'Lake motion',
            'Fog drift',
            'Menu animations',
            'Smooth edges',
        ]);
        wrapper.unmount();
    });
    it('choosing Bottom writes the hudPrefs store', async () => {
        const wrapper = mountSettings();
        const bottomButton = wrapper.findAll('button').find((b) => b.text() === 'Bottom');
        await bottomButton.trigger('click');
        expect(useHudPrefsStore().barPosition).toBe('bottom');
        expect(bottomButton.attributes('aria-pressed')).toBe('true');
    });
    it('choosing an option persists the animation setting to localStorage', async () => {
        const wrapper = mountSettings();
        const onButton = wrapper.findAll('.animation-preferences button').find((button) => button.text() === 'On');
        await onButton.trigger('click');
        expect(animationPreference.setting).toBe('on');
        expect(localStorage.getItem('bjarnoy.animations')).toBe('on');
        expect(wrapper.text()).toContain('On (this device)');
    });
    it('the smooth-edges toggle persists the antialias setting to localStorage', async () => {
        const wrapper = mountSettings();
        const offButton = wrapper.findAll('.antialias-toggle button').find((button) => button.text() === 'Off');
        await offButton.trigger('click');
        expect(antialiasPreference.enabled).toBe(false);
        expect(localStorage.getItem('bjarnoy.antialias')).toBe('off');
        expect(offButton.attributes('aria-pressed')).toBe('true');
        antialiasPreference.setting = 'on';
    });
    it('the menu-size control persists the radial menu size to localStorage', async () => {
        const wrapper = mountSettings();
        const largeButton = wrapper.findAll('[data-testid="ring-size"] button').find((button) => button.text() === 'Large');
        await largeButton.trigger('click');
        expect(ringSizePreference.setting).toBe('large');
        expect(localStorage.getItem('bjarnoy.ringSize')).toBe('large');
        expect(largeButton.attributes('aria-pressed')).toBe('true');
        ringSizePreference.setting = 'normal';
    });
    it.each([
        ['water', 'bjarnoy.motion.water'],
        ['lakes', 'bjarnoy.motion.lakes'],
        ['fog', 'bjarnoy.motion.fog'],
        ['menus', 'bjarnoy.motion.hud'],
    ])('the %s row persists its own setting and leaves the others alone', async (row, key) => {
        localStorage.clear();
        motionPreferences.water = 'auto';
        motionPreferences.lakes = 'auto';
        motionPreferences.fog = 'auto';
        motionPreferences.hud = 'auto';
        const wrapper = mountSettings();
        const offButton = wrapper.findAll(`[data-testid="motion-${row}"] button`).find((b) => b.text() === 'Off');
        await offButton.trigger('click');
        expect(localStorage.getItem(key)).toBe('off');
        expect(offButton.attributes('aria-pressed')).toBe('true');
        expect(animationPreference.setting).toBe('auto');
        const others = ['bjarnoy.motion.water', 'bjarnoy.motion.lakes', 'bjarnoy.motion.fog', 'bjarnoy.motion.hud'].filter((k) => k !== key);
        expect(others.map((k) => localStorage.getItem(k))).toEqual(['auto', 'auto', 'auto']);
        motionPreferences.water = 'auto';
        motionPreferences.lakes = 'auto';
        motionPreferences.fog = 'auto';
        motionPreferences.hud = 'auto';
    });
    it("shows the device's reduce-motion state and an OS hint", async () => {
        const wrapper = mountSettings();
        expect(wrapper.get('[data-testid="device-motion-state"]').text()).toBe('OFF');
        expect(wrapper.get('[data-testid="device-motion"]').text()).toContain('“Auto” below follows this.');
        Object.defineProperty(animationPreference, 'reducedMotion', { get: () => true, configurable: true });
        await flushPromises();
        const again = mountSettings();
        expect(again.get('[data-testid="device-motion-state"]').text()).toBe('ON');
    });
    it("shows the 'measuring' status for auto before the fps governor has decided", () => {
        const wrapper = mountSettings();
        expect(wrapper.text()).toContain('measuring frame rate');
    });
    it('shows the reduced-motion status when auto and the system asks for reduced motion', () => {
        // animationPreference.reducedMotion is seeded once from matchMedia at
        // module load; overriding the getter exercises the reduced-motion branch.
        Object.defineProperty(animationPreference, 'reducedMotion', {
            get() {
                return true;
            },
            configurable: true,
        });
        const wrapper = mountSettings();
        expect(wrapper.text()).toContain('reduced motion');
    });
});
