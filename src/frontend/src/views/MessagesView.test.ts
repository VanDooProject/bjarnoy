// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessagesView from './MessagesView.vue';
import type { ConversationResponse } from '../api/types';

// MessagesView renders <router-link> for each conversation row — a real
// (memory-history) router resolves those to actual <a href> elements,
// rather than leaving them as unresolved-component warnings.
function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/messages', component: MessagesView },
      { path: '/messages/:userId', component: { template: '<div />' } },
    ],
  });
}

const { listConversations } = vi.hoisted(() => ({
  listConversations: vi.fn(),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    api: { listConversations },
  };
});

function conversation(overrides: Partial<ConversationResponse> = {}): ConversationResponse {
  return {
    otherUserId: 'other-1',
    otherUserName: 'floki',
    otherDisplayName: null,
    lastMessage: {
      id: 'msg-1',
      senderUserId: 'other-1',
      recipientUserId: 'user-1',
      body: 'hey there',
      sentAt: '2026-01-16T12:00:00Z',
      readAt: null,
      readReceiptVisible: false,
    },
    unreadCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('MessagesView', () => {
  it('shows a hint when there are no conversations yet', async () => {
    listConversations.mockResolvedValue({ items: [], page: 1, pageSize: 20 });

    const router = testRouter();
    await router.push('/messages');
    const wrapper = mount(MessagesView, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('No conversations yet');
  });

  it('lists conversations with an unread badge and links to the thread', async () => {
    listConversations.mockResolvedValue({
      items: [conversation({ unreadCount: 3 }), conversation({ otherUserId: 'other-2', otherUserName: 'bjorn' })],
      page: 1,
      pageSize: 20,
    });

    const router = testRouter();
    await router.push('/messages');
    const wrapper = mount(MessagesView, { global: { plugins: [router] } });
    await flushPromises();

    const rows = wrapper.findAll('.conversation');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('floki');
    expect(rows[0]!.text()).toContain('3');
    expect(rows[0]!.attributes('href')).toBe('/messages/other-1');
    expect(rows[1]!.find('.unread').exists()).toBe(false);
  });
});
