// @vitest-environment jsdom
//
// Q1 + Q5: after a confirmed build a gold token flies from the hex's dial into
// the new row of the CONSTRUCTION card; the row then slides in and the slot
// count bumps. A card that was hidden (no orders yet) slides in from the left
// first. Reduced motion skips the flight but the row and count still appear.
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import BuildQueuePanel from './BuildQueuePanel.vue';
import { useWorldStore } from '../../stores/world';
import type { BuildOrderResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import { installWaapi } from '../../test/waapi';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';
import { announceConfirmedBuild, heldBuildRows, holdBuildRow, confirmedBuild } from '../../composables/buildFeedback';
import { makePendingOrder } from '../../lib/hud/pendingBuild';

function order(overrides: Partial<BuildOrderResponse> = {}): BuildOrderResponse {
  return {
    id: 'order-1', q: 1, r: 2, building: 'farm', targetLevel: 1, state: 'building', slotCost: 1,
    completesAtGameTime: 'x', completesInSeconds: 100, totalSeconds: 100, ...overrides,
  };
}
function mountPanel() {
  return mount(BuildQueuePanel, {
    global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
    attachTo: document.body,
  });
}
const confirm = (coord = { q: 1, r: 2 }) =>
  announceConfirmedBuild({ coord, name: 'Farm', level: 1, time: '3:00', from: { x: 300, y: 200 } });

let waapi: ReturnType<typeof installWaapi>;

function setup(reduced = false) {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  waapi = installWaapi(reduced);
  heldBuildRows.value = [];
  confirmedBuild.value = null;
  return useWorldStore();
}

describe('BuildQueuePanel confirmation feedback', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    waapi.uninstall();
  });

  it('never shows a pending (optimistic, unconfirmed) order as a row', async () => {
    const world = setup();
    world.hud.queueFetchedAt = Date.now();
    world.hud.queue = [makePendingOrder('farm', { q: 1, r: 2 })];
    const wrapper = mountPanel();
    expect(wrapper.find('.status-card').exists()).toBe(false);
    world.hud.queue = [makePendingOrder('farm', { q: 1, r: 2 }), order({ id: 'o2', q: 5, r: 5 })];
    await flushPromises();
    expect(wrapper.findAll('.status-row')).toHaveLength(1);
    wrapper.unmount();
  });

  describe('with motion', () => {
    it('holds the only new row (and so the card) back until the confirmation, then plays Q5 and Q1 in order', async () => {
      const world = setup();
      world.hud.queueFetchedAt = Date.now();
      holdBuildRow({ q: 1, r: 2 });
      world.hud.queue = [order()]; // the refresh landed before the confirmation
      const wrapper = mountPanel();
      await flushPromises();
      expect(wrapper.get('.status-card').classes()).toContain('is-held');
      expect(wrapper.get('.status-row').classes()).toContain('is-held');

      confirm();
      await flushPromises();
      // Q5: the card slides in from the left first.
      expect(wrapper.get('.status-card').classes()).not.toContain('is-held');
      const card = waapi.on('.status-card');
      expect(card).toHaveLength(1);
      expect(card[0].frames[0]).toMatchObject({ opacity: 0, transform: 'translateX(-24px)' });
      expect(card[0].options.duration).toBe(260);
      expect(document.querySelector('[data-testid="queue-token"]')).toBeNull();

      // Then the token flies from the dial into the row (450 ms)…
      await vi.advanceTimersByTimeAsync(260);
      const token = document.querySelector<HTMLElement>('[data-testid="queue-token"]');
      expect(token).not.toBeNull();
      expect(token!.style.left).toBe('295px');
      expect(token!.style.top).toBe('195px');
      const flight = waapi.on('[data-testid="queue-token"]')[0];
      expect(flight.options).toMatchObject({ duration: 450, easing: 'cubic-bezier(.3,.6,.4,1)' });
      // …while the row is still held back.
      expect(wrapper.get('.status-row').classes()).toContain('is-held');

      // Where it lands: the row slides in and the count bumps.
      await vi.advanceTimersByTimeAsync(450);
      await flushPromises();
      expect(document.querySelector('[data-testid="queue-token"]')).toBeNull();
      expect(wrapper.get('.status-row').classes()).not.toContain('is-held');
      const row = waapi.on('.status-row')[0];
      expect(row.frames[0]).toMatchObject({ opacity: 0, transform: 'translateX(-6px)' });
      expect(row.options.duration).toBe(200);
      const bump = waapi.on('.status-card-count')[0];
      expect(bump.frames[1]).toMatchObject({ transform: 'scale(1.35)' });
      expect(bump.options.duration).toBe(360);
      expect(heldBuildRows.value).toEqual([]);
      wrapper.unmount();
    });

    it('does not slide the card in again when it was already showing another order', async () => {
      const world = setup();
      world.hud.queueFetchedAt = Date.now();
      holdBuildRow({ q: 1, r: 2 });
      world.hud.queue = [order({ id: 'old', q: 9, r: 9 }), order()];
      const wrapper = mountPanel();
      await flushPromises();
      expect(wrapper.get('.status-card').classes()).not.toContain('is-held');

      confirm();
      await flushPromises();
      expect(waapi.on('.status-card')).toHaveLength(0);
      expect(waapi.on('[data-testid="queue-token"]')).toHaveLength(1);
      wrapper.unmount();
    });

    it('shows the row at once, without a flight, when the hex has no dial position', async () => {
      const world = setup();
      world.hud.queueFetchedAt = Date.now();
      holdBuildRow({ q: 1, r: 2 });
      world.hud.queue = [order({ id: 'old', q: 9, r: 9 }), order()];
      const wrapper = mountPanel();
      announceConfirmedBuild({ coord: { q: 1, r: 2 }, name: 'Farm', level: 1, time: null, from: null });
      await flushPromises();
      expect(waapi.on('[data-testid="queue-token"]')).toHaveLength(0);
      expect(wrapper.findAll('.status-row').every((r) => !r.classes().includes('is-held'))).toBe(true);
      wrapper.unmount();
    });
  });

  describe('under reduced motion', () => {
    it('skips the flight and slides, the row and the count simply appear', async () => {
      const world = setup(true);
      world.hud.queueFetchedAt = Date.now();
      holdBuildRow({ q: 1, r: 2 });
      world.hud.queue = [order()];
      const wrapper = mountPanel();
      await flushPromises();
      confirm();
      await flushPromises();
      expect(wrapper.get('.status-card').classes()).not.toContain('is-held');
      expect(wrapper.get('.status-row').classes()).not.toContain('is-held');
      expect(wrapper.get('.status-card-count').text()).toContain('/');
      expect(waapi.calls).toHaveLength(0);
      expect(document.querySelector('[data-testid="queue-token"]')).toBeNull();
      wrapper.unmount();
    });
  });
});
