// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ResourceTicker from './ResourceTicker.vue';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

function mountTicker(ticks: { id: number; resource: 'wood' | 'stone' | 'food' | 'iron'; amount: number; x: number; y: number }[]) {
  return mount(ResourceTicker, {
    props: { ticks },
    global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
  });
}

describe('ResourceTicker', () => {
  it('renders one label per tick, with the real resource name and amount', () => {
    const wrapper = mountTicker([
      { id: 1, resource: 'food', amount: 36, x: 10, y: 20 },
      { id: 2, resource: 'wood', amount: 30, x: 30, y: 40 },
    ]);
    const labels = wrapper.findAll('.tick');
    expect(labels).toHaveLength(2);
    expect(labels[0].text()).toContain('+36 Food/h');
    expect(labels[1].text()).toContain('+30 Wood/h');
    wrapper.unmount();
  });

  it('positions each label at its given screen point', () => {
    const wrapper = mountTicker([{ id: 1, resource: 'food', amount: 36, x: 111, y: 222 }]);
    const style = wrapper.get('.tick').attributes('style') ?? '';
    expect(style).toContain('left: 111px');
    expect(style).toContain('top: 222px');
    wrapper.unmount();
  });

  it('emits expire with the tick\'s id when its animation ends', async () => {
    const wrapper = mountTicker([{ id: 7, resource: 'wood', amount: 30, x: 0, y: 0 }]);
    await wrapper.get('.tick').trigger('animationend');
    expect(wrapper.emitted('expire')).toEqual([[7]]);
    wrapper.unmount();
  });

  it('renders nothing for an empty tick list', () => {
    const wrapper = mountTicker([]);
    expect(wrapper.findAll('.tick')).toHaveLength(0);
    wrapper.unmount();
  });
});
