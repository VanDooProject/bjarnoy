import type { CDPSession, Page } from '@playwright/test';

/** One CDP session per page — opening a second one per call site would cost more than it saves. */
const cdpSessions = new WeakMap<Page, Promise<CDPSession>>();

export function cdpSessionFor(page: Page): Promise<CDPSession> {
  let session = cdpSessions.get(page);
  if (!session) {
    session = page.context().newCDPSession(page);
    cdpSessions.set(page, session);
  }
  return session;
}
