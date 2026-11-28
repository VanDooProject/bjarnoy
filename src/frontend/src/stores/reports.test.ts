// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CampReportResponse, TradeReportResponse } from '../api/types';
import { useReportsStore } from './reports';

// The vitest config otherwise defaults DEMO_MODE to true — mocked per test below.
const config = vi.hoisted(() => ({ demo: false }));
vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return {
    ...actual,
    get DEMO_MODE() {
      return config.demo;
    },
  };
});

const api = vi.hoisted(() => ({
  getWorldReports: vi.fn(),
  getWorldTradeReports: vi.fn(),
  getWorldFieldReports: vi.fn(),
  getWorldCampReports: vi.fn(),
  getWorldArmyReports: vi.fn(),
  markReportRead: vi.fn(),
  markAllReportsRead: vi.fn(),
}));
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api };
});

function camp(id: string, read = false): CampReportResponse {
  return {
    id,
    kind: 'hunt',
    occurredAt: '2026-01-03T00:00:00Z',
    camp: { q: 1, r: 2, family: 'wolfden', effectiveLevel: 1 },
    settlementId: 's',
    armyId: 'a',
    winner: 'army',
    armyPower: 300,
    campPower: 195,
    armyVolleyPower: 0,
    units: [],
    beasts: [],
    loot: { wood: 0, stone: 0, food: 0, iron: 0 },
    campCleared: true,
    tower: null,
    towerBurned: false,
    read,
  };
}

function trade(id: string): TradeReportResponse {
  return {
    id,
    offerId: `offer-${id}`,
    completedAt: '2026-01-02T00:00:00Z',
    posterSettlementId: 'p',
    acceptorSettlementId: 'a',
    offeredResource: 'wood',
    offeredAmount: 1,
    requestedResource: 'iron',
    requestedAmount: 1,
    guildTrade: false,
    travelHours: 1,
    viewerSide: 'poster',
    read: false,
  };
}

async function loaded(camps: CampReportResponse[] = [camp('c1')], trades: TradeReportResponse[] = [trade('t1')]) {
  api.getWorldCampReports.mockResolvedValue(camps);
  api.getWorldTradeReports.mockResolvedValue(trades);
  const reports = useReportsStore();
  await reports.load('w1', 'owner-1');
  return reports;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  config.demo = false;
  api.getWorldReports.mockResolvedValue([]);
  api.getWorldFieldReports.mockResolvedValue([]);
  api.getWorldArmyReports.mockResolvedValue([]);
  api.markReportRead.mockResolvedValue(undefined);
  api.markAllReportsRead.mockResolvedValue({ markedRead: 2 });
});

describe('reports store read state', () => {
  it('counts what the server says is unread, in total and per kind', async () => {
    const reports = await loaded([camp('c1'), camp('c2', true)]);
    expect(reports.unreadCount).toBe(2);
    expect(reports.unreadCountByKind).toMatchObject({ camp: 1, trade: 1, battle: 0 });
  });

  it('markRead is optimistic and asks the server once', async () => {
    const reports = await loaded();
    const item = reports.inboxItems.find((i) => i.kind === 'camp')!;
    const pending = reports.markRead(item);
    expect(reports.isUnread(item)).toBe(false);
    expect(reports.unreadCount).toBe(1);
    await pending;
    await reports.markRead(item);
    expect(api.markReportRead).toHaveBeenCalledTimes(1);
    expect(api.markReportRead).toHaveBeenCalledWith('w1', 'camp', 'c1', 'owner-1');
  });

  it('puts the report back to unread when the request fails', async () => {
    api.markReportRead.mockRejectedValue(new Error('nope'));
    const reports = await loaded();
    const item = reports.inboxItems.find((i) => i.kind === 'camp')!;
    await reports.markRead(item);
    expect(reports.isUnread(item)).toBe(true);
    expect(reports.unreadCount).toBe(2);
  });

  it('does nothing for a report the server already has as read', async () => {
    const reports = await loaded([camp('c1', true)], []);
    await reports.markRead(reports.inboxItems[0]!);
    expect(api.markReportRead).not.toHaveBeenCalled();
  });

  it('does nothing in the demo', async () => {
    config.demo = true;
    const reports = await loaded();
    await reports.markRead(reports.inboxItems[0]!);
    await reports.markAllRead();
    expect(api.markReportRead).not.toHaveBeenCalled();
    expect(api.markAllReportsRead).not.toHaveBeenCalled();
  });

  it('a poll that still says unread does not undo the optimistic mark', async () => {
    const reports = await loaded();
    const item = reports.inboxItems.find((i) => i.kind === 'camp')!;
    await reports.markRead(item);
    await reports.load('w1', 'owner-1');
    expect(reports.isUnread(reports.inboxItems.find((i) => i.kind === 'camp')!)).toBe(false);
  });

  it('markAllRead marks every unread report once and reverts them all on failure', async () => {
    const reports = await loaded();
    await reports.markAllRead();
    expect(reports.unreadCount).toBe(0);
    expect(api.markAllReportsRead).toHaveBeenCalledWith('w1', 'owner-1');

    api.markAllReportsRead.mockRejectedValue(new Error('nope'));
    const other = await loaded([camp('c9')], [trade('t9')]);
    await other.markAllRead();
    expect(other.unreadCount).toBe(2);
  });

  it('forgets the overlay when the world changes', async () => {
    const reports = await loaded();
    await reports.markAllRead();
    expect(reports.unreadCount).toBe(0);
    await reports.load('w2', 'owner-1');
    expect(reports.unreadCount).toBe(2);
  });
});
