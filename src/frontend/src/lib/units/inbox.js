/** The timestamp each report kind sorts/reads-unread by — `occurredAt` for battle/field, `completedAt` for trade. */
export function inboxTimestamp(item) {
    return item.kind === 'trade' ? item.report.completedAt : item.report.occurredAt;
}
/** Combines all three report lists into one newest-first inbox. */
export function mergeInbox(battleReports, tradeReports, fieldReports = [], campReports = []) {
    const items = [
        ...battleReports.map((report) => ({ kind: 'battle', report })),
        ...fieldReports.map((report) => ({ kind: 'field', report })),
        ...campReports.map((report) => ({ kind: 'camp', report })),
        ...tradeReports.map((report) => ({ kind: 'trade', report })),
    ];
    return items.sort((a, b) => new Date(inboxTimestamp(b)).getTime() - new Date(inboxTimestamp(a)).getTime());
}
/** Applies the inbox's Kind filter (All / Battle / Field / Camps / Trade tabs). */
export function filterInbox(items, filter) {
    if (filter === 'all')
        return items;
    return items.filter((item) => item.kind === filter);
}
/** An inbox item counts as unread if it happened/completed after `lastSeenIso` (or nothing has been seen yet). */
export function isInboxItemUnread(item, lastSeenIso) {
    if (!lastSeenIso)
        return true;
    return new Date(inboxTimestamp(item)).getTime() > new Date(lastSeenIso).getTime();
}
/** How many of `items` (of either kind) are unread as of `lastSeenIso` — the HUD badge count. */
export function inboxUnreadCount(items, lastSeenIso) {
    return items.filter((item) => isInboxItemUnread(item, lastSeenIso)).length;
}
