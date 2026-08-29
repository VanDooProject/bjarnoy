import { describe, expect, it } from 'vitest';
import { isTradeReportUnread, tradeSideFor, tradeSummaryLine, tradeUnreadCount } from './tradeReports';
import type { TradeReportResponse } from '../../api/types';

const baseReport: TradeReportResponse = {
  id: 'report-1',
  offerId: 'offer-1',
  completedAt: '2026-08-29T12:00:00.000Z',
  posterSettlementId: 'poster',
  acceptorSettlementId: 'acceptor',
  offeredResource: 'wood',
  offeredAmount: 200,
  requestedResource: 'iron',
  requestedAmount: 100,
  guildTrade: false,
  travelHours: 1.5,
};

describe('tradeSideFor', () => {
  it('identifies the poster', () => {
    expect(tradeSideFor(baseReport, 'poster')).toBe('poster');
  });
  it('identifies the acceptor', () => {
    expect(tradeSideFor(baseReport, 'acceptor')).toBe('acceptor');
  });
  it('returns null for a settlement not party to the trade', () => {
    expect(tradeSideFor(baseReport, 'stranger')).toBeNull();
  });
});

describe('tradeSummaryLine', () => {
  it('describes the poster side: gave the offered goods, got the requested goods', () => {
    expect(tradeSummaryLine(baseReport, 'poster')).toBe('Gave 200 wood for 100 iron');
  });
  it('describes the acceptor side as the mirror image', () => {
    expect(tradeSummaryLine(baseReport, 'acceptor')).toBe('Gave 100 iron for 200 wood');
  });
});

describe('isTradeReportUnread / tradeUnreadCount', () => {
  const earlier = { ...baseReport, id: 'earlier', completedAt: '2026-08-29T10:00:00.000Z' };
  const later = { ...baseReport, id: 'later', completedAt: '2026-08-29T12:00:00.000Z' };

  it('everything is unread when nothing has been seen yet', () => {
    expect(isTradeReportUnread(earlier, null)).toBe(true);
  });

  it('a report before the last-seen timestamp is read', () => {
    expect(isTradeReportUnread(earlier, '2026-08-29T11:00:00.000Z')).toBe(false);
  });

  it('a report after the last-seen timestamp is unread', () => {
    expect(isTradeReportUnread(later, '2026-08-29T11:00:00.000Z')).toBe(true);
  });

  it('counts only the unread ones', () => {
    expect(tradeUnreadCount([earlier, later], '2026-08-29T11:00:00.000Z')).toBe(1);
  });
});
