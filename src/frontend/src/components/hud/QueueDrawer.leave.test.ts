// @vitest-environment jsdom
//
// When the last order finishes the phone drawer column (the left-docked
// handle chip included) slides out instead of vanishing, and slides in again
// when the queue refills. Reduced motion removes it at once. The drawer must
// not be left open or mounted behind the exit.
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import QueueDrawer from './QueueDrawer.vue';
import { useWorldStore } from '../../stores/world';
import type { BuildOrderResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import { installWaapi } from '../../test/waapi';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';
import { DRAWER_SLIDE_MS } from '../../lib/hud/queueMotion';

function order(id: string): BuildOrderResponse {
  return {
    id, q: 0, r: 0, building: 'farm', targetLevel: 1, state: 'building', slotCost: 1,
    completesAtGameTime: 'x', completesInSeconds: 100, totalSeconds: 100,
  };
}
function mountDrawer(open = false) {
  return mount(QueueDrawer, {
    props: { open },
    // Transition is stubbed by default; the leave hook is what is under test.
    global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })], stubs: { transition: false } },
    attachTo: document.body,
  });
}

let waapi: ReturnType<typeof installWaapi>;
function setup(reduced = false) {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  waapi = installWaapi(reduced);
  const world = useWorldStore();
  world.hud.queueFetchedAt = Date.now();
  world.hud.queue = [order('a')];
  return world;
}

describe('QueueDrawer leave / enter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    waapi.uninstall();
    vi.useRealTimers();
  });

  it('keeps the handle mounted while it slides to its docked edge, then removes it', async () => {
    const world = setup();
    const wrapper = mountDrawer();
    await nextTick();
    expect((document.querySelector('.queue-drawer-handle') !== null)).toBe(true);

    world.hud.queue = [];
    await nextTick();
    // Still in the DOM, sliding out to the left.
    expect((document.querySelector('.queue-drawer-handle') !== null)).toBe(true);
    const out = waapi.on('.queue-drawer')[0];
    expect(out.frames[1]).toMatchObject({ transform: 'translateX(-100%)', opacity: 0 });
    expect(out.options).toMatchObject({ duration: DRAWER_SLIDE_MS });

    await vi.advanceTimersByTimeAsync(DRAWER_SLIDE_MS + 20);
    expect((document.querySelector('.queue-drawer-handle') !== null)).toBe(false);
    wrapper.unmount();
  });

  it('still force-closes an open drawer when the queue empties', async () => {
    const world = setup();
    const wrapper = mountDrawer(true);
    await nextTick();
    world.hud.queue = [];
    await nextTick();
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it('slides in again when the queue refills', async () => {
    const world = setup();
    const wrapper = mountDrawer();
    world.hud.queue = [];
    await nextTick();
    await vi.advanceTimersByTimeAsync(DRAWER_SLIDE_MS + 20);
    waapi.calls.length = 0;

    world.hud.queue = [order('b')];
    await nextTick();
    const inn = waapi.on('.queue-drawer')[0];
    expect(inn.frames[0]).toMatchObject({ transform: 'translateX(-100%)', opacity: 0 });
    wrapper.unmount();
  });

  it('removes the handle at once under reduced motion', async () => {
    const world = setup(true);
    const wrapper = mountDrawer();
    await nextTick();
    world.hud.queue = [];
    await nextTick();
    expect(waapi.on('.queue-drawer')).toHaveLength(0);
    expect((document.querySelector('.queue-drawer-handle') !== null)).toBe(false);
    wrapper.unmount();
  });
});
