// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PlayIntroButton from './PlayIntroButton.vue';
import { introMounted } from './introSignal';
import { createTestI18n } from '../test/i18n';
import enIntro from '../i18n/locales/en/intro.json';
const mountLandingIntro = vi.hoisted(() => vi.fn());
vi.mock('./startLandingIntro', () => ({ mountLandingIntro }));
afterEach(() => {
    introMounted.value = false;
    mountLandingIntro.mockReset();
});
const mountButton = () => mount(PlayIntroButton, { global: { plugins: [createTestI18n({ intro: enIntro })] } });
describe('PlayIntroButton', () => {
    it('shows while the intro is not mounted and mounts it on click', async () => {
        const w = mountButton();
        const btn = w.get('[data-testid="play-intro"]');
        expect(btn.text()).toBe('Play intro');
        await btn.trigger('click');
        expect(mountLandingIntro).toHaveBeenCalledTimes(1);
    });
    it('is not rendered while the intro plays', async () => {
        introMounted.value = true;
        const w = mountButton();
        await flushPromises();
        expect(w.find('[data-testid="play-intro"]').exists()).toBe(false);
    });
});
