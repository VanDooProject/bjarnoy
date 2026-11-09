import { i18n } from '../../i18n';
/** Which side `settlementId` traded on in this report — `null` if it was neither (shouldn't happen for reports fetched for that settlement). */
export function tradeSideFor(report, settlementId) {
    if (report.posterSettlementId === settlementId)
        return 'poster';
    if (report.acceptorSettlementId === settlementId)
        return 'acceptor';
    return null;
}
/**
 * A one-line summary for a report-inbox row, from `viewerSide`'s point of
 * view — the poster gave the offered goods and received the requested
 * goods; the acceptor is the mirror image.
 */
export function tradeSummaryLine(report, viewerSide) {
    const gave = viewerSide === 'poster' ? report.offeredResource : report.requestedResource;
    const gaveAmount = viewerSide === 'poster' ? report.offeredAmount : report.requestedAmount;
    const got = viewerSide === 'poster' ? report.requestedResource : report.offeredResource;
    const gotAmount = viewerSide === 'poster' ? report.requestedAmount : report.offeredAmount;
    return i18n.global.t('hud.tradeReport.summary', {
        gaveAmount: Math.round(gaveAmount),
        gave,
        gotAmount: Math.round(gotAmount),
        got,
    });
}
/** A trade report counts as unread if it completed after `lastSeenIso` (or nothing has been seen yet). */
export function isTradeReportUnread(report, lastSeenIso) {
    if (!lastSeenIso)
        return true;
    return new Date(report.completedAt).getTime() > new Date(lastSeenIso).getTime();
}
export function tradeUnreadCount(reports, lastSeenIso) {
    return reports.filter((r) => isTradeReportUnread(r, lastSeenIso)).length;
}
