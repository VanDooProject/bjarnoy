// @vitest-environment jsdom
//
// The docs page footer: the related cards with their reason lines, then previous/next in hub order across groups.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import DocsPageFooter from './DocsPageFooter.vue';
import { docsPageById, type DocsPageId } from '../../lib/docs/docsPages';
import { createTestI18n } from '../../test/i18n';
import enDocs from '../../i18n/locales/en/docs.json';

let wrapper: VueWrapper | undefined;
afterEach(() => wrapper?.unmount());

function mountFooter(id: DocsPageId) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }] });
  wrapper = mount(DocsPageFooter, { props: { page: docsPageById(id) }, global: { plugins: [createTestI18n({ docs: enDocs }), router] } });
  return wrapper;
}

describe('DocsPageFooter', () => {
  it('lists the related cards of a middle page with their reasons, then previous and next', () => {
    const w = mountFooter('shrines');
    expect(w.get('h2').text()).toBe('Related');
    const cards = w.findAll('[data-related]');
    expect(cards.map((c) => c.attributes('data-related'))).toEqual(['techTree', 'production', 'landMovement']);
    expect(cards.map((c) => c.attributes('href'))).toEqual(['/tech-tree', '/docs/production', '/docs/land-movement']);
    expect(cards[0]!.text()).toContain('Tech tree');
    expect(cards[0]!.text()).toContain('Costs and build times of every shrine level.');

    expect(w.get('[data-testid=docs-prev]').attributes('href')).toBe('/docs/production');
    expect(w.get('[data-testid=docs-prev]').text()).toContain('← Previous');
    expect(w.get('[data-testid=docs-prev]').text()).toContain('Resource production');
    expect(w.get('[data-testid=docs-next]').attributes('href')).toBe('/docs/walls');
    expect(w.get('[data-testid=docs-next]').text()).toContain('Next →');
  });

  it('has no previous link on the first page', () => {
    const w = mountFooter('tiles');
    expect(w.find('[data-testid=docs-prev]').exists()).toBe(false);
    expect(w.get('[data-testid=docs-next]').attributes('href')).toBe('/docs/bog-lands');
  });

  it('has no next link on the last page', () => {
    const w = mountFooter('wastedLands');
    expect(w.find('[data-testid=docs-next]').exists()).toBe(false);
    expect(w.get('[data-testid=docs-prev]').attributes('href')).toBe('/docs/wildlife-camps');
  });

  it('walks across groups: the last of one group links to the first of the next', () => {
    expect(mountFooter('bogLands').get('[data-testid=docs-next]').attributes('href')).toBe('/tech-tree');
    wrapper!.unmount();
    expect(mountFooter('founding').get('[data-testid=docs-prev]').attributes('href')).toBe('/docs/walls');
  });
});
