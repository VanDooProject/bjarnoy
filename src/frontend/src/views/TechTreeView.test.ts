// @vitest-environment jsdom
//
// A link into the tech tree (`/tech-tree#reindeerherder`, from BuildingLink) must land on that building's
// section: the router does not scroll, and the sections only exist once the catalogue has rendered.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import TechTreeView from './TechTreeView.vue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import catalogue from '../data/building-catalogue.json';
import type { BuildingDefinitionResponse } from '../api/types';
import { createTestI18n } from '../test/i18n';
import enDocs from '../i18n/locales/en/docs.json';

describe('TechTreeView hash links', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useBuildingCatalogueStore().definitions = catalogue.data as BuildingDefinitionResponse[];
  });

  it('scrolls the section named by the URL hash into view', async () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this.id);
    });
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/tech-tree', component: TechTreeView }] });
    await router.push('/tech-tree#reindeerherder');
    const wrapper = mount(TechTreeView, {
      attachTo: document.body,
      global: {
        plugins: [createTestI18n({ docs: enDocs }), router],
        stubs: { DocsPageLayout: { template: '<div><slot name="wide" /><slot /></div>' }, TechTreeGraph: true },
      },
    });
    await flushPromises();

    expect(scrolled).toContain('reindeerherder');
    wrapper.unmount();
  });

  it('does not scroll when the URL has no hash', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/tech-tree', component: TechTreeView }] });
    await router.push('/tech-tree');
    const wrapper = mount(TechTreeView, {
      attachTo: document.body,
      global: {
        plugins: [createTestI18n({ docs: enDocs }), router],
        stubs: { DocsPageLayout: { template: '<div><slot name="wide" /><slot /></div>' }, TechTreeGraph: true },
      },
    });
    await flushPromises();

    expect(scrollIntoView).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
