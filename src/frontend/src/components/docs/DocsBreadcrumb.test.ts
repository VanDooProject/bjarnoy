// @vitest-environment jsdom
//
// The docs breadcrumb: "Docs > group > page", the page crumb opens the pages of its group, the group crumb the four
// groups; one menu at a time, Escape and an outside click close it.
import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import DocsBreadcrumb from './DocsBreadcrumb.vue';
import { docsPageById } from '../../lib/docs/docsPages';
import { createTestI18n } from '../../test/i18n';
import enDocs from '../../i18n/locales/en/docs.json';

let wrapper: VueWrapper | undefined;
afterEach(() => wrapper?.unmount());

async function mountCrumb(pageId = 'shrines' as Parameters<typeof docsPageById>[0]) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  });
  await router.push('/docs/shrines');
  wrapper = mount(DocsBreadcrumb, {
    attachTo: document.body,
    props: { page: docsPageById(pageId) },
    global: { plugins: [createTestI18n({ docs: enDocs }), router] },
  });
  await flushPromises();
  return { wrapper, router };
}

const pageTrigger = () => wrapper!.get('[data-trigger=page]');
const groupTrigger = () => wrapper!.get('[data-trigger=group]');

describe('DocsBreadcrumb', () => {
  it('shows Docs > group > page, the page crumb marked as the current page', async () => {
    await mountCrumb();
    const nav = wrapper!.get('nav');
    expect(nav.attributes('aria-label')).toBe('Breadcrumb');
    expect(wrapper!.get('a.docs-crumb').attributes('href')).toBe('/docs');
    expect(groupTrigger().text()).toContain('Building up');
    expect(pageTrigger().text()).toContain('Shrines');
    expect(pageTrigger().attributes('aria-current')).toBe('page');
    expect(wrapper!.find('[role=menu]').exists()).toBe(false);
  });

  it('opens the pages of its group from the page crumb, the current one highlighted', async () => {
    await mountCrumb();
    expect(pageTrigger().attributes('aria-haspopup')).toBe('menu');
    expect(pageTrigger().attributes('aria-expanded')).toBe('false');
    await pageTrigger().trigger('click');

    expect(pageTrigger().attributes('aria-expanded')).toBe('true');
    const items = wrapper!.findAll('[data-menu=page] [role=menuitem]');
    expect(items.map((i) => i.text())).toEqual(['Tech tree', 'Resource production', 'Shrines', 'Walls']);
    expect(items.map((i) => i.attributes('href'))).toEqual(['/tech-tree', '/docs/production', '/docs/shrines', '/docs/walls']);
    expect(items.filter((i) => i.classes('current')).map((i) => i.text())).toEqual(['Shrines']);
    expect(items[2]!.attributes('aria-current')).toBe('page');
  });

  it('opens the four groups from the group crumb, each linking to its hub section', async () => {
    await mountCrumb();
    await groupTrigger().trigger('click');

    expect(groupTrigger().attributes('aria-expanded')).toBe('true');
    const items = wrapper!.findAll('[data-menu=group] [role=menuitem]');
    expect(items.map((i) => i.text())).toEqual(['Your island', 'Building up', 'On the move', 'Beyond your shores']);
    expect(items.map((i) => i.attributes('href'))).toEqual([
      '/docs#group-island', '/docs#group-building', '/docs#group-move', '/docs#group-beyond',
    ]);
    expect(items.filter((i) => i.classes('current')).map((i) => i.attributes('data-group'))).toEqual(['building']);
  });

  it('keeps one menu open at a time', async () => {
    await mountCrumb();
    await pageTrigger().trigger('click');
    await groupTrigger().trigger('click');
    expect(wrapper!.findAll('[role=menu]')).toHaveLength(1);
    expect(wrapper!.find('[data-menu=group]').exists()).toBe(true);
    expect(pageTrigger().attributes('aria-expanded')).toBe('false');
  });

  it('closes on a second click on the crumb', async () => {
    await mountCrumb();
    await pageTrigger().trigger('click');
    await pageTrigger().trigger('click');
    expect(wrapper!.find('[role=menu]').exists()).toBe(false);
  });

  it('closes on Escape and returns focus to the crumb', async () => {
    await mountCrumb();
    await pageTrigger().trigger('click');
    await flushPromises();
    expect(document.activeElement?.getAttribute('data-page')).toBe('shrines');

    await wrapper!.get('[data-menu=page]').trigger('keydown', { key: 'Escape' });
    expect(wrapper!.find('[role=menu]').exists()).toBe(false);
    expect(pageTrigger().attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(pageTrigger().element);
  });

  it('moves through the entries with the arrow keys', async () => {
    await mountCrumb();
    await pageTrigger().trigger('click');
    await flushPromises();
    const menu = wrapper!.get('[data-menu=page]');
    await menu.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('data-page')).toBe('walls');
    await menu.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('data-page')).toBe('techTree');
    await menu.trigger('keydown', { key: 'ArrowUp' });
    expect(document.activeElement?.getAttribute('data-page')).toBe('walls');
  });

  it('closes on a click outside, not on a click inside the breadcrumb', async () => {
    await mountCrumb();
    await pageTrigger().trigger('click');
    wrapper!.get('nav').element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(wrapper!.find('[role=menu]').exists()).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(wrapper!.find('[role=menu]').exists()).toBe(false);
  });

  it('closes when a menu entry navigates', async () => {
    const { router } = await mountCrumb();
    await pageTrigger().trigger('click');
    await wrapper!.get('[data-page=walls]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/docs/walls');
    expect(wrapper!.find('[role=menu]').exists()).toBe(false);
  });

  it('shows only the Docs link when the route has no page entry', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] });
    wrapper = mount(DocsBreadcrumb, { global: { plugins: [createTestI18n({ docs: enDocs }), router] } });
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(wrapper.get('a').text()).toBe('Docs');
  });
});
