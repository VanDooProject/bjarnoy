import { describe, expect, it } from 'vitest';
import { tradeSummaryLine } from './tradeReports';
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
  viewerSide: 'poster',
  read: false,
};

describe('tradeSummaryLine', () => {
  it('describes the poster side: gave the offered goods, got the requested goods', () => {
    expect(tradeSummaryLine(baseReport, 'poster')).toBe('Gave 200 wood for 100 iron');
  });
  it('describes the acceptor side as the mirror image', () => {
    expect(tradeSummaryLine(baseReport, 'acceptor')).toBe('Gave 100 iron for 200 wood');
  });
});
