// @vitest-environment jsdom
//
// The dock: each panel sits in its column on its side, closed or empty panels are absent, columns have no height cap, the
// dock's collapse chevron clips a panel to its header, and dragging a panel's header drops it into the column group
// under it (a new column past the innermost one), with a bar showing where.
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import type { ref } from 'vue';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enQuests from '../../i18n/locales/en/quests.json';
import HudPanelDock from './HudPanelDock.vue';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { DEFAULT_HUD_PANELS, type HudPanelId } from '../../lib/hud/hudPanelDock';

const flags = vi.hoisted(() => ({ draft: undefined as unknown, content: undefined as unknown }));
vi.mock('../../composables/useHudPanelContent', async () => {
  const { ref } = await import('vue');
  flags.content = { construction: ref(true), garrison: ref(true), armies: ref(true), quests: ref(true) };
  flags.draft = ref(false);
  return { useHudPanelContent: () => flags.content, useHasActiveDraft: () => flags.draft };
});

const content = () => flags.content as Record<HudPanelId, ReturnType<typeof ref<boolean>>>;

// The panels are stand-ins with a header the dock can grab.
const stub = (id: string) => ({ template: `<div class="status-card" data-testid="stub-${id}"><div class="hdr" data-dock-handle><button class="ctl">x</button>${id}</div></div>` });
const stubs = {
  BuildQueuePanel: stub('construction'),
  TrainingQueuePanel: stub('garrison'),
  ArmyPanel: stub('armies'),
  QuestTray: stub('quests'),
};

let wrapper: VueWrapper;
function mountDock() {
  wrapper = mount(HudPanelDock, { attachTo: document.body, global: { stubs, plugins: [createTestI18n({ hud: enHud, quests: enQuests })] } });
  return wrapper;
}

const idsIn = (w: VueWrapper, group: string) =>
  w.findAll(`[data-testid="hud-dock-${group}"] [data-hud-panel]`).map((e) => e.attributes('data-hud-panel'));
const slot = (w: VueWrapper, id: string) => w.get(`[data-hud-panel="${id}"]`);
const store = () => useHudPrefsStore();

/**
 * The map area is 1000 x 800 at the origin. The left column 0 spans x 16..296, the right column 0 x 700..984, the right
 * column 1 (when it exists) 440..692; a slot is 200 x 100 at (50, 50) plus whatever drag transform it carries.
 */
function stubGeometry() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('hud-dock')) return new DOMRect(0, 0, 1000, 800);
    if (this.classList.contains('hud-dock__side')) return new DOMRect(this.dataset.testid === 'hud-dock-left' ? 16 : 700, 76, 284, 708);
    if (this.classList.contains('hud-dock__column')) {
      const left = this.dataset.side === 'left' ? 16 : this.dataset.column === '0' ? 700 : 440;
      return new DOMRect(left, 76, this.dataset.side === 'left' ? 280 : this.dataset.column === '0' ? 284 : 252, 708);
    }
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(this.style.transform);
    return new DOMRect(50 + (m ? Number(m[1]) : 0), 50 + (m ? Number(m[2]) : 0), 200, 100);
  });
}

function pointer(type: string, x: number, y: number, target: EventTarget = window) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }));
}

