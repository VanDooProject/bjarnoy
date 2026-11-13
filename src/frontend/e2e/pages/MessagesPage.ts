import { expect, type Locator, type Page, type Route } from '@playwright/test';

/** The other player of the mocked conversation. */
export const MESSAGES_PEER = { id: 'user-2', userName: 'astrid', displayName: 'Astrid Ironhand' };

/** One message of the mocked conversation; `mine` is sent by the logged-in player (`AdminAuthFixture.loginAsPlayer`, id `user-1`). */
export interface MockMessage {
  id: string;
  mine: boolean;
  body: string;
  sentAt: string;
  readAt?: string | null;
}

const SELF_ID = 'user-1';

function messageJson(peerId: string, m: MockMessage) {
  return {
    id: m.id,
    senderUserId: m.mine ? SELF_ID : peerId,
    recipientUserId: m.mine ? peerId : SELF_ID,
    body: m.body,
    sentAt: m.sentAt,
    readAt: m.readAt ?? null,
    readReceiptVisible: m.mine,
  };
}

/**
 * The messages list (`/messages`) and one conversation (`/messages/:userId`). Demo mode has no backend, so
 * `mockApi` answers the five endpoints the two views call; the player has to be logged in first
 * (`adminAuth.loginAsPlayer`).
 */
export class MessagesPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly conversations: Locator;
  readonly bubbles: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'Messages' });
    this.conversations = page.locator('a.conversation');
    this.bubbles = page.locator('.bubble-row');
  }

  /**
   * Answers the list, the conversation, its profile and the mark-read call. `thread` is oldest first; the API
   * returns newest first, which the view reverses again.
   */
  async mockApi(data: { unread: number; thread: MockMessage[] }): Promise<void> {
    const peer = MESSAGES_PEER;
    const thread = data.thread.map((m) => messageJson(peer.id, m));
    const last = thread[thread.length - 1]!;
    await this.page.route(/\/api\/v1\/messages\/conversations(\?.*)?$/, (route: Route) =>
      route.fulfill({
        json: {
          items: [
            {
              otherUserId: peer.id,
              otherUserName: peer.userName,
              otherDisplayName: peer.displayName,
              lastMessage: last,
              unreadCount: data.unread,
            },
          ],
          totalCount: 1,
          page: 1,
          pageSize: 20,
        },
      }),
    );
    await this.page.route(new RegExp(`/api/v1/messages/conversations/${peer.id}(\\?.*)?$`), (route: Route) =>
      route.fulfill({ json: { items: [...thread].reverse(), totalCount: thread.length, page: 1, pageSize: 50 } }),
    );
    await this.page.route(`**/api/v1/messages/conversations/${peer.id}/read`, (route: Route) =>
      route.fulfill({ json: { markedRead: 0 } }),
    );
    await this.page.route(`**/api/v1/profiles/${peer.id}`, (route: Route) =>
      route.fulfill({
        json: {
          id: peer.id,
          userName: peer.userName,
          displayName: peer.displayName,
          bio: null,
          createdAt: '2026-01-01T00:00:00Z',
          settlementCount: 1,
        },
      }),
    );
  }

  /** Opens `/messages` and waits for the list. */
  async openList(): Promise<void> {
    await this.page.goto('/messages');
    await expect(this.heading).toBeVisible();
    await expect(this.conversations.first()).toBeVisible();
  }

  /** Opens the conversation with the mocked peer and waits for its thread. */
  async openConversation(): Promise<void> {
    await this.page.goto(`/messages/${MESSAGES_PEER.id}`);
    await expect(this.bubbles.first()).toBeVisible();
  }
}
