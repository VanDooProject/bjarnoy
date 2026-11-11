// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SettlementMenu from './SettlementMenu.vue';
import { useWorldStore } from '../../stores/world';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import type { SettlementSummary } from '../../api/types';

const mounted: { unmount: () => void }[] = [];

function summary(id: string, name: string, q: number, longhouseLevel: number, isBeachCamp = false): SettlementSummary {
  return { id, realmId: id, name, ownerName: 'Ulf', q, r: 0, longhouseLevel, islandId: 'i', mine: true, isBeachCamp } as SettlementSummary;
}

function mountMenu() {
  const wrapper = mount(SettlementMenu, {
    props: { name: 'Bjornstad' },
    attachTo: document.body,
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
  mounted.push(wrapper);
  return wrapper;
}

const body = (selector: string) => document.body.querySelector<HTMLElement>(selector);
const bodyAll = (selector: string) => [...document.body.querySelectorAll<HTMLElement>(selector)];

async function openMenu(wrapper: ReturnType<typeof mountMenu>) {
  await wrapper.find('.menu-trigger').trigger('click');
  await flushPromises();
}

describe('SettlementMenu', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const world = useWorldStore();
    world.worldId = 'w1';
    world.selectedSettlementId = 's1';
    world.hud.level = 3;
  });
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount());
  });

  it('opens on the arrow, with the menu semantics on the trigger', async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.find('.menu-trigger');
    expect(trigger.attributes('aria-haspopup')).toBe('menu');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(body('[role="menu"]')).toBeNull();
    await openMenu(wrapper);
    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(body('[role="menu"]')).not.toBeNull();
  });

  it('with one realm shows no list heading, only that realm with Go to and Rename', async () => {
    const wrapper = mountMenu();
    await openMenu(wrapper);
    expect(body('.section-title')).toBeNull();
    const rows = bodyAll('.realm-line');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.querySelector('.realm-name')!.textContent).toBe('Bjornstad');
    expect(rows[0]!.querySelector('.realm-caption')!.textContent).toBe('Longhouse 3');
    expect(rows[0]!.querySelector('[data-action="go-to"]')!.getAttribute('aria-label')).toBe('Go to Bjornstad');
    expect(rows[0]!.querySelector('[data-action="rename"]')!.getAttribute('aria-label')).toBe('Rename…');
  });

  it('Go to emits focus-home and closes; Rename emits rename and closes', async () => {
    const wrapper = mountMenu();
    await openMenu(wrapper);
    body('[data-action="go-to"]')!.click();
    await flushPromises();
    expect(wrapper.emitted('focus-home')).toHaveLength(1);
    expect(body('[role="menu"]')).toBeNull();

    await openMenu(wrapper);
    body('[data-action="rename"]')!.click();
    await flushPromises();
    expect(wrapper.emitted('rename')).toHaveLength(1);
    expect(body('[role="menu"]')).toBeNull();
  });

  it('closes on Escape, on an outside tap, and keeps open on a tap inside the teleported menu', async () => {
    const wrapper = mountMenu();
    await openMenu(wrapper);
    body('.menu')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(body('[role="menu"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(body('[role="menu"]')).toBeNull();

    await openMenu(wrapper);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(body('[role="menu"]')).toBeNull();
  });

  describe('with several realms', () => {
    beforeEach(() => {
      useWorldStore().myRealms = [summary('s1', 'Bjornstad', 0, 3), summary('s2', 'Nyhavn', 7, 2)];
    });

    it('lists the realms under a heading and marks the current one', async () => {
      const wrapper = mountMenu();
      await openMenu(wrapper);
      expect(body('.section-title')!.textContent).toBe('Your realms');
      const rows = bodyAll('.realm-line');
      expect(rows.map((r) => r.querySelector('.realm-name')!.textContent)).toEqual(['Bjornstad', 'Nyhavn']);
      expect(rows[0]!.classList.contains('current')).toBe(true);
      expect(rows[0]!.querySelector('.realm-pick')!.getAttribute('aria-current')).toBe('true');
      expect(rows[1]!.classList.contains('current')).toBe(false);
      expect(rows[1]!.querySelector('.realm-caption')!.textContent).toBe('Longhouse 2');
    });

    it('names a beach camp by its building name instead of a Longhouse level', async () => {
      useWorldStore().myRealms = [summary('s1', 'Bjornstad', 0, 3), summary('s2', 'Sandspit', 7, 1, true)];
      const wrapper = mountMenu();
      await openMenu(wrapper);
      const rows = bodyAll('.realm-line');
      expect(rows[0]!.querySelector('.realm-caption')!.textContent).toBe('Longhouse 3');
      expect(rows[1]!.querySelector('.realm-caption')!.textContent).toBe('Beach camp');
    });

    it('a click on another realm switches to it, centres on it and closes', async () => {
      const switchTo = vi.spyOn(useWorldStore(), 'switchToSettlement').mockResolvedValue();
      const wrapper = mountMenu();
      await openMenu(wrapper);
      bodyAll('.realm-pick')[1]!.click();
      await flushPromises();
      expect(switchTo).toHaveBeenCalledWith('s2');
      expect(wrapper.emitted('focus-home')).toHaveLength(1);
      expect(body('[role="menu"]')).toBeNull();
    });

    it('a click on the current realm only closes', async () => {
      const switchTo = vi.spyOn(useWorldStore(), 'switchToSettlement').mockResolvedValue();
      const wrapper = mountMenu();
      await openMenu(wrapper);
      bodyAll('.realm-pick')[0]!.click();
      await flushPromises();
      expect(switchTo).not.toHaveBeenCalled();
      expect(wrapper.emitted('focus-home')).toBeUndefined();
      expect(body('[role="menu"]')).toBeNull();
    });

    it('Go to on another realm pans to its longhouse without switching', async () => {
      const switchTo = vi.spyOn(useWorldStore(), 'switchToSettlement').mockResolvedValue();
      const wrapper = mountMenu();
      await openMenu(wrapper);
      bodyAll('.realm-line')[1]!.querySelector<HTMLElement>('[data-action="go-to"]')!.click();
      await flushPromises();
      expect(switchTo).not.toHaveBeenCalled();
      expect(wrapper.emitted('focus-realm')).toEqual([[{ q: 7, r: 0 }]]);
      expect(wrapper.emitted('focus-home')).toBeUndefined();
    });

    it('Rename on another realm switches to it first, then asks for the rename', async () => {
      const wrapper = mountMenu();
      let renameEmittedDuringSwitch: boolean | null = null;
      const switchTo = vi.spyOn(useWorldStore(), 'switchToSettlement').mockImplementation(async () => {
        renameEmittedDuringSwitch = !!wrapper.emitted('rename');
      });
      await openMenu(wrapper);
      bodyAll('.realm-line')[1]!.querySelector<HTMLElement>('[data-action="rename"]')!.click();
      await flushPromises();
      expect(switchTo).toHaveBeenCalledWith('s2');
      expect(renameEmittedDuringSwitch).toBe(false);
      expect(wrapper.emitted('rename')).toHaveLength(1);
    });
  });
});
