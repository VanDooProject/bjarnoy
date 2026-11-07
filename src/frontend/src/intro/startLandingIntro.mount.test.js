// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
vi.mock('./fogTexture', () => ({ introFogUrl: () => 'data:image/png;base64,' }));
import { mountLandingIntro } from './startLandingIntro';
import { introMounted } from './introSignal';
afterEach(() => {
    document.body.innerHTML = '';
});
describe('mountLandingIntro', () => {
    it('mounts on its own root and Esc removes it at once, without an exit phase', async () => {
        const phases = [];
        mountLandingIntro();
        const root = () => document.querySelector('[data-testid="landing-intro"]');
        new MutationObserver(() => {
            const p = root()?.getAttribute('data-phase');
            if (p && phases[phases.length - 1] !== p)
                phases.push(p);
        }).observe(document.body, { subtree: true, attributes: true, childList: true });
        expect(root()).not.toBeNull();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await flushPromises();
        expect(root()).toBeNull();
        expect(document.getElementById('landing-intro')).toBeNull();
        expect(phases).not.toContain('exiting');
    });
    it('tracks the mounted state, ignores a second mount and mounts again after closing', async () => {
        mountLandingIntro();
        expect(introMounted.value).toBe(true);
        mountLandingIntro();
        expect(document.querySelectorAll('#landing-intro')).toHaveLength(1);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await flushPromises();
        expect(introMounted.value).toBe(false);
        mountLandingIntro();
        expect(document.querySelectorAll('#landing-intro')).toHaveLength(1);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await flushPromises();
    });
});
