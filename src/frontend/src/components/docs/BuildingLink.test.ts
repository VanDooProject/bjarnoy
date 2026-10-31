// @vitest-environment jsdom
//
// BuildingLink: a building named in docs text. Its first mention on a page is a link into the tech tree with a
// preview card; later mentions are plain words. The preview opens on hover, keyboard focus and the first tap on a
// touch screen, and closes on Escape.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { defineComponent, h } from 'vue';
import BuildingLink from './BuildingLink.vue';
import { provideFirstMentions } from '../../composables/useFirstMentions';
import { useBuildingCatalogueStore } from '../../stores/buildingCatalogue';
import catalogue from '../../data/building-catalogue.json';
import type { BuildingDefinitionResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enDocs from '../../i18n/locales/en/docs.json';

const mounted: VueWrapper[] = [];

function mountPage(links: { type: string; label?: string }[], withRegister = true) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/docs/tech-tree', component: { template: '<div />' } },
    ],
  });
  const Page = defineComponent({
    setup() {
      if (withRegister) provideFirstMentions();
      return () => h('p', links.map((l) => h(BuildingLink, l)));
    },
  });
  const wrapper = mount(Page, {
    attachTo: document.body,
    global: { plugins: [createTestI18n({ docs: enDocs }), router] },
  });
  mounted.push(wrapper);
  return { wrapper, router };
}

describe('BuildingLink', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useBuildingCatalogueStore().definitions = catalogue.data as BuildingDefinitionResponse[];
  });
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount());
    vi.restoreAllMocks();
  });

  it('links the first mention to the building in the tech tree, under the catalogue name', () => {
    const { wrapper } = mountPage([{ type: 'reindeerherder' }]);

    const link = wrapper.get('a.link');
    expect(link.text()).toBe('Reindeer Herder');
    expect(link.attributes('href')).toBe('/docs/tech-tree#reindeerherder');
  });

  it('shows a later mention of the same building as plain text, and a different building as a link', () => {
    const { wrapper } = mountPage([{ type: 'farm' }, { type: 'farm' }, { type: 'tower' }]);

    expect(wrapper.findAll('[data-building-link="link"]').map((e) => e.attributes('data-type'))).toEqual(['farm', 'tower']);
    const plain = wrapper.findAll('[data-building-link="plain"]');
    expect(plain).toHaveLength(1);
    expect(plain[0]!.text()).toBe('Farm');
    expect(plain[0]!.find('a').exists()).toBe(false);
  });

  it('always links a table-subject mention (`always`), even after an earlier mention', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }, { path: '/docs/tech-tree', component: { template: '<div />' } }] });
    const Page = defineComponent({
      setup() {
        provideFirstMentions();
        return () => h('p', [h(BuildingLink, { type: 'farm' }), h(BuildingLink, { type: 'farm', always: true }), h(BuildingLink, { type: 'farm' })]);
      },
    });
    const wrapper = mount(Page, { attachTo: document.body, global: { plugins: [createTestI18n({ docs: enDocs }), router] } });
    mounted.push(wrapper);

    const states = wrapper.findAll('[data-building-link]').map((e) => e.attributes('data-building-link'));
    expect(states).toEqual(['link', 'link', 'plain']);
  });

  it('an `always` link does not consume the first mention: a later plain mention still becomes the link', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }, { path: '/docs/tech-tree', component: { template: '<div />' } }] });
    const Page = defineComponent({
      setup() {
        provideFirstMentions();
        return () => h('p', [h(BuildingLink, { type: 'farm', always: true }), h(BuildingLink, { type: 'farm' }), h(BuildingLink, { type: 'farm' })]);
      },
    });
    const wrapper = mount(Page, { attachTo: document.body, global: { plugins: [createTestI18n({ docs: enDocs }), router] } });
    mounted.push(wrapper);

    const states = wrapper.findAll('[data-building-link]').map((e) => e.attributes('data-building-link'));
    expect(states).toEqual(['link', 'link', 'plain']);
  });

  it('links every mention when no page provides a register', () => {
    const { wrapper } = mountPage([{ type: 'farm' }, { type: 'farm' }], false);

    expect(wrapper.findAll('a.link')).toHaveLength(2);
  });

  it('uses the label in place of the catalogue name', () => {
    const { wrapper } = mountPage([{ type: 'farm', label: 'the farms' }]);

    expect(wrapper.get('a.link').text()).toBe('the farms');
  });

  it('opens the preview on keyboard focus and closes it on Escape', async () => {
    const { wrapper } = mountPage([{ type: 'reindeerherder' }]);
    const link = wrapper.get('a.link');
    expect(wrapper.find('[role=tooltip]').exists()).toBe(false);

    await link.trigger('focusin');
    const tip = wrapper.get('[role=tooltip]');
    expect(link.attributes('aria-describedby')).toBe(tip.attributes('id'));
    expect(tip.text()).toContain('Reindeer Herder');
    expect(tip.text()).toContain('Food');
    expect(tip.text()).toContain('levels 1–25');
    expect(tip.text()).toContain('Grassland');
    expect(tip.get('a.cta').text()).toBe('Costs and levels in the tech tree →');
    expect(tip.get('a.cta').attributes('href')).toBe('/docs/tech-tree#reindeerherder');

    await link.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[role=tooltip]').exists()).toBe(false);
    expect(link.attributes('aria-describedby')).toBeUndefined();
  });

  it('opens on hover and closes when the pointer leaves', async () => {
    const { wrapper } = mountPage([{ type: 'shrineofnjord' }]);
    const root = wrapper.get('[data-building-link="link"]');

    await root.trigger('mouseenter');
    expect(wrapper.get('[role=tooltip]').text()).toContain('Shallow (coastal) water');

    await root.trigger('mouseleave');
    expect(wrapper.find('[role=tooltip]').exists()).toBe(false);
  });

  it('opens the preview on the first touch tap and follows the link on the second', async () => {
    const { wrapper, router } = mountPage([{ type: 'tower' }]);
    await router.push('/');
    const link = wrapper.get('a.link');
    const tap = async () => {
      link.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await flushPromises();
    };

    await link.trigger('pointerdown', { pointerType: 'touch' });
    await tap();
    expect(wrapper.find('[role=tooltip]').exists()).toBe(true);
    expect(router.currentRoute.value.path).toBe('/');

    await link.trigger('pointerdown', { pointerType: 'touch' });
    await tap();
    expect(router.currentRoute.value.fullPath).toBe('/docs/tech-tree#tower');
  });

  it('follows the link on the first click of a mouse', async () => {
    const { wrapper, router } = mountPage([{ type: 'tower' }]);
    await router.push('/');

    await wrapper.get('a.link').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe('/docs/tech-tree#tower');
  });

  it('keeps the card inside the viewport by shifting it left when the name is at the right edge', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 380, right: 480, top: 100, bottom: 120, width: 100, height: 20, x: 380, y: 100, toJSON: () => ({}),
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 260 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 90 });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => 390 });
    try {
      const { wrapper } = mountPage([{ type: 'tower' }]);
      await wrapper.get('a.link').trigger('focusin');
      await flushPromises();

      expect(wrapper.get('[role=tooltip]').attributes('style')).toContain('left: 122px');
    } finally {
      // @ts-expect-error restoring the jsdom defaults
      delete HTMLElement.prototype.offsetWidth;
      // @ts-expect-error restoring the jsdom defaults
      delete HTMLElement.prototype.offsetHeight;
      // @ts-expect-error restoring the jsdom defaults
      delete document.documentElement.clientWidth;
    }
  });
});
