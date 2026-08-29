// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConversationView from './ConversationView.vue';
import type { MessageResponse, ProfileResponse } from '../api/types';
import { useAuthStore } from '../stores/auth';

// ConversationView renders <router-link> for its "back to messages" and
// profile links — a real (memory-history) router resolves those to actual
// <a href> elements. `useRoute` (for the :userId param) is still mocked
// below, since this router never navigates to the component itself.
function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/messages', component: { template: '<div />' } },
      { path: '/profile/:userName', component: { template: '<div />' } },
    ],
  });
}

const { getProfile, getConversation, markConversationRead, sendMessage, reportMessage } = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getConversation: vi.fn(),
  markConversationRead: vi.fn(),
  sendMessage: vi.fn(),
  reportMessage: vi.fn(),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    api: { getProfile, getConversation, markConversationRead, sendMessage, reportMessage },
  };
});

const routeParams: { userId?: string } = {};

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    useRoute: () => ({ params: routeParams }),
  };
});

function profile(overrides: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    id: 'other-1',
    userName: 'floki',
    displayName: null,
    bio: null,
    createdAt: '2026-01-15T00:00:00Z',
    settlementCount: 1,
    ...overrides,
  };
}

function message(overrides: Partial<MessageResponse> = {}): MessageResponse {
  return {
    id: 'msg-1',
    senderUserId: 'other-1',
    recipientUserId: 'user-1',
    body: 'hey there',
    sentAt: '2026-01-16T12:00:00Z',
    readAt: null,
    readReceiptVisible: false,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  routeParams.userId = 'other-1';
  markConversationRead.mockResolvedValue({ markedRead: 0 });

  const auth = useAuthStore();
  auth.user = { id: 'user-1', userName: 'ragnar', role: 'player', status: 'active', displayName: null };
});

describe('ConversationView', () => {
  it('loads the thread oldest-first and marks it read', async () => {
    getProfile.mockResolvedValue(profile());
    getConversation.mockResolvedValue({
      items: [
        message({ id: 'msg-2', body: 'second', sentAt: '2026-01-16T12:05:00Z' }),
        message({ id: 'msg-1', body: 'first', sentAt: '2026-01-16T12:00:00Z' }),
      ],
      totalCount: 2,
      page: 1,
      pageSize: 50,
    });

    const wrapper = mount(ConversationView, { global: { plugins: [testRouter()] } });
    await flushPromises();

    const bodies = wrapper.findAll('.body').map((b) => b.text());
    expect(bodies).toEqual(['first', 'second']);
    expect(markConversationRead).toHaveBeenCalledWith('other-1');
  });

  it('sends a message and appends it to the thread', async () => {
    getProfile.mockResolvedValue(profile());
    getConversation.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 50 });
    sendMessage.mockResolvedValue(message({ id: 'msg-new', senderUserId: 'user-1', body: 'hello!' }));

    const wrapper = mount(ConversationView, { global: { plugins: [testRouter()] } });
    await flushPromises();

    await wrapper.find('textarea').setValue('hello!');
    await wrapper.find('button').trigger('click');
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith({ recipientUserId: 'other-1', body: 'hello!' });
    expect(wrapper.find('.body').text()).toBe('hello!');
  });

  it('lets the recipient report a message, then hides the report link for it', async () => {
    getProfile.mockResolvedValue(profile());
    getConversation.mockResolvedValue({ items: [message()], totalCount: 1, page: 1, pageSize: 50 });
    reportMessage.mockResolvedValue({});

    const wrapper = mount(ConversationView, { global: { plugins: [testRouter()] } });
    await flushPromises();

    await wrapper.find('.report-link').trigger('click');
    await wrapper.find('.report-dialog input').setValue('harassment');
    const sendButton = wrapper.findAll('button').find((b) => b.text() === 'Send report')!;
    await sendButton.trigger('click');
    await flushPromises();

    expect(reportMessage).toHaveBeenCalledWith('msg-1', { reason: 'harassment' });
    expect(wrapper.find('.report-link').exists()).toBe(false);
    expect(wrapper.text()).toContain('Reported');
  });

  it('shows a read receipt only when the backend marks it visible', async () => {
    getProfile.mockResolvedValue(profile());
    getConversation.mockResolvedValue({
      items: [
        message({
          senderUserId: 'user-1',
          recipientUserId: 'other-1',
          readAt: '2026-01-16T13:00:00Z',
          readReceiptVisible: true,
        }),
      ],
      totalCount: 1,
      page: 1,
      pageSize: 50,
    });

    const wrapper = mount(ConversationView, { global: { plugins: [testRouter()] } });
    await flushPromises();

    expect(wrapper.text()).toContain('Read');
  });
});
