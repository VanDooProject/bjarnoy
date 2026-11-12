// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DebugPanelLegend from './DebugPanelLegend.vue';

describe('DebugPanelLegend', () => {
  it('starts collapsed and toggles open and closed on click', async () => {
    const w = mount(DebugPanelLegend, { slots: { default: 'A long note about the numbers above.' } });
    const button = w.get('button');
    expect(button.attributes('aria-expanded')).toBe('false');
    expect(button.classes()).not.toContain('open');
    expect(button.text()).toContain('A long note about the numbers above.');
    await button.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('true');
    expect(button.classes()).toContain('open');
    await button.trigger('click');
    expect(button.attributes('aria-expanded')).toBe('false');
  });
});
