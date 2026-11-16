// @vitest-environment jsdom
//
// Issue #99: mirrors BuildQueuePanel.test.ts — the training-queue progress
// bar used the identical relative-to-last-poll formula and had the same
// reset-to-zero-on-poll bug.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TrainingQueuePanel from './TrainingQueuePanel.vue';
import { useWorldStore } from '../../stores/world';
import { api, ApiError } from '../../api/client';
import type { TrainingOrderResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

function mountPanel() {
  return mount(TrainingQueuePanel, {
    global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
  });
}

function order(overrides: Partial<TrainingOrderResponse> = {}): TrainingOrderResponse {
  return {
    id: 'training-1',
    unit: 'spearman',
    q: 3,
    r: -2,
    count: 5,
    completedCount: 0,
    startsAtGameTime: '2026-01-01T00:00:00Z',
    startsInSeconds: 0,
    completesAtGameTime: '2026-01-01T00:00:00Z',
    completesInSeconds: 100,
    totalSeconds: 100,
    ...overrides,
  };
}

function fillWidth(wrapper: ReturnType<typeof mount>): number {
  const style = wrapper.get('.status-progress-fill').attributes('style') ?? '';
  const match = /width:\s*([\d.]+)%/.exec(style);
  return match ? Number(match[1]) : NaN;
}

describe('TrainingQueuePanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('advances progress smoothly as time passes without a refetch', async () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [order({ completesInSeconds: 100, totalSeconds: 100 })];

    const wrapper = mountPanel();
    const initial = fillWidth(wrapper);

    vi.advanceTimersByTime(20_000);
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();

    expect(fillWidth(wrapper)).toBeGreaterThan(initial);
    wrapper.unmount();
  });

  it('never lets progress jump backward when a poll resets trainingQueueFetchedAt', async () => {
    const world = useWorldStore();
    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [order({ completesInSeconds: 100, totalSeconds: 100 })];

    const wrapper = mountPanel();

    vi.advanceTimersByTime(60_000);
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();
    const beforePoll = fillWidth(wrapper);
    expect(beforePoll).toBeGreaterThan(0);

    world.hud.trainingQueueFetchedAt = Date.now();
    world.hud.trainingQueue = [order({ completesInSeconds: 40, totalSeconds: 100 })];
    world.hud.tick += 1;
    await wrapper.vm.$nextTick();

    expect(fillWidth(wrapper)).toBeGreaterThanOrEqual(beforePoll);
    wrapper.unmount();
  });

  describe('guests', () => {
    function guest(armyId: string) {
      return { armyId, ownerSettlementId: 'unknown', totalUpkeepPerHour: 1, stacks: [{ unit: 'spearman', count: 5 }] };
    }

    function seedGuests(world: ReturnType<typeof useWorldStore>, ...ids: string[]) {
      world.selectedSettlementId = 'host-1';
      world.ownerId = 'owner-1';
      world.guestArmies = ids.map(guest) as typeof world.guestArmies;
    }

    it('shows one Send home button per guest and none without guests', async () => {
      const world = useWorldStore();
      const wrapper = mountPanel();
      expect(wrapper.findAll('.guest-send-home')).toHaveLength(0);

      seedGuests(world, 'a1', 'a2');
      await wrapper.vm.$nextTick();

      const buttons = wrapper.findAll('.guest-send-home');
      expect(buttons).toHaveLength(2);
      expect(buttons[0].text()).toBe('Send home');
      wrapper.unmount();
    });

    it('sends the clicked guest home for the selected settlement and refreshes', async () => {
      const world = useWorldStore();
      seedGuests(world, 'a1', 'a2');
      const send = vi.spyOn(api, 'sendGuestHome').mockResolvedValue(undefined);
      const refresh = vi.spyOn(world, 'refreshArmies').mockResolvedValue(undefined);

      const wrapper = mountPanel();
      await wrapper.findAll('.guest-send-home')[1].trigger('click');
      await vi.waitFor(() => expect(refresh).toHaveBeenCalled());

      expect(send).toHaveBeenCalledWith('host-1', 'a2', 'owner-1');
      wrapper.unmount();
    });

    it('disables the button while the request runs', async () => {
      const world = useWorldStore();
      seedGuests(world, 'a1');
      let finish!: () => void;
      vi.spyOn(api, 'sendGuestHome').mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
      vi.spyOn(world, 'refreshArmies').mockResolvedValue(undefined);

      const wrapper = mountPanel();
      await wrapper.get('.guest-send-home').trigger('click');
      expect(wrapper.get('.guest-send-home').attributes('disabled')).toBeDefined();

      finish();
      await vi.waitFor(() => expect(wrapper.get('.guest-send-home').attributes('disabled')).toBeUndefined());
      wrapper.unmount();
    });

    it('shows the translated rejection, not the server\'s English detail, when the server refuses', async () => {
      const world = useWorldStore();
      seedGuests(world, 'a1');
      vi.spyOn(api, 'sendGuestHome').mockRejectedValue(
        new ApiError(409, { title: 'No route home.', detail: 'No route home exists.', status: 409, rejection: 'NoRouteHome' }),
      );

      const wrapper = mountPanel();
      await wrapper.get('.guest-send-home').trigger('click');
      await vi.waitFor(() => expect(wrapper.find('.error-note').exists()).toBe(true));

      expect(wrapper.get('.error-note').text()).toBe('No route home from where the army is now.');
      wrapper.unmount();
    });

    it('shows the generic send-home error for a refusal without a rejection code (e.g. a 429)', async () => {
      const world = useWorldStore();
      seedGuests(world, 'a1');
      vi.spyOn(api, 'sendGuestHome').mockRejectedValue(new ApiError(429, undefined));

      const wrapper = mountPanel();
      await wrapper.get('.guest-send-home').trigger('click');
      await vi.waitFor(() => expect(wrapper.find('.error-note').exists()).toBe(true));

      expect(wrapper.get('.error-note').text()).toBe("Couldn't send the army home.");
      wrapper.unmount();
    });
  });
});
