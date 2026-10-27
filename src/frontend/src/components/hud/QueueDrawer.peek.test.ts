// @vitest-environment jsdom
//
// P2 + P4: after a confirmed build, with the drawer collapsed, a peek panel
// slides out beside the handle ("Farm → 1", "3:00 · queued"), stays 1.5 s and
// slides back; only then does the handle's count chip pop and the handle give
// one gold pulse. The drawer stays closed, and an open drawer or reduced
// motion plays nothing.
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import QueueDrawer from './QueueDrawer.vue';
import { useWorldStore } from '../../stores/world';
import type { BuildOrderResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import { installWaapi } from '../../test/waapi';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';
import { announceConfirmedBuild, confirmedBuild } from '../../composables/buildFeedback';

function order(id: string, q: number): BuildOrderResponse {
  return {
    id, q, r: 0, building: 'farm', targetLevel: 1, state: 'building', slotCost: 1,
    completesAtGameTime: 'x', completesInSeconds: 100, totalSeconds: 100,
  };
}
function mountDrawer(open = false) {
  return mount(QueueDrawer, {
    props: { open },
    global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
    attachTo: document.body,
  });
}
const confirm = (time: string | null = '3:00') =>
  announceConfirmedBuild({ coord: { q: 1, r: 0 }, name: 'Farm', level: 1, time, from: null });

let waapi: ReturnType<typeof installWaapi>;
function setup(reduced = false) {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  waapi = installWaapi(reduced);
  confirmedBuild.value = null;
  const world = useWorldStore();
  world.hud.queueFetchedAt = Date.now();
  // Two orders: the handle shows a count chip, which is what P4 pops.
  world.hud.queue = [order('a', 0), order('b', 1)];
}

describe('QueueDrawer peek', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    waapi.uninstall();
  });

  it('slides the new order out beside the handle, holds, slides back, and only then pops the count and pulses the handle', async () => {
    setup();
    const wrapper = mountDrawer();
    await flushPromises();
    confirm();
    await flushPromises();

    const peekPanel = wrapper.get('[data-testid="queue-peek"]');
    expect(peekPanel.text()).toContain('Farm → 1');
    expect(peekPanel.text()).toContain('3:00 · queued');
    const out = waapi.on('.queue-drawer-peek')[0];
    expect(out.frames[0]).toMatchObject({ transform: 'translateX(-100%)', opacity: 0 });
    expect(out.options).toMatchObject({ duration: 220, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
    // The count does not pop while the peek is out.
    expect(waapi.on('.queue-drawer-handle-count')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(220 + 1500 - 1);
    expect(waapi.on('.queue-drawer-peek')).toHaveLength(1); // still holding, not yet sliding back
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    const back = waapi.on('.queue-drawer-peek')[1];
    expect(back.options.duration).toBe(200);
    expect(wrapper.find('[data-testid="queue-peek"]').exists()).toBe(true);
    expect(waapi.on('.queue-drawer-handle-count')).toHaveLength(0);

    // After it has retracted: the chip pops and the handle pulses.
    await vi.advanceTimersByTimeAsync(200);
    await flushPromises();
    expect(wrapper.find('[data-testid="queue-peek"]').exists()).toBe(false);
    const pop = waapi.on('.queue-drawer-handle-count')[0];
    expect(pop.frames.map((f) => f.transform)).toEqual(['scale(.6)', 'scale(1.5)', 'scale(1)']);
    expect(pop.options.duration).toBe(320);
    const pulse = waapi.on('.queue-drawer-handle')[0];
    expect(pulse.frames[0]).toMatchObject({ boxShadow: '0 0 0 0 rgba(255,197,92,.8)' });
    expect(pulse.frames[1]).toMatchObject({ boxShadow: '0 0 0 8px rgba(255,197,92,0)' });
    expect(pulse.options.duration).toBe(500);
    // The drawer never opened.
    expect(wrapper.emitted('update:open')).toBeUndefined();
    wrapper.unmount();
  });

  it('says just "Queued" when the build time is unknown', async () => {
    setup();
    const wrapper = mountDrawer();
    await flushPromises();
    confirm(null);
    await flushPromises();
    expect(wrapper.get('[data-testid="queue-peek"]').text()).toContain('Queued');
    expect(wrapper.get('[data-testid="queue-peek"]').text()).not.toContain('·');
    await vi.advanceTimersByTimeAsync(2000);
    wrapper.unmount();
  });

  it('plays nothing when the drawer is open', async () => {
    setup();
    const wrapper = mountDrawer(true);
    await flushPromises();
    confirm();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(3000);
    expect(wrapper.find('[data-testid="queue-peek"]').exists()).toBe(false);
    expect(waapi.calls.filter((c) => c.el.matches('.queue-drawer-peek, .queue-drawer-handle, .queue-drawer-handle-count'))).toHaveLength(0);
    wrapper.unmount();
  });

  it('skips the pop and pulse if the drawer was opened while the peek was out', async () => {
    setup();
    const wrapper = mountDrawer();
    await flushPromises();
    confirm();
    await flushPromises();
    await wrapper.setProps({ open: true });
    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();
    expect(waapi.on('.queue-drawer-handle')).toHaveLength(0);
    expect(waapi.on('.queue-drawer-handle-count')).toHaveLength(0);
    wrapper.unmount();
  });

  it('under reduced motion shows no peek, pop or pulse, but the handle count is there', async () => {
    setup(true);
    const wrapper = mountDrawer();
    await flushPromises();
    confirm();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(3000);
    expect(wrapper.find('[data-testid="queue-peek"]').exists()).toBe(false);
    expect(waapi.calls).toHaveLength(0);
    expect(wrapper.get('.queue-drawer-handle-count').text()).toBe('2');
    wrapper.unmount();
  });
});
