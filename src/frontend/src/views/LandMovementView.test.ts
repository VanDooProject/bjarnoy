// @vitest-environment jsdom
//
// The land movement docs page: the wide river is shut except over a bridge, and the bridge section quotes the crossing cost of
// every level and who may cross, in both languages. The page shell, the unit store and the building links are stubbed: this
// covers what the view itself puts on the page.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent } from 'vue';
import LandMovementView from './LandMovementView.vue';
import { createI18n } from 'vue-i18n';
import enCommon from '../i18n/locales/en/common.json';
import deCommon from '../i18n/locales/de/common.json';
import enCatalogue from '../i18n/locales/en/catalogue.json';
import deCatalogue from '../i18n/locales/de/catalogue.json';
import { datetimeFormats, numberFormats } from '../i18n/formats';
import enDocs from '../i18n/locales/en/docs.json';
import deDocs from '../i18n/locales/de/docs.json';

vi.mock('../stores/unitCatalogue', () => ({
  useUnitCatalogueStore: () => ({ load: () => undefined, loading: false, definitions: [], byType: {} }),
}));

const Passthrough = defineComponent({ template: '<div><slot /></div>' });
const BuildingLinkStub = defineComponent({ props: ['type'], template: '<span class="building-link" :data-type="type">{{ type }}</span>' });

function i18nFor(locale: 'en' | 'de') {
  return createI18n({
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
}

const mounted: VueWrapper[] = [];
function mountPage(locale: 'en' | 'de') {
  setActivePinia(createPinia());
  const wrapper = mount(LandMovementView, {
    global: {
      plugins: [i18nFor(locale)],
      stubs: { DocsPageLayout: Passthrough, DocsToc: true, DocsPageLink: Passthrough, BuildingLink: BuildingLinkStub },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe('LandMovementView bridges', () => {
  afterEach(() => mounted.splice(0).forEach((w) => w.unmount()));

  it('shuts the wide river except over a bridge, and shows no "planned" admin note any more', () => {
    const page = mountPage('en');
    expect(page.get('[data-ground="wideRiver"]').text()).toContain('Only over a bridge');
    expect(page.find('[data-testid="admin-note"]').exists()).toBe(false);
    expect(page.text()).not.toContain('planned but not in the game');
  });

  it('prices each bridge level from the pathfinder numbers and names who may cross', () => {
    const page = mountPage('en');
    const row = (name: string) => page.get(`[data-bridge="${name}"]`).text();
    expect(page.findAll('[data-testid="bridge-table"] tbody tr')).toHaveLength(4);
    expect(row('causeway')).toContain('6');
    expect(row('footbridge')).toContain('4');
    expect(row('kings')).toContain('1–1.3');
    expect(row('guarded')).toContain('1–1.3');
    expect(row('causeway')).toContain('Every army');
    expect(row('guarded')).toContain('Its owner’s armies and their friends’');
    expect(page.findAll('.building-link').map((l) => l.attributes('data-type'))).toEqual(['bridge', 'townsquare', 'odinstatue']);
  });

  it('says the same in German', () => {
    const page = mountPage('de');
    expect(page.get('[data-ground="wideRiver"]').text()).toContain('Nur über eine Brücke');
    expect(page.get('[data-bridge="guarded"]').text()).toContain('Wehrbrücke');
    expect(page.get('[data-bridge="causeway"]').text()).toContain('Damm');
    expect(page.get('[data-bridge="kings"]').text()).toContain('1–1,3');
  });
});
