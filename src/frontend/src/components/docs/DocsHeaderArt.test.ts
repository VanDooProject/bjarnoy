// @vitest-environment jsdom
//
// The docs header art: icon for single-family pages, a backdrop (with the icon kept for phones) for the others.
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import DocsHeaderArt from './DocsHeaderArt.vue';
import { DOCS_PAGES, docsPageById } from '../../lib/docs/docsPages';

let wrapper: VueWrapper | undefined;
afterEach(() => wrapper?.unmount());

describe('DocsHeaderArt', () => {
  it.each(DOCS_PAGES.map((p) => [p.id, p.headerArt] as const))('%s uses the %s mode', (id, mode) => {
    wrapper = mount(DocsHeaderArt, { props: { page: docsPageById(id) } });
    expect(wrapper.get('[data-testid=docs-header-art]').attributes('data-mode')).toBe(mode);
    expect(wrapper.find('[data-testid=docs-header-icon]').exists()).toBe(true);
    expect(wrapper.find('[data-testid=docs-header-backdrop]').exists()).toBe(mode === 'backdrop');
    wrapper.unmount();
  });

  it('draws the page art 72px as an icon and 260px as a backdrop, hidden from assistive tech', () => {
    wrapper = mount(DocsHeaderArt, { props: { page: docsPageById('ships') } });
    const icon = wrapper.get('[data-testid=docs-header-icon]');
    const backdrop = wrapper.get('[data-testid=docs-header-backdrop]');
    expect(icon.attributes('style')).toContain('width: 72px');
    expect(backdrop.attributes('style')).toContain('width: 260px');
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(backdrop.attributes('aria-hidden')).toBe('true');
    expect(backdrop.attributes('data-art')).toBe('dockyard_SE_level007');
  });

  it('shows the still frame of animated art', () => {
    wrapper = mount(DocsHeaderArt, { props: { page: docsPageById('production') } });
    expect(wrapper.get('[data-testid=docs-header-icon]').attributes('data-art')).toBe('anim:reindeerherder:4');
  });
});
