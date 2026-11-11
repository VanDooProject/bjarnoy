// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SettlementMenu from './SettlementMenu.vue';
import { useWorldStore } from '../../stores/world';
import { useAuthStore } from '../../stores/auth';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import type { SettlementSummary, UserResponse } from '../../api/types';

const listMySettlements = vi.hoisted(() => vi.fn());

vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return { ...actual, DEMO_MODE: false };
});
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: { ...actual.api, listMySettlements } };
});

function summary(id: string, name: string): SettlementSummary {
  return { id, realmId: id, name, ownerName: 'Ulf', q: 0, r: 0, longhouseLevel: 1, islandId: 'i', mine: true } as SettlementSummary;
}

function mountMenu() {
  return mount(SettlementMenu, {
    props: { name: 'Bjornstad' },
    attachTo: document.body,
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
}

describe('SettlementMenu', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listMySettlements.mockReset().mockResolvedValue([]);
    const world = useWorldStore();
    world.worldId = 'w1';
    world.selectedSettlementId = 's1';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens on the chevron, with the menu semantics on the trigger', async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.find('.menu-trigger');
    expect(trigger.attributes('aria-haspopup')).toBe('menu');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);

    await trigger.trigger('click');

    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('[role="menu"]').exists()).toBe(true);
    expect(wrapper.findAll('[role="menuitem"]').map((i) => i.text())).toEqual(['Go to Bjornstad', 'Rename…']);
    wrapper.unmount();
  });

  it('"Go to" emits focus-home and closes; "Rename…" emits rename and closes', async () => {
    const wrapper = mountMenu();
    await wrapper.find('.menu-trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]')[0]!.trigger('click');
    expect(wrapper.emitted('focus-home')).toHaveLength(1);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);

    await wrapper.find('.menu-trigger').trigger('click');
    await wrapper.findAll('[role="menuitem"]')[1]!.trigger('click');
    expect(wrapper.emitted('rename')).toHaveLength(1);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('closes on Escape and on an outside click', async () => {
    const wrapper = mountMenu();
    await wrapper.find('.menu-trigger').trigger('click');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);

    await wrapper.find('.menu-trigger').trigger('click');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('asks an anonymous player for no realm list', async () => {
    const wrapper = mountMenu();
    await wrapper.find('.menu-trigger').trigger('click');
    await flushPromises();
    expect(listMySettlements).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  describe('signed in', () => {
    beforeEach(() => {
      useAuthStore().user = { id: 'u1', userName: 'ulf', role: 'player' } as unknown as UserResponse;
    });

    it('has no realms section with a single settlement', async () => {
      listMySettlements.mockResolvedValue([summary('s1', 'Bjornstad')]);
      const wrapper = mountMenu();
      await wrapper.find('.menu-trigger').trigger('click');
      await flushPromises();
      expect(listMySettlements).toHaveBeenCalledWith('w1');
      expect(wrapper.text()).not.toContain('Your realms');
      wrapper.unmount();
    });

    it('lists the realms with more than one, marks the current one and switches on a pick', async () => {
      listMySettlements.mockResolvedValue([summary('s1', 'Bjornstad'), summary('s2', 'Nyhavn')]);
      const world = useWorldStore();
      const switchTo = vi.spyOn(world, 'switchToSettlement').mockResolvedValue();
      const wrapper = mountMenu();
      await wrapper.find('.menu-trigger').trigger('click');
      await flushPromises();

      expect(wrapper.text()).toContain('Your realms');
      const realms = wrapper.findAll('.realm-row');
      expect(realms.map((r) => r.find('.realm-name').text())).toEqual(['Bjornstad', 'Nyhavn']);
      expect(realms[0]!.attributes('aria-current')).toBe('true');
      expect(realms[0]!.text()).toContain('Current');
      expect(realms[1]!.attributes('aria-current')).toBeUndefined();

      await realms[1]!.trigger('click');
      expect(switchTo).toHaveBeenCalledWith('s2');
      expect(wrapper.find('[role="menu"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('picking the current realm switches nothing', async () => {
      listMySettlements.mockResolvedValue([summary('s1', 'Bjornstad'), summary('s2', 'Nyhavn')]);
      const switchTo = vi.spyOn(useWorldStore(), 'switchToSettlement').mockResolvedValue();
      const wrapper = mountMenu();
      await wrapper.find('.menu-trigger').trigger('click');
      await flushPromises();
      await wrapper.findAll('.realm-row')[0]!.trigger('click');
      expect(switchTo).not.toHaveBeenCalled();
      wrapper.unmount();
    });
  });
});
