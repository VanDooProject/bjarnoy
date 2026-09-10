// @vitest-environment jsdom
//
// The graph's whole job beyond drawing is the hover: three levels of
// emphasis, in both directions along a chain, plus a legend that picks out a
// family. The traversal itself is tested in lib/techtree/graph.test.ts —
// these tests check the component actually renders those sets, since a card
// silently staying at full opacity looks fine and means nothing.
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TechTreeGraph from './TechTreeGraph.vue';
import catalogue from '../../data/building-catalogue.json';
import type { BuildingDefinitionResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enDocs from '../../i18n/locales/en/docs.json';

const byType: Record<string, BuildingDefinitionResponse[]> = {};
for (const definition of catalogue.data as BuildingDefinitionResponse[]) {
  (byType[definition.type] ??= []).push(definition);
}
for (const list of Object.values(byType)) list.sort((a, b) => a.level - b.level);

const mountGraph = () =>
  mount(TechTreeGraph, { props: { byType }, global: { plugins: [createTestI18n({ docs: enDocs })] } });
const card = (wrapper: ReturnType<typeof mountGraph>, type: string) => wrapper.get(`a[href="#${type}"]`);

describe('TechTreeGraph', () => {
  it('draws a card per building with its prerequisite chips', () => {
    const wrapper = mountGraph();

    expect(card(wrapper, 'shrineoffreyja').text()).toContain('Shrine of Freyja');
    expect(card(wrapper, 'shrineoffreyja').text()).toContain('Farm 10');
    expect(card(wrapper, 'shrineoffreyja').text()).toContain('Pumpkin 10');
    wrapper.unmount();
  });

  it('leaves buildings hidden from the docs out', () => {
    const wrapper = mountGraph();

    expect(wrapper.find('a[href="#magictower"]').exists()).toBe(false);
    expect(wrapper.find('a[href="#fisherhut"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('draws no emphasis at all until something is hovered', () => {
    const wrapper = mountGraph();

    expect(wrapper.findAll('.card--full')).toHaveLength(0);
    expect(wrapper.findAll('.card--dim')).toHaveLength(0);
    wrapper.unmount();
  });

  it('lights prerequisites, half-lights what a building leads to, dims the rest', async () => {
    const wrapper = mountGraph();

    await card(wrapper, 'archeryrange').trigger('mouseenter');

    // Needs these — the whole Tower -> Barracks -> Archery Range chain.
    for (const type of ['archeryrange', 'barracks', 'tower', 'longhouse']) {
      expect(card(wrapper, type).classes(), type).toContain('card--full');
    }
    // Leads to this.
    expect(card(wrapper, 'shrineofthor').classes()).toContain('card--soft');
    // Unrelated.
    expect(card(wrapper, 'quarry').classes()).toContain('card--dim');

    expect(wrapper.find('.link--full').exists()).toBe(true);
    expect(wrapper.find('.link--soft').exists()).toBe(true);
    wrapper.unmount();
  });

  it('treats keyboard focus the same as hover', async () => {
    const wrapper = mountGraph();

    await card(wrapper, 'archeryrange').trigger('focus');

    expect(card(wrapper, 'barracks').classes()).toContain('card--full');
    wrapper.unmount();
  });

  it('resets when the pointer leaves the grid', async () => {
    const wrapper = mountGraph();

    await card(wrapper, 'storagehouse').trigger('mouseenter');
    await wrapper.get('.grid').trigger('mouseleave');

    expect(wrapper.findAll('.card--dim')).toHaveLength(0);
    wrapper.unmount();
  });

  it('names what is hovered in the status line', async () => {
    const wrapper = mountGraph();

    expect(wrapper.get('.status').text()).toContain('Hover a building');

    await card(wrapper, 'dockyard').trigger('mouseenter');

    expect(wrapper.get('.status').text()).toContain('Dockyard');
    wrapper.unmount();
  });

  it('picks out a family from the legend', async () => {
    const wrapper = mountGraph();
    const water = wrapper.findAll('.legend-button').find((b) => b.text() === 'Water')!;

    await water.trigger('mouseenter');

    expect(water.classes()).toContain('active');
    expect(card(wrapper, 'fishinghut').classes()).toContain('card--full');
    expect(card(wrapper, 'dockyard').classes()).toContain('card--full');
    expect(card(wrapper, 'lumberjack').classes()).toContain('card--dim');
    expect(wrapper.get('.status').text()).toContain('Water');
    wrapper.unmount();
  });

  it('renders a link for every routed segment', () => {
    const wrapper = mountGraph();

    // 15 cards, all connected — there is always more than one link.
    expect(wrapper.findAll('path.link').length).toBeGreaterThan(14);
    wrapper.unmount();
  });
});
