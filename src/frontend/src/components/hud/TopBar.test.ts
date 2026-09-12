// @vitest-environment jsdom
//
// TopBar started as the settlement/world-map overlay, deriving its title and
// caption from the world store and floating over the map canvas. The docs
// pages reuse the same chrome without either: they name the bar themselves
// and sit in a scrolling document. These tests pin both shapes, so the
// map-overlay defaults can't drift while the docked variant is worked on.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import TopBar from './TopBar.vue';
import { useWorldStore } from '../../stores/world';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';

function mountTopBar(props: InstanceType<typeof TopBar>['$props'] = {}) {
  return mount(TopBar, {
    props,
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
}

// @vue/test-utils' `.trigger()` assigns extra props onto a plain MouseEvent
// after construction, but `clientY` is a getter-only property on real
// PointerEvent/MouseEvent instances in jsdom — so it has to be supplied via
// the constructor's init dict instead, dispatched directly on the element.
function firePointer(wrapper: ReturnType<typeof mount>, el: Element, type: string, clientY: number) {
  el.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true }));
  return wrapper.vm.$nextTick();
}

describe('TopBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders nothing but the logo when there is no settlement and no title', () => {
    const wrapper = mountTopBar();

    expect(wrapper.find('.titles').exists()).toBe(false);
    expect(wrapper.find('.logo-hex').exists()).toBe(true);
    wrapper.unmount();
  });

  it('names the settlement and its island/longhouse caption from the world store', () => {
    const world = useWorldStore();
    world.hud.settlementName = 'Unnamed realm';
    world.hud.level = 4;

    const wrapper = mountTopBar();

    expect(wrapper.get('.name').text()).toBe('Unnamed realm');
    expect(wrapper.get('.caption').text()).toBe('LONGHOUSE 4');
    wrapper.unmount();
  });

  it('lets a caller name the bar, overriding the settlement', () => {
    const world = useWorldStore();
    world.hud.settlementName = 'Unnamed realm';

    const wrapper = mountTopBar({ title: 'Tech tree', caption: 'DOCS · DEPENDENCIES' });

    expect(wrapper.get('.name').text()).toBe('Tech tree');
    expect(wrapper.get('.caption').text()).toBe('DOCS · DEPENDENCIES');
    wrapper.unmount();
  });

  it('shows no longhouse caption for a titled bar that asked for none', () => {
    const world = useWorldStore();
    world.hud.level = 7;

    const wrapper = mountTopBar({ title: 'Docs' });

    expect(wrapper.get('.name').text()).toBe('Docs');
    expect(wrapper.find('.caption').exists()).toBe(false);
    wrapper.unmount();
  });

  it('is a floating map overlay by default and a docked page header on request', () => {
    const floating = mountTopBar();
    expect(floating.get('.hud-bar').classes()).not.toContain('hud-bar--docked');
    floating.unmount();

    const docked = mountTopBar({ docked: true });
    expect(docked.get('.hud-bar').classes()).toContain('hud-bar--docked');
    docked.unmount();
  });

  it('pins to the bottom edge when position is "bottom", but never for a docked header', () => {
    const top = mountTopBar({ position: 'top' });
    expect(top.get('.hud-bar').classes()).not.toContain('hud-bar--bottom');
    top.unmount();

    const bottom = mountTopBar({ position: 'bottom' });
    expect(bottom.get('.hud-bar').classes()).toContain('hud-bar--bottom');
    bottom.unmount();

    const dockedBottom = mountTopBar({ position: 'bottom', docked: true });
    expect(dockedBottom.get('.hud-bar').classes()).not.toContain('hud-bar--bottom');
    dockedBottom.unmount();
  });

  it('shows no drag handle or expanded panel unless draggable is set', () => {
    const wrapper = mountTopBar();

    expect(wrapper.find('.drag-handle').exists()).toBe(false);
    expect(wrapper.find('.hud-expanded').exists()).toBe(false);
    wrapper.unmount();
  });

  it('starts collapsed, and a tap on the handle expands then re-collapses it', async () => {
    const wrapper = mountTopBar({ draggable: true });

    const handle = wrapper.get('.drag-handle');
    expect(handle.attributes('aria-expanded')).toBe('false');
    expect(wrapper.get('.hud-expanded').classes()).not.toContain('hud-expanded--open');

    await firePointer(wrapper, handle.element, 'pointerdown', 100);
    await firePointer(wrapper, handle.element, 'pointermove', 102);
    await firePointer(wrapper, handle.element, 'pointerup', 102);

    expect(handle.attributes('aria-expanded')).toBe('true');
    expect(wrapper.get('.hud-expanded').classes()).toContain('hud-expanded--open');

    await firePointer(wrapper, handle.element, 'pointerdown', 100);
    await firePointer(wrapper, handle.element, 'pointermove', 98);
    await firePointer(wrapper, handle.element, 'pointerup', 98);

    expect(handle.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('renders whatever the caller puts in the expanded slot', async () => {
    const wrapper = mount(TopBar, {
      props: { draggable: true },
      slots: { expanded: '<div class="my-summary">summary</div>' },
      global: { plugins: [createTestI18n({ hud: enHud })] },
    });

    expect(wrapper.find('.my-summary').exists()).toBe(true);
    wrapper.unmount();
  });

  it('inverts the drag direction for a bottom-pinned bar: dragging up expands it', async () => {
    const wrapper = mountTopBar({ draggable: true, position: 'bottom' });
    const handle = wrapper.get('.drag-handle');
    expect(handle.classes()).toContain('drag-handle--bottom');

    await firePointer(wrapper, handle.element, 'pointerdown', 160);
    await firePointer(wrapper, handle.element, 'pointermove', 100);
    await firePointer(wrapper, handle.element, 'pointerup', 100);

    expect(wrapper.get('.hud-expanded').classes()).toContain('hud-expanded--bottom');
    expect(wrapper.get('.hud-expanded').classes()).toContain('hud-expanded--open');
    wrapper.unmount();
  });
});
