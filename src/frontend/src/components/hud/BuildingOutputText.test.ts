// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import BuildingOutputText from './BuildingOutputText.vue';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

const rate = { kind: 'resourceRate', resource: 'wood', amount: 8 } as const;

describe('BuildingOutputText', () => {
  it('draws a resource rate as amount, resource icon and /h', () => {
    const wrapper = mount(BuildingOutputText, { props: { output: rate }, global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] } });
    expect(wrapper.find('svg.resource-icon').exists()).toBe(true);
    expect(wrapper.text()).toBe('+8 /h');
  });

  it('keeps every other output as text', () => {
    const wrapper = mount(BuildingOutputText, {
      props: { output: { kind: 'storageCapacity', amount: 300 } },
      global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
    });
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(wrapper.text()).toBe('+300 storage capacity');
  });
});
