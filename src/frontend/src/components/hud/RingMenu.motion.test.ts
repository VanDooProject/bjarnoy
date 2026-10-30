// @vitest-environment jsdom
//
// The ring's choreography as the component drives it (lib/map/ringMotion.ts
// has the per-animation timings): layer swaps wait for the out-animation, a
// blocked click shakes instead of committing, the press precedes going back,
// the glow marks only a buildable bubble whose card is up, and — wrapped in
// a <Transition> with the leave hook MapView uses — the ring stays in the DOM
// until its retract has finished.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref, Transition } from 'vue';
import { mount } from '@vue/test-utils';
import RingMenu, { type RingCategory } from './RingMenu.vue';
import { createTestI18n } from '../../test/i18n';
import { installWaapi } from '../../test/waapi';
import enHud from '../../i18n/locales/en/hud.json';
import { computeAvailability } from '../../lib/map/ringAvailability';
import { HUB_OUT_MS, PULL_MS, retractRing } from '../../lib/map/ringMotion';

const available = { wood: 1000, stone: 1000, food: 1000, iron: 1000 };
const CATEGORIES: RingCategory[] = [
  {
    id: 'housing',
    label: 'Housing',
    color: 'var(--gold)',
    buildings: [
      {
        id: 'hut',
        label: 'Hut',
        cost: { wood: 100 },
        time: '4:00',
        availability: computeAvailability({
          cost: { wood: 100 },
          available,
          slotsNeeded: 1,
          construction: { slots: 3, slotsUsed: 0, maxWaitingOrders: 0, waitingOrders: 0 },
          queue: [],
          locked: false,
        }),
      },
      { id: 'tower', label: 'Watchtower', cost: { wood: 100 }, time: '8:00', lock: 'Requires longhouse 2' },
    ],
  },
];

const mountOptions = {
  props: {
    x: 400,
    y: 300,
    actions: [
      { id: 'details', label: 'Details' },
      { id: 'raze', label: 'Raze', disabled: true, hint: 'Not wired yet' },
      { id: 'build', label: 'Build' },
    ],
    categories: CATEGORIES,
    terrainLabel: 'Grassland',
    coordLabel: 'HEX 4, -2',
    bounds: { left: 16, top: 76, right: 1264, bottom: 704 },
    cardBounds: { left: 16, top: 76, right: 1264, bottom: 704 },
    stock: available,
  },
  global: { plugins: [createTestI18n({ hud: enHud })] },
  attachTo: document.body,
};

function bubble(wrapper: ReturnType<typeof mount>, label: string) {
  const found = wrapper.findAll('.ring-bubble').find((b) => b.text() === label);
  if (!found) throw new Error(`no bubble "${label}": ${JSON.stringify(wrapper.findAll('.ring-bubble').map((b) => b.text()))}`);
  return found;
}
const labels = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('.ring-bubble').map((b) => b.text());

let waapi: ReturnType<typeof installWaapi>;

