// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import HudPositionToggle from './HudPositionToggle.vue';
import { useHudPositionPreference } from '../composables/useHudPosition';
import { createTestI18n } from '../test/i18n';
import enHud from '../i18n/locales/en/hud.json';

function mountToggle() {
  return mount(HudPositionToggle, {
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
}

beforeEach(() => {
  localStorage.clear();
  useHudPositionPreference().setPreference('top');
});

describe('HudPositionToggle', () => {
  it('marks the current preference as pressed', () => {
    const wrapper = mountToggle();
    const buttons = wrapper.findAll('button');

    expect(buttons[0].attributes('aria-pressed')).toBe('true');
    expect(buttons[1].attributes('aria-pressed')).toBe('false');
  });

  it('updates the shared preference and localStorage on click', async () => {
    const wrapper = mountToggle();
    const buttons = wrapper.findAll('button');

    await buttons[1].trigger('click');

    expect(buttons[1].attributes('aria-pressed')).toBe('true');
    expect(localStorage.getItem('fjordhold:hudPositionPref')).toBe('bottom');
  });
});
