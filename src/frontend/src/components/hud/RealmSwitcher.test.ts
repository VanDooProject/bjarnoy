// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import RealmSwitcher from './RealmSwitcher.vue';
import { useWorldStore } from '../../stores/world';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import type { SettlementSummary } from '../../api/types';

const row = (id: string, name: string, longhouseLevel: number) => ({ id, realmId: id, name, longhouseLevel }) as SettlementSummary;

const mounted: { unmount: () => void }[] = [];

function setup(realms: SettlementSummary[]) {
  setActivePinia(createPinia());
  const world = useWorldStore();
  world.selectedSettlementId = 'a';
  world.myRealms = realms;
  const wrapper = mount(RealmSwitcher, {
    props: { variant: 'bar' },
    attachTo: document.body,
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
  mounted.push(wrapper);
  return { world, wrapper };
}

describe('RealmSwitcher', () => {
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount());
  });

  it('is hidden with one realm', () => {
    const { wrapper } = setup([row('a', 'Hrafn', 4)]);
    expect(wrapper.find('[data-testid="realm-switcher-toggle"]').exists()).toBe(false);
  });

  it('lists the realms with their longhouse level and marks the current one', async () => {
    const { wrapper } = setup([row('a', 'Hrafn', 4), row('b', 'Sker', 2)]);
    const toggle = wrapper.get('[data-testid="realm-switcher-toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    const rows = [...document.body.querySelectorAll<HTMLElement>('.realm-row')];
    expect(rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['HrafnLonghouse 4', 'SkerLonghouse 2']);
    expect(rows[0].classList.contains('current')).toBe(true);
    expect(rows[1].classList.contains('current')).toBe(false);
  });

  it('picking another realm switches to it, asks the map to centre on it and closes', async () => {
    const { world, wrapper } = setup([row('a', 'Hrafn', 4), row('b', 'Sker', 2)]);
    const spy = vi.spyOn(world, 'switchToSettlement').mockResolvedValue();
    await wrapper.get('[data-testid="realm-switcher-toggle"]').trigger('click');
    document.body.querySelector<HTMLElement>('[data-testid="realm-row-b"]')!.click();
    await flushPromises();
    expect(spy).toHaveBeenCalledWith('b');
    expect(wrapper.emitted('focus-home')).toHaveLength(1);
    expect(wrapper.get('[data-testid="realm-switcher-toggle"]').attributes('aria-expanded')).toBe('false');
  });

  it('picking the current realm only closes the list', async () => {
    const { world, wrapper } = setup([row('a', 'Hrafn', 4), row('b', 'Sker', 2)]);
    const spy = vi.spyOn(world, 'switchToSettlement').mockResolvedValue();
    await wrapper.get('[data-testid="realm-switcher-toggle"]').trigger('click');
    document.body.querySelector<HTMLElement>('[data-testid="realm-row-a"]')!.click();
    await flushPromises();
    expect(spy).not.toHaveBeenCalled();
    expect(wrapper.emitted('focus-home')).toBeUndefined();
    expect(wrapper.get('[data-testid="realm-switcher-toggle"]').attributes('aria-expanded')).toBe('false');
  });

  it('keeps the list open on a tap inside the teleported panel and closes on a tap outside', async () => {
    const { wrapper } = setup([row('a', 'Hrafn', 4), row('b', 'Sker', 2)]);
    await wrapper.get('[data-testid="realm-switcher-toggle"]').trigger('click');
    const heading = document.body.querySelector('.realm-switcher-heading')!;
    heading.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(wrapper.get('[data-testid="realm-switcher-toggle"]').attributes('aria-expanded')).toBe('true');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(wrapper.get('[data-testid="realm-switcher-toggle"]').attributes('aria-expanded')).toBe('false');
  });

  it('closes on Escape', async () => {
    const { wrapper } = setup([row('a', 'Hrafn', 4), row('b', 'Sker', 2)]);
    await wrapper.get('[data-testid="realm-switcher-toggle"]').trigger('click');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.get('[data-testid="realm-switcher-toggle"]').attributes('aria-expanded')).toBe('false');
  });
});