describe('HudPanelDock', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    for (const flag of Object.values(content())) flag.value = true;
    (flags.draft as ReturnType<typeof ref<boolean>>).value = false;
  });
  afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
  });

  it('places every panel in its default column on its side', () => {
    const w = mountDock();
    expect(idsIn(w, 'left-0')).toEqual(['construction', 'quests']);
    expect(idsIn(w, 'right-0')).toEqual(['garrison', 'armies']);
    expect(slot(w, 'construction').attributes()).toMatchObject({ 'data-side': 'left', 'data-column': '0', 'data-align': 'top' });
    expect(slot(w, 'quests').attributes()).toMatchObject({ 'data-side': 'left', 'data-column': '0', 'data-align': 'bottom' });
    expect(slot(w, 'armies').attributes()).toMatchObject({ 'data-side': 'right', 'data-align': 'bottom' });
  });

  it('renders one column per stored column and lets a column hold the full height without a cap', () => {
    store().movePanel('armies', { side: 'left', column: 1, align: 'top', before: null });
    const w = mountDock();
    expect(w.find('[data-testid="hud-dock-left-1"]').exists()).toBe(true);
    expect(idsIn(w, 'left-1')).toEqual(['armies']);
    expect(w.find('[data-testid="hud-dock-right-1"]').exists()).toBe(false);
    for (const el of (w.element as HTMLElement).querySelectorAll<HTMLElement>('.hud-dock__side, .hud-dock__column, .hud-dock__group, .hud-dock__slot')) {
      expect(el.style.maxHeight).toBe('');
    }
  });

  it('gives a column without a shown panel no width and no margin', async () => {
    const w = mountDock();
    store().movePanel('armies', { side: 'right', column: 1, align: 'top', before: null });
    store().togglePanel('armies');
    await w.vm.$nextTick();
    const empty = w.get('[data-testid="hud-dock-right-1"]');
    expect(empty.classes()).toContain('is-empty');
    expect((empty.element as HTMLElement).style.marginInlineStart).toBe('');
    expect((w.get('[data-testid="hud-dock-right-0"]').element as HTMLElement).style.marginInlineStart).toBe('8px');
  });

  it('shows a closed Armies panel while a dispatch is being composed, and only then', async () => {
    store().togglePanel('armies');
    const w = mountDock();
    expect(idsIn(w, 'right-0')).toEqual(['garrison']);
    (flags.draft as ReturnType<typeof ref<boolean>>).value = true;
    await w.vm.$nextTick();
    expect(idsIn(w, 'right-0')).toEqual(['garrison', 'armies']);
    expect(store().panels.armies.open).toBe(false);
  });

  it('stacks panels of one group by their stored order', () => {
    const prefs = store();
    prefs.movePanel('quests', { side: 'right', column: 0, align: 'top', before: 'garrison' });
    prefs.movePanel('armies', { side: 'right', column: 0, align: 'top', before: null });
    const w = mountDock();
    expect(idsIn(w, 'right-0')).toEqual(['quests', 'garrison', 'armies']);
    expect(idsIn(w, 'left-0')).toEqual(['construction']);
  });

  it('leaves out a closed panel and a panel with nothing to show', async () => {
    const w = mountDock();
    store().togglePanel('quests');
    content().garrison.value = false;
    await w.vm.$nextTick();
    expect(idsIn(w, 'left-0')).toEqual(['construction']);
    expect(idsIn(w, 'right-0')).toEqual(['armies']);
  });

  it('brings a closed panel back when its icon is pressed again', async () => {
    const w = mountDock();
    store().togglePanel('armies');
    await w.vm.$nextTick();
    expect(w.find('[data-testid="stub-armies"]').exists()).toBe(false);
    store().togglePanel('armies');
    await w.vm.$nextTick();
    expect(w.find('[data-testid="stub-armies"]').exists()).toBe(true);
  });

  describe('collapsing', () => {
    it('collapses a panel to its header from the dock\'s chevron and expands it again', async () => {
      const w = mountDock();
      const button = w.get('[data-testid="hud-panel-collapse-quests"]');
      expect(button.attributes('aria-expanded')).toBe('true');
      expect(button.attributes('aria-label')).toBe('Collapse Quests');
      await button.trigger('click');
      expect(store().panels.quests.collapsed).toBe(true);
      expect(slot(w, 'quests').classes()).toContain('is-collapsed');
      expect(slot(w, 'armies').classes()).not.toContain('is-collapsed');
      expect(button.attributes('aria-expanded')).toBe('false');
      expect(button.attributes('aria-label')).toBe('Expand Quests');
      expect(JSON.parse(localStorage.getItem('bjarnoy.hudPanels')!).quests.collapsed).toBe(true);
      await button.trigger('click');
      expect(slot(w, 'quests').classes()).not.toContain('is-collapsed');
    });

    it('restores a collapsed panel from storage', () => {
      store().toggleCollapsed('garrison');
      expect(slot(mountDock(), 'garrison').classes()).toContain('is-collapsed');
    });

    it('never collapses the Armies panel while a draft holds it open', async () => {
      store().toggleCollapsed('armies');
      const w = mountDock();
      expect(slot(w, 'armies').classes()).toContain('is-collapsed');
      (flags.draft as ReturnType<typeof ref<boolean>>).value = true;
      await w.vm.$nextTick();
      expect(slot(w, 'armies').classes()).not.toContain('is-collapsed');
      expect(w.get('[data-testid="hud-panel-collapse-armies"]').attributes('aria-expanded')).toBe('true');
      expect(store().panels.armies.collapsed).toBe(true);
    });

    it('does not start a drag from the chevron', async () => {
      stubGeometry();
      const w = mountDock();
      pointer('pointerdown', 100, 100, w.get('[data-testid="hud-panel-collapse-quests"]').element);
      pointer('pointermove', 600, 100);
      pointer('pointerup', 600, 100);
      await w.vm.$nextTick();
      expect(store().panels.quests).toMatchObject(DEFAULT_HUD_PANELS.quests);
    });
  });

  describe('dragging', () => {
    const header = (w: VueWrapper, id: string) => w.get(`[data-hud-panel="${id}"] .hdr`).element;

    it('drops a panel into the column under it and remembers it', async () => {
      stubGeometry();
      const w = mountDock();
      pointer('pointerdown', 100, 100, header(w, 'quests'));
      pointer('pointermove', 900, 100); // slot centre (850, 100): right side, top half, inside right column 0
      pointer('pointerup', 900, 100);
      await w.vm.$nextTick();
      expect(store().panels.quests).toMatchObject({ side: 'right', column: 0, align: 'top' });
      expect(idsIn(w, 'right-0')).toEqual(['garrison', 'quests', 'armies']);
      expect(JSON.parse(localStorage.getItem('bjarnoy.hudPanels')!).quests.side).toBe('right');
    });

    it('creates a new column when dropped past the innermost one', async () => {
      stubGeometry();
      const w = mountDock();
      pointer('pointerdown', 100, 100, header(w, 'quests'));
      pointer('pointermove', 600, 100); // slot centre (650, 100): right of the middle, left of right column 0
      pointer('pointerup', 600, 100);
      await w.vm.$nextTick();
      expect(store().panels.quests).toMatchObject({ side: 'right', column: 1, align: 'top' });
      expect(idsIn(w, 'right-1')).toEqual(['quests']);
    });

    it('bottom-aligns a panel dropped in the bottom half and puts it before the sibling below the centre', async () => {
      stubGeometry();
      const w = mountDock();
      pointer('pointerdown', 100, 100, header(w, 'construction'));
      pointer('pointermove', 100, 700); // slot centre (150, 700): left side, bottom half, inside left column 0
      pointer('pointerup', 100, 700);
      await w.vm.$nextTick();
      expect(store().panels.construction).toMatchObject({ side: 'left', column: 0, align: 'bottom', order: 0 });
      expect(store().panels.quests.order).toBe(1);
      expect(slot(w, 'construction').attributes('data-align')).toBe('bottom');
    });

    it('shows the drop bar while dragging, a vertical one for a new column, and clears it on drop', async () => {
      stubGeometry();
      const w = mountDock();
      expect(w.find('[data-testid="hud-dock-indicator"]').exists()).toBe(false);
      pointer('pointerdown', 100, 100, header(w, 'quests'));
      pointer('pointermove', 900, 100);
      await w.vm.$nextTick();
      const bar = w.get('[data-testid="hud-dock-indicator"]').element as HTMLElement;
      expect(bar.style.height).toBe('3px');
      expect(bar.style.width).toBe('284px');
      pointer('pointermove', 600, 100);
      await w.vm.$nextTick();
      const vertical = w.get('[data-testid="hud-dock-indicator"]').element as HTMLElement;
      expect(vertical.style.width).toBe('3px');
      expect(vertical.style.height).toBe('708px');
      pointer('pointerup', 600, 100);
      await w.vm.$nextTick();
      expect(w.find('[data-testid="hud-dock-indicator"]').exists()).toBe(false);
    });

    it('treats a press without movement as a click, not a drag', async () => {
      stubGeometry();
      const w = mountDock();
      pointer('pointerdown', 100, 100, header(w, 'quests'));
      pointer('pointermove', 102, 101);
      pointer('pointerup', 102, 101);
      await w.vm.$nextTick();
      expect(store().panels.quests).toMatchObject(DEFAULT_HUD_PANELS.quests);
      expect((slot(w, 'quests').element as HTMLElement).style.transform).toBe('');
    });

    it('settles a panel dropped back on its own spot without changing anything', async () => {
      stubGeometry();
      const w = mountDock();
      const before = JSON.stringify(store().panels);
      pointer('pointerdown', 100, 100, header(w, 'quests'));
      pointer('pointermove', 100, 700); // centre (150, 700): left column 0, bottom, below nothing else in the group
      pointer('pointerup', 100, 700);
      await w.vm.$nextTick();
      expect(JSON.stringify(store().panels)).toBe(before);
      expect((slot(w, 'quests').element as HTMLElement).style.transform).toBe('');
    });

    it('moves the panel with the pointer while dragging', () => {
      stubGeometry();
      const w = mountDock();
      pointer('pointerdown', 100, 100, header(w, 'armies'));
      pointer('pointermove', 130, 160);
      expect((slot(w, 'armies').element as HTMLElement).style.transform).toBe('translate(30px, 60px)');
      pointer('pointercancel', 130, 160);
    });

    it('puts the panel back on Escape and on pointercancel', async () => {
      stubGeometry();
      const w = mountDock();
      pointer('pointerdown', 100, 100, header(w, 'quests'));
      pointer('pointermove', 600, 100);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      pointer('pointerup', 600, 100);
      await w.vm.$nextTick();
      expect(store().panels.quests).toMatchObject(DEFAULT_HUD_PANELS.quests);
      expect(w.find('[data-testid="hud-dock-indicator"]').exists()).toBe(false);

      pointer('pointerdown', 100, 100, header(w, 'quests'));
      pointer('pointermove', 600, 100);
      pointer('pointercancel', 600, 100);
      await w.vm.$nextTick();
      expect(store().panels.quests).toMatchObject(DEFAULT_HUD_PANELS.quests);
      expect((slot(w, 'quests').element as HTMLElement).style.transform).toBe('');
    });

    it('does not start a drag from a control inside the header or from outside a header', async () => {
      stubGeometry();
      const w = mountDock();
      pointer('pointerdown', 100, 100, w.get('[data-hud-panel="quests"] .ctl').element);
      pointer('pointermove', 600, 100);
      pointer('pointerup', 600, 100);
      pointer('pointerdown', 100, 100, w.get('[data-hud-panel="armies"] .status-card').element);
      pointer('pointermove', 100, 600);
      pointer('pointerup', 100, 600);
      await w.vm.$nextTick();
      expect(store().panels.quests).toMatchObject(DEFAULT_HUD_PANELS.quests);
      expect(store().panels.armies).toMatchObject(DEFAULT_HUD_PANELS.armies);
    });
  });
});