describe('RingMenu motion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    waapi = installWaapi();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    waapi.uninstall();
  });

  it('opens with the hub growing and the bubbles blooming', () => {
    const wrapper = mount(RingMenu, mountOptions);
    expect(waapi.on('.ring-hub')).toHaveLength(1);
    expect(waapi.on('.ring-bubble').length).toBe(3);
    wrapper.unmount();
  });

  describe('layer swap', () => {
    it('keeps the root bubbles until they have been pulled into the hub, then blooms the categories', async () => {
      const wrapper = mount(RingMenu, mountOptions);
      await vi.advanceTimersByTimeAsync(2000);
      waapi.calls.length = 0;

      void bubble(wrapper, 'Build').trigger('click');
      await nextTick();
      // Still the root: the swap waits for the out-animation.
      expect(labels(wrapper)).toEqual(['Details', 'Raze', 'Build']);
      expect(waapi.on('.ring-bubble')).toHaveLength(3);
      expect(waapi.on('.ring-bubble')[0].options).toMatchObject({ duration: 170, easing: 'ease-in' });

      await vi.advanceTimersByTimeAsync(PULL_MS + 2 * 12);
      expect(labels(wrapper)).toEqual(['Housing', '‹ BACK']);
      expect(wrapper.get('.ring-hub').text()).toContain('BUILD');
      // …and the categories bloom out of the hub.
      expect(waapi.on('.ring-bubble').filter((c) => c.options.duration === 240)).toHaveLength(2);
      wrapper.unmount();
    });

    it('under reduced motion still swaps layers through short opacity fades, never movement', async () => {
      waapi.uninstall();
      waapi = installWaapi(true);
      vi.useFakeTimers();
      const wrapper = mount(RingMenu, mountOptions);
      // The open itself fades the hub and bubbles in.
      expect(waapi.on('.ring-bubble')).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(2000);
      waapi.calls.length = 0;

      void bubble(wrapper, 'Build').trigger('click');
      await nextTick();
      // The departing root bubbles fade out first and the swap waits for that.
      expect(labels(wrapper)).toEqual(['Details', 'Raze', 'Build']);
      expect(waapi.on('.ring-bubble')).toHaveLength(3);
      expect(waapi.on('.ring-bubble')[0].frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);

      await vi.advanceTimersByTimeAsync(200);
      expect(labels(wrapper)).toEqual(['Housing', '‹ BACK']);
      // The categories fade in rather than bloom.
      const arriving = waapi.on('.ring-bubble').filter((c) => c.frames[0] && 'opacity' in c.frames[0] && c.frames[0].opacity === 0);
      expect(arriving.length).toBeGreaterThanOrEqual(2);
      for (const call of waapi.calls) expect(call.frames.every((f) => !('transform' in f))).toBe(true);
      wrapper.unmount();
    });

    it('ignores a second navigation click while a swap is running', async () => {
      const wrapper = mount(RingMenu, mountOptions);
      await vi.advanceTimersByTimeAsync(2000);
      void bubble(wrapper, 'Build').trigger('click');
      await nextTick();
      await bubble(wrapper, 'Details').trigger('click');
      expect(wrapper.emitted('select')).toBeUndefined();
      await vi.advanceTimersByTimeAsync(2000);
      wrapper.unmount();
    });

    // The touch e2e drill-downs flaked on exactly this: a tap on a category that had just appeared, while the
    // categories were still fading in, was dropped - nothing opened. The arriving layer is the one the player
    // meant to reach, so the tap is held and runs once the swap has landed.
    for (const reduced of [false, true]) {
      it(`opens a category tapped while it is still arriving, once the swap lands${reduced ? ' (reduced motion)' : ''}`, async () => {
        if (reduced) {
          waapi.uninstall();
          waapi = installWaapi(true);
          vi.useFakeTimers();
        }
        const wrapper = mount(RingMenu, mountOptions);
        await vi.advanceTimersByTimeAsync(2000);
        void bubble(wrapper, 'Build').trigger('click');
        // Past the old layer's exit, inside the categories' entrance.
        await vi.advanceTimersByTimeAsync(PULL_MS + 2 * 12 + 1);
        expect(labels(wrapper)).toEqual(['Housing', '‹ BACK']);
        expect(wrapper.get('.ring-backdrop').attributes('data-swapping')).toBeDefined();

        await bubble(wrapper, 'Housing').trigger('click');
        await vi.advanceTimersByTimeAsync(2000);
        expect(labels(wrapper)).toContain('Hut');
        expect(wrapper.get('.ring-backdrop').attributes('data-swapping')).toBeUndefined();
        wrapper.unmount();
      });
    }

    it('opens a category with its links drawing out and its buildings blooming out of the category bubble', async () => {
      const wrapper = mount(RingMenu, mountOptions);
      await vi.advanceTimersByTimeAsync(2000);
      void bubble(wrapper, 'Build').trigger('click');
      await vi.advanceTimersByTimeAsync(2000);
      waapi.calls.length = 0;
      void bubble(wrapper, 'Housing').trigger('click');
      await vi.advanceTimersByTimeAsync(0);
      await nextTick();
      expect(labels(wrapper)).toContain('Hut');
      const links = waapi.on('.ring-link');
      expect(links).toHaveLength(2);
      expect(String(links[0].frames[0].transform)).toContain('scaleX(0)');
      expect(links[0].options.duration).toBe(220);
      expect(waapi.on('.ring-bubble.child')).toHaveLength(2);
      wrapper.unmount();
    });

    it('goes back from a category by pulling its buildings into the category before removing them', async () => {
      const wrapper = mount(RingMenu, mountOptions);
      await vi.advanceTimersByTimeAsync(2000);
      void bubble(wrapper, 'Build').trigger('click');
      await vi.advanceTimersByTimeAsync(2000);
      void bubble(wrapper, 'Housing').trigger('click');
      await vi.advanceTimersByTimeAsync(2000);
      expect(labels(wrapper)).toContain('Hut');
      waapi.calls.length = 0;

      void bubble(wrapper, '‹ BACK').trigger('click');
      // First the squish (220 ms), then the buildings are pulled in (150 ms).
      await vi.advanceTimersByTimeAsync(220);
      await nextTick();
      expect(waapi.on('.ring-bubble.child').some((c) => c.options.duration === 150)).toBe(true);
      expect(labels(wrapper)).toContain('Hut');
      await vi.advanceTimersByTimeAsync(150 + 12);
      expect(labels(wrapper)).not.toContain('Hut');
      wrapper.unmount();
    });
  });

  describe('press (X11)', () => {
    it('squishes the hub before going back, but closes from the root at once', async () => {
      const wrapper = mount(RingMenu, mountOptions);
      await vi.advanceTimersByTimeAsync(2000);
      await wrapper.get('.ring-hub').trigger('click');
      expect(wrapper.emitted('close')).toHaveLength(1);

      void bubble(wrapper, 'Build').trigger('click');
      await vi.advanceTimersByTimeAsync(2000);
      waapi.calls.length = 0;
      void wrapper.get('.ring-hub').trigger('click');
      await nextTick();
      const press = waapi.on('.ring-hub')[0];
      expect(press.frames.map((f) => f.transform)).toEqual(['none', 'scale(.9)', 'scale(1.04)', 'none']);
      expect(press.options.duration).toBe(220);
      // Still in the build layer until the squish has played.
      expect(labels(wrapper)).toContain('Housing');
      await vi.advanceTimersByTimeAsync(220 + 170 + 12);
      expect(labels(wrapper)).toContain('Details');
      wrapper.unmount();
    });
  });

  describe('blocked clicks (X1)', () => {
    async function openHousing() {
      const wrapper = mount(RingMenu, mountOptions);
      await vi.advanceTimersByTimeAsync(2000);
      void bubble(wrapper, 'Build').trigger('click');
      await vi.advanceTimersByTimeAsync(2000);
      void bubble(wrapper, 'Housing').trigger('click');
      await vi.advanceTimersByTimeAsync(2000);
      waapi.calls.length = 0;
      return wrapper;
    }

    it('shakes a locked building and flashes its reason instead of committing', async () => {
      const wrapper = await openHousing();
      await bubble(wrapper, 'Watchtower').trigger('mouseenter');
      await bubble(wrapper, 'Watchtower').trigger('click');
      expect(wrapper.emitted('select')).toBeUndefined();
      const shake = waapi.on('.ring-bubble.child').find((c) => c.frames.some((f) => f.translate));
      expect(shake?.options.duration).toBe(280);
      expect(waapi.on('[data-testid="ring-card-status"]')[0].frames[0]).toMatchObject({ background: 'rgba(240,166,74,.35)' });
      wrapper.unmount();
    });

    it('also shakes a blocked root action', async () => {
      const wrapper = mount(RingMenu, mountOptions);
      await vi.advanceTimersByTimeAsync(2000);
      waapi.calls.length = 0;
      await bubble(wrapper, 'Raze').trigger('click');
      expect(wrapper.emitted('select')).toBeUndefined();
      expect(waapi.on('.ring-bubble').some((c) => c.frames.some((f) => f.translate))).toBe(true);
      wrapper.unmount();
    });

    it('a buildable building does not shake: it is marked as the one dropping, and select is emitted', async () => {
      const wrapper = await openHousing();
      await bubble(wrapper, 'Hut').trigger('click');
      expect(wrapper.emitted('select')).toEqual([['hut']]);
      expect(waapi.calls.some((c) => c.frames.some((f) => f.translate))).toBe(false);
      expect(bubble(wrapper, 'Hut').attributes('data-dropping')).toBeDefined();
      await vi.advanceTimersByTimeAsync(60);
      expect(bubble(wrapper, 'Hut').attributes('data-dropping')).toBeUndefined();
      wrapper.unmount();
    });
  });

  describe('glow (H4)', () => {
    it('glows only on the buildable bubble whose card is shown', async () => {
      const wrapper = mount(RingMenu, mountOptions);
      await vi.advanceTimersByTimeAsync(2000);
      void bubble(wrapper, 'Build').trigger('click');
      await vi.advanceTimersByTimeAsync(2000);
      void bubble(wrapper, 'Housing').trigger('click');
      await vi.advanceTimersByTimeAsync(2000);
      expect(wrapper.find('.ring-bubble.glow').exists()).toBe(false);

      await bubble(wrapper, 'Hut').trigger('mouseenter');
      expect(wrapper.find('.ring-card').exists()).toBe(true);
      expect(bubble(wrapper, 'Hut').classes()).toContain('glow');

      await bubble(wrapper, 'Watchtower').trigger('mouseenter');
      expect(wrapper.find('.ring-bubble.glow').exists()).toBe(false);
      wrapper.unmount();
    });
  });

  describe('close retract (X3) behind a <Transition>', () => {
    // The wrapper MapView uses: the ring only leaves the DOM when the leave hook calls done().
    const Host = defineComponent({
      setup() {
        const open = ref(true);
        const closed = ref(0);
        return () =>
          h('div', [
            h('button', { id: 'toggle', onClick: () => (open.value = !open.value) }),
            h(
              Transition,
              { css: false, onLeave: (el: Element, done: () => void) => retractRing(el as HTMLElement).then(done, done) },
              () =>
                open.value
                  ? h(RingMenu, { ...mountOptions.props, onClose: () => { open.value = false; closed.value++; } })
                  : null,
            ),
          ]);
      },
    });

    it('keeps the ring mounted while it retracts and removes it only afterwards', async () => {
      const wrapper = mount(Host, { global: { ...mountOptions.global, stubs: { transition: false } }, attachTo: document.body });
      await vi.advanceTimersByTimeAsync(2000);
      expect(document.querySelector('.ring-backdrop')).not.toBeNull();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await nextTick();
      // Escape asked to close; the ring is still there, retracting and click-through.
      const backdrop = document.querySelector<HTMLElement>('.ring-backdrop');
      expect(backdrop).not.toBeNull();
      expect(backdrop!.style.pointerEvents).toBe('none');

      await vi.advanceTimersByTimeAsync(PULL_MS + 2 * 12 + HUB_OUT_MS - 5);
      expect(document.querySelector('.ring-backdrop')).not.toBeNull();
      await vi.advanceTimersByTimeAsync(10);
      expect(document.querySelector('.ring-backdrop')).toBeNull();
      wrapper.unmount();
    });

    it('removes the ring at once under reduced motion', async () => {
      waapi.uninstall();
      waapi = installWaapi(true);
      vi.useFakeTimers();
      const wrapper = mount(Host, { global: { ...mountOptions.global, stubs: { transition: false } }, attachTo: document.body });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await nextTick();
      await vi.advanceTimersByTimeAsync(0);
      expect(document.querySelector('.ring-backdrop')).toBeNull();
      wrapper.unmount();
    });
  });
});
