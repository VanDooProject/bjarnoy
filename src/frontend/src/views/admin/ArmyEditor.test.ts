// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArmyEditor from './ArmyEditor.vue';
import type { AdminArmyResponse } from '../../api/types';

const { adminListArmies, adminEditArmy } = vi.hoisted(() => ({
  adminListArmies: vi.fn(),
  adminEditArmy: vi.fn(),
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: { adminListArmies, adminEditArmy } };
});

function army(overrides: Partial<AdminArmyResponse['army']> = {}): AdminArmyResponse {
  return {
    worldId: 'world-1',
    settlementName: 'Bjornstad',
    ownerName: 'Ragnar',
    army: {
      id: 'army-1',
      settlementId: 'settlement-1',
      mission: 'move',
      targetSettlementId: null,
      atHome: false,
      supporting: false,
      position: { q: 3, r: 4 },
      provisions: 120.4,
      totalSpeed: 3,
      totalUpkeepPerHour: 2,
      stacks: [{ unit: 'thrall', count: 5 }],
      movement: {
        departedAt: '2026-01-01T00:00:00Z',
        path: [],
        cumulativeHours: [],
        arrivesAt: '2026-01-01T10:00:00Z',
        returnPath: [],
        returnCumulativeHours: [],
        turnAroundAt: '2026-01-01T20:00:00Z',
        returnArrivesAt: '2026-01-02T06:00:00Z',
        isReturning: false,
      },
      ...overrides,
    },
  };
}

async function open() {
  adminListArmies.mockResolvedValue([army()]);
  const wrapper = mount(ArmyEditor, { props: { settlementId: 'settlement-1' } });
  await flushPromises();
  await wrapper.findAll('button').find((b) => b.text() === 'Edit')!.trigger('click');
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('ArmyEditor', () => {
  it('lists a settlement\'s armies with their units and position', async () => {
    adminListArmies.mockResolvedValue([army()]);

    const wrapper = mount(ArmyEditor, { props: { settlementId: 'settlement-1' } });
    await flushPromises();

    expect(adminListArmies).toHaveBeenCalledWith({ settlementId: 'settlement-1' });
    expect(wrapper.text()).toContain('5x thrall');
    expect(wrapper.text()).toContain('(3, 4)');
  });

  it('says so when a settlement has no armies in the field', async () => {
    adminListArmies.mockResolvedValue([]);

    const wrapper = mount(ArmyEditor, { props: { settlementId: 'settlement-1' } });
    await flushPromises();

    expect(wrapper.text()).toContain('No armies in the field');
  });

  it('speeds an army up so it arrives now', async () => {
    adminEditArmy.mockResolvedValue(army());

    const wrapper = await open();
    await wrapper.find('.controls input').setValue('0');
    await wrapper.findAll('button').find((b) => b.text() === 'Speed up')!.trigger('click');
    await flushPromises();

    expect(adminEditArmy).toHaveBeenCalledWith('army-1', {
      units: [{ unit: 'thrall', count: 5 }],
      provisions: 120,
      arriveInMinutes: 0,
    });
  });

  it('moves an army to a named hex', async () => {
    adminEditArmy.mockResolvedValue(army({ position: { q: 9, r: 9 } }));

    const wrapper = await open();
    const [qInput, rInput] = wrapper.findAll('.controls')[1]!.findAll('input');
    await qInput.setValue('9');
    await rInput.setValue('9');
    await wrapper.findAll('button').find((b) => b.text() === 'Move here')!.trigger('click');
    await flushPromises();

    expect(adminEditArmy).toHaveBeenCalledWith('army-1', {
      units: [{ unit: 'thrall', count: 5 }],
      provisions: 120,
      position: { q: 9, r: 9 },
    });
    expect(wrapper.text()).toContain('(9, 9)');
  });

  it('changes an army\'s unit counts and food without touching its route', async () => {
    adminEditArmy.mockResolvedValue(army({ stacks: [{ unit: 'thrall', count: 40 }] }));

    const wrapper = await open();
    await wrapper.find('.stacks input').setValue(40);
    await wrapper.findAll('button').find((b) => b.text() === 'Save units & food')!.trigger('click');
    await flushPromises();

    expect(adminEditArmy).toHaveBeenCalledWith('army-1', {
      units: [{ unit: 'thrall', count: 40 }],
      provisions: 120,
    });
    expect(wrapper.text()).toContain('40x thrall');
  });
});
