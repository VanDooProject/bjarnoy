// @vitest-environment jsdom
//
// The realm page: the tower-limit table is generated from the game's `maxTowers`, the sections are all there and both languages
// resolve every key the page uses. The page shell and the example map (a WebGL canvas) are stubbed.
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent } from 'vue';
import { createI18n } from 'vue-i18n';
import RealmView from './RealmView.vue';
import { maxTowers } from '../lib/map/buildingEconomy';
import enCommon from '../i18n/locales/en/common.json';
import deCommon from '../i18n/locales/de/common.json';
import enCatalogue from '../i18n/locales/en/catalogue.json';
import deCatalogue from '../i18n/locales/de/catalogue.json';
import enDocs from '../i18n/locales/en/docs.json';
import deDocs from '../i18n/locales/de/docs.json';
import { datetimeFormats, numberFormats } from '../i18n/formats';

const Passthrough = defineComponent({ template: '<div><slot /></div>' });
const Stub = (name: string) => defineComponent({ template: `<div data-testid="${name}" />` });
const BuildingLinkStub = defineComponent({ props: ['type'], template: '<span class="building-link" :data-type="type">{{ type }}</span>' });

function mountPage(locale: 'en' | 'de') {
  setActivePinia(createPinia());
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: {
      en: { common: enCommon, catalogue: enCatalogue, docs: enDocs },
      de: { common: deCommon, catalogue: deCatalogue, docs: deDocs },
    },
    datetimeFormats,
    numberFormats,
    missing: (_locale, key) => {
      throw new Error(`Missing i18n key in test: ${key}`);
    },
  });
  return mount(RealmView, {
    global: {
      plugins: [i18n],
      stubs: { DocsPageLayout: Passthrough, RealmExample: Stub('realm-example'), BuildingLink: BuildingLinkStub },
    },
  });
}

describe('RealmView', () => {
  it.each(['en', 'de'] as const)('lists the tower limit per Longhouse level from maxTowers (%s)', (locale) => {
    const wrapper = mountPage(locale);
    const rows = wrapper.findAll('[data-testid="tower-limit-table"] tbody tr');
    expect(rows.length).toBeGreaterThan(5);
    for (const row of rows) {
      const from = Number(row.attributes('data-from'));
      expect(Number(row.get('td').text())).toBe(maxTowers(from));
    }
    expect(rows[0]!.text()).toContain('3–6');
    expect(rows.at(-1)!.text()).toContain('29–30');
    expect(rows.at(-1)!.text()).toContain('13');
  });

  it('has the five sections, the example, and the four tower grounds', () => {
    const wrapper = mountPage('en');
    for (const id of ['claim', 'towers', 'count', 'where', 'giants']) expect(wrapper.find(`#${id}`).exists(), id).toBe(true);
    expect(wrapper.find('[data-testid="realm-example"]').exists()).toBe(true);
    expect(wrapper.findAll('figure.ground').map((f) => f.attributes('data-ground'))).toEqual(['grass', 'sand', 'forest', 'bog']);
    expect(wrapper.find('#claim').text()).toContain('longhouse');
  });
});
