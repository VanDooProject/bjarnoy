// @vitest-environment jsdom
//
// X8: after a confirmed build the pills of the spent resources count down from
// the old to the new value with a red flash — driven only by the store's
// explicit `hud.lastSpend` event, so an ordinary production tick (the stock
// changing on its own) never triggers it.
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ResourceBar from './ResourceBar.vue';
import { useWorldStore } from '../../stores/world';
import { createTestI18n } from '../../test/i18n';
import { installWaapi } from '../../test/waapi';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

function mountBar() {
  return mount(ResourceBar, {
    global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
    attachTo: document.body,
  });
}
const valueOf = (wrapper: ReturnType<typeof mountBar>, key: string) =>
  wrapper.get(`[data-res="${key}"] .value`).text().split('/')[0].trim();

describe('ResourceBar spend feedback', () => {
  let waapi: ReturnType<typeof installWaapi>;

  function setup(reduced = false) {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    waapi = installWaapi(reduced);
    const world = useWorldStore();
    world.hud.resources = { wood: 400, stone: 300, food: 200, iron: 0 };
    world.hud.storageCap = { wood: 1000, stone: 1000, food: 1000, iron: 1000 };
    world.hud.reserved = { wood: 0, stone: 0, food: 0, iron: 0 };
    return world;
  }
  afterEach(() => {
    document.body.innerHTML = '';
    waapi.uninstall();
  });

  it('counts the spent pill down from the old value to the new one over 420 ms, and flashes it red', async () => {
    const world = setup();
    const wrapper = mountBar();
    await flushPromises();
    expect(valueOf(wrapper, 'wood')).toBe('400');

    // The build was confirmed: the stock is already 300, the event says wood cost 100.
    world.hud.resources = { ...world.hud.resources, wood: 300 };
    world.recordSpend({ wood: 100 });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(16);
    expect(Number(valueOf(wrapper, 'wood'))).toBeGreaterThan(300);
    expect(Number(valueOf(wrapper, 'wood'))).toBeLessThanOrEqual(400);

    await vi.advanceTimersByTimeAsync(210);
    const mid = Number(valueOf(wrapper, 'wood'));
    expect(mid).toBeGreaterThan(300);
    expect(mid).toBeLessThan(400);

    await vi.advanceTimersByTimeAsync(300);
    expect(valueOf(wrapper, 'wood')).toBe('300');

    const flashes = waapi.on('[data-res="wood"]');
    expect(flashes).toHaveLength(1);
    expect(flashes[0].frames[0]).toMatchObject({ background: 'rgba(226,112,95,.45)' });
    expect(flashes[0].options.duration).toBe(650);
    // The other pills stay quiet.
    expect(waapi.on('[data-res="stone"]')).toHaveLength(0);
    wrapper.unmount();
  });

  it('does not react when the stock changes on its own (a production tick)', async () => {
    const world = setup();
    const wrapper = mountBar();
    await flushPromises();
    world.hud.resources = { ...world.hud.resources, wood: 380 };
    await flushPromises();
    await vi.advanceTimersByTimeAsync(500);
    expect(valueOf(wrapper, 'wood')).toBe('380');
    expect(waapi.calls).toHaveLength(0);
    wrapper.unmount();
  });

  it('under reduced motion the number just updates and only a short flash plays', async () => {
    const world = setup(true);
    const wrapper = mountBar();
    await flushPromises();
    world.hud.resources = { ...world.hud.resources, wood: 300 };
    world.recordSpend({ wood: 100 });
    await flushPromises();
    expect(valueOf(wrapper, 'wood')).toBe('300');
    const flashes = waapi.on('[data-res="wood"]');
    expect(flashes).toHaveLength(1);
    expect(flashes[0].options.duration).toBeLessThanOrEqual(120);
    wrapper.unmount();
  });
});
