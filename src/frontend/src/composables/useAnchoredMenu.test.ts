// @vitest-environment jsdom
import { defineComponent, h, nextTick, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { barMenuHorizontal, useAnchoredMenu, type AnchoredMenu } from './useAnchoredMenu';
import { __resetPhoneLayersForTest, topPhoneLayerId, usePhoneLayer } from './usePhoneLayer';

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '',
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as MediaQueryList);
}

function rect(r: Partial<DOMRect>): DOMRect {
  return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...r } as DOMRect;
}

let mounted: ReturnType<typeof mount>[] = [];
let menu!: AnchoredMenu;

async function mountMenu(triggerRect: Partial<DOMRect>, width = 200, withRouter = false) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });
  const wrapper = mount(
    defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null);
        const trigger = ref<HTMLElement | null>(null);
        const panel = ref<HTMLElement | null>(null);
        menu = useAnchoredMenu({ trigger, root, panel, horizontal: barMenuHorizontal(width) });
        return () =>
          h('div', { ref: root }, [
            h('button', { ref: trigger, class: 'trigger', onClick: menu.toggle }),
            menu.open.value
              ? h('div', { ref: panel, class: 'panel', role: 'menu' }, [
                  h('button', { role: 'menuitem', class: 'a' }),
                  h('button', { role: 'menuitem', class: 'b' }),
                ])
              : null,
          ]);
      },
    }),
    { attachTo: document.body, global: { plugins: withRouter ? [router] : [] } },
  );
  mounted.push(wrapper);
  if (withRouter) {
    await router.push('/a');
    await router.isReady();
  }
  const trigger = wrapper.find('.trigger').element as HTMLElement;
  trigger.getBoundingClientRect = () => rect(triggerRect);
  return { wrapper, router };
}

describe('useAnchoredMenu', () => {
  beforeEach(() => {
    stubMatchMedia(false);
    window.innerWidth = 1280;
    window.innerHeight = 800;
  });
  afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount());
    __resetPhoneLayersForTest();
  });

  it('opens below an anchor in the upper half, right-aligned to the trigger on desktop', async () => {
    const { wrapper } = await mountMenu({ top: 10, bottom: 40, left: 1200, right: 1230 }, 300);
    await wrapper.find('.trigger').trigger('click');
    expect(menu.side.value).toBe('below');
    expect(menu.style.value).toEqual({ top: '48px', left: '930px', width: '300px' });
  });

  it('opens above an anchor in the lower half', async () => {
    const { wrapper } = await mountMenu({ top: 700, bottom: 730, left: 100, right: 130 });
    await wrapper.find('.trigger').trigger('click');
    expect(menu.side.value).toBe('above');
    expect(menu.style.value.bottom).toBe('108px');
    expect(menu.style.value.top).toBeUndefined();
  });

  it('keeps the desktop panel inside the 16px gutter', async () => {
    const { wrapper } = await mountMenu({ top: 10, bottom: 40, left: 30, right: 60 }, 300);
    await wrapper.find('.trigger').trigger('click');
    expect(menu.style.value.left).toBe('16px');
  });

  it('spans the screen between 16px gutters on a phone', async () => {
    stubMatchMedia(true);
    const { wrapper } = await mountMenu({ top: 10, bottom: 40, left: 300, right: 330 });
    await wrapper.find('.trigger').trigger('click');
    expect(menu.style.value).toEqual({ top: '48px', left: '16px', right: '16px' });
  });

  it('is a phone layer while open and only then', async () => {
    const { wrapper } = await mountMenu({ top: 10, bottom: 40, left: 0, right: 30 });
    expect(topPhoneLayerId.value).toBeNull();
    const probe = usePhoneLayerProbe();
    await wrapper.find('.trigger').trigger('click');
    expect(probe()).toBe(true);
    await wrapper.find('.trigger').trigger('click');
    expect(probe()).toBe(false);
  });

  it('stays open on a tap inside the panel, closes on a tap outside', async () => {
    const { wrapper } = await mountMenu({ top: 10, bottom: 40, left: 0, right: 30 });
    await wrapper.find('.trigger').trigger('click');
    await flushPromises();
    document.querySelector('.panel')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.open.value).toBe(true);
    wrapper.find('.trigger').element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.open.value).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.open.value).toBe(false);
  });

  it('focuses the first item, moves with the arrow keys, and closes on Escape returning focus', async () => {
    const { wrapper } = await mountMenu({ top: 10, bottom: 40, left: 0, right: 30 });
    await wrapper.find('.trigger').trigger('click');
    await flushPromises();
    expect(document.activeElement?.className).toBe('a');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.className).toBe('b');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.className).toBe('a');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement?.className).toBe('b');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(menu.open.value).toBe(false);
    expect(document.activeElement).toBe(wrapper.find('.trigger').element);
  });

  it('closes on a route change', async () => {
    const { wrapper, router } = await mountMenu({ top: 10, bottom: 40, left: 0, right: 30 }, 200, true);
    await wrapper.find('.trigger').trigger('click');
    expect(menu.open.value).toBe(true);
    await router.push('/b');
    expect(menu.open.value).toBe(false);
  });

  it('removes its document listeners on unmount', async () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { wrapper } = await mountMenu({ top: 10, bottom: 40, left: 0, right: 30 });
    await wrapper.find('.trigger').trigger('click');
    wrapper.unmount();
    mounted = [];
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
    remove.mockRestore();
  });
});

/** Whether any layer is registered: a second layer's `hidden` is true while one is open on a phone. */
function usePhoneLayerProbe() {
  stubMatchMedia(true);
  let hidden!: { value: boolean };
  mounted.push(
    mount(
      defineComponent({
        setup() {
          hidden = usePhoneLayer(false).hidden;
          return () => h('div');
        },
      }),
    ),
  );
  return () => hidden.value;
}
