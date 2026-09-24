// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AiBadge from './AiBadge.vue';
import { createTestI18n } from '../test/i18n';
import enHud from '../i18n/locales/en/hud.json';

function mountBadge(personality: string) {
  return mount(AiBadge, {
    props: { personality },
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
}

describe('AiBadge', () => {
  it('renders the AI label', () => {
    const wrapper = mountBadge('aggressive');
    expect(wrapper.text()).toBe('AI');
  });

  it("titles the badge with the personality's translated name", () => {
    const wrapper = mountBadge('aggressive');
    expect(wrapper.get('.ai-badge').attributes('title')).toBe('AI player (Aggressive)');
  });

  it('falls back to the raw wire name for an unknown personality rather than throwing', () => {
    const wrapper = mountBadge('mysterious');
    expect(wrapper.get('.ai-badge').attributes('title')).toBe('AI player (mysterious)');
  });
});
