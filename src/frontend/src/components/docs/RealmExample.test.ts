// @vitest-environment jsdom
//
// The realm example: the renderer is a WebGL canvas jsdom cannot draw, so the composable is stubbed with a fake renderer that counts
// redraws. What matters here is that the step picker re-claims the ground on the model the renderer was handed, redraws, and shows
// that step's caption.
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { shallowRef } from 'vue';
import { createI18n } from 'vue-i18n';
import enDocs from '../../i18n/locales/en/docs.json';
import deDocs from '../../i18n/locales/de/docs.json';
import { realmExampleClaimed } from '../../lib/docs/realmExample';
import type { StaticWorldModel } from '../../lib/map/StaticWorldModel';

const forceRebuild = vi.fn();
let model: StaticWorldModel | undefined;
vi.mock('../../composables/useHexMapRenderer', () => ({
  useHexMapRenderer: (_canvas: unknown, _container: unknown, options: { worldModel: StaticWorldModel }) => {
    model = options.worldModel;
    return { renderer: shallowRef({ forceRebuild }) };
  },
}));

import RealmExample from './RealmExample.vue';

describe('RealmExample', () => {
  it.each(['en', 'de'] as const)('steps through the three examples and redraws the claimed realm (%s)', async (locale) => {
    const i18n = createI18n({ legacy: false, locale, messages: { [locale]: { docs: locale === 'en' ? enDocs : deDocs } } });
    const wrapper = mount(RealmExample, { global: { plugins: [i18n] } });
    const claimed = () => realmExampleClaimed(model!).length;
    const buttons = wrapper.findAll('button.variant-button');
    expect(buttons).toHaveLength(3);

    const captions = [0, 1, 2].map(() => '');
    const first = claimed();
    captions[0] = wrapper.get('[data-testid="realm-example-caption"]').text();
    expect(first).toBe(37);

    await buttons[1]!.trigger('click');
    captions[1] = wrapper.get('[data-testid="realm-example-caption"]').text();
    const second = claimed();
    expect(second).toBeGreaterThan(first);
    expect(forceRebuild).toHaveBeenCalledTimes(1);

    await buttons[2]!.trigger('click');
    captions[2] = wrapper.get('[data-testid="realm-example-caption"]').text();
    expect(claimed()).toBeGreaterThan(second);
    expect(forceRebuild).toHaveBeenCalledTimes(2);

    expect(new Set(captions).size).toBe(3);
    wrapper.unmount();
    forceRebuild.mockClear();
  });
});
