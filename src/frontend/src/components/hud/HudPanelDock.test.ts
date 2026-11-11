// @vitest-environment jsdom
//
// The dock: each panel sits in its corner's region, collapsed or empty panels are absent, several panels in one corner stack
// in the fixed order, and dragging a panel's header snaps it to the corner of the quadrant it is dropped in.
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import type { ref } from 'vue';
import HudPanelDock from './HudPanelDock.vue';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import type { HudPanelId } from '../../lib/hud/hudPanelDock';

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
  wrapper = mount(HudPanelDock, { attachTo: document.body, global: { stubs } });
  return wrapper;
}

const idsIn = (w: VueWrapper, corner: string) =>
  w.findAll(`[data-testid="hud-dock-${corner}"] [data-hud-panel]`).map((e) => e.attributes('data-hud-panel'));

/** The map area is 1000 x 800 at the origin; a slot is 200 x 100, at (50, 50) plus whatever drag transform it carries. */
function stubGeometry() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('hud-dock')) return new DOMRect(0, 0, 1000, 800);
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

  it('places every panel in its default corner', () => {
    const w = mountDock();
    expect(idsIn(w, 'top-left')).toEqual(['construction']);
    expect(idsIn(w, 'top-right')).toEqual(['garrison']);
    expect(idsIn(w, 'bottom-right')).toEqual(['armies']);
    expect(idsIn(w, 'bottom-left')).toEqual(['quests']);
  });

  it('shows a collapsed Armies panel while a dispatch is being composed, and only then', async () => {
    useHudPrefsStore().togglePanel('armies');
    const w = mountDock();
    expect(idsIn(w, 'bottom-right')).toEqual([]);
    (flags.draft as ReturnType<typeof ref<boolean>>).value = true;
    await w.vm.$nextTick();
    expect(idsIn(w, 'bottom-right')).toEqual(['armies']);
    expect(useHudPrefsStore().panels.armies.open).toBe(false);
  });

  it('puts a panel in the corner the player chose, and stacks panels of one corner in the fixed order', () => {
    const prefs = useHudPrefsStore();
    prefs.setPanelCorner('quests', 'top-right');
    prefs.setPanelCorner('armies', 'top-right');
    const w = mountDock();
    expect(idsIn(w, 'top-right')).toEqual(['garrison', 'armies', 'quests']);
    expect(idsIn(w, 'bottom-left')).toEqual([]);
    expect(idsIn(w, 'bottom-right')).toEqual([]);
  });

  it('leaves out a collapsed panel and a panel with nothing to show', async () => {
    const w = mountDock();
    useHudPrefsStore().togglePanel('quests');
    content().garrison.value = false;
    await w.vm.$nextTick();
    expect(idsIn(w, 'bottom-left')).toEqual([]);
    expect(idsIn(w, 'top-right')).toEqual([]);
    expect(idsIn(w, 'top-left')).toEqual(['construction']);
  });

  it('keeps a collapsed panel out when its icon is pressed again and brings it back', async () => {
    const w = mountDock();
    const prefs = useHudPrefsStore();
    prefs.togglePanel('armies');
    await w.vm.$nextTick();
    expect(w.find('[data-testid="stub-armies"]').exists()).toBe(false);
    prefs.togglePanel('armies');
    await w.vm.$nextTick();
    expect(w.find('[data-testid="stub-armies"]').exists()).toBe(true);
  });

  describe('dragging', () => {
    const header = (w: VueWrapper, id: string) => w.get(`[data-hud-panel="${id}"] .hdr`).element;

    it('snaps a panel dropped in the top-right quadrant to the top-right corner and remembers it', async () => {
      stubGeometry();
      const w = mountDock();
      const el = header(w, 'quests');
      pointer('pointerdown', 100, 100, el);
      pointer('pointermove', 600, 100);
      pointer('pointerup', 600, 100);
      await w.vm.$nextTick();
      expect(useHudPrefsStore().panels.quests.corner).toBe('top-right');
      expect(idsIn(w, 'top-right')).toEqual(['garrison', 'quests']);
      expect(JSON.parse(localStorage.getItem('bjarnoy.hudPanels')!).quests.corner).toBe('top-right');
    });

    it('treats a press without movement as a click, not a drag', async () => {
      stubGeometry();
      const w = mountDock();
      pointer('pointerdown', 100, 100, header(w, 'quests'));
      pointer('pointermove', 102, 101);
      pointer('pointerup', 102, 101);
      await w.vm.$nextTick();
      expect(useHudPrefsStore().panels.quests.corner).toBe('bottom-left');
      expect((w.get('[data-hud-panel="quests"]').element as HTMLElement).style.transform).toBe('');
    });

    it('moves the panel with the pointer while dragging', () => {
      stubGeometry();
      const w = mountDock();
      pointer('pointerdown', 100, 100, header(w, 'armies'));
      pointer('pointermove', 130, 160);
      const slot = w.get('[data-hud-panel="armies"]').element as HTMLElement;
      expect(slot.style.transform).toBe('translate(30px, 60px)');
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
      expect(useHudPrefsStore().panels.quests.corner).toBe('bottom-left');

      pointer('pointerdown', 100, 100, header(w, 'quests'));
      pointer('pointermove', 600, 100);
      pointer('pointercancel', 600, 100);
      await w.vm.$nextTick();
      expect(useHudPrefsStore().panels.quests.corner).toBe('bottom-left');
      expect((w.get('[data-hud-panel="quests"]').element as HTMLElement).style.transform).toBe('');
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
      expect(useHudPrefsStore().panels.quests.corner).toBe('bottom-left');
      expect(useHudPrefsStore().panels.armies.corner).toBe('bottom-right');
    });
  });
});
