// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationSettingsView from './NotificationSettingsView.vue';
import { useAuthStore } from '../stores/auth';
import { createTestI18n } from '../test/i18n';
import enNotifications from '../i18n/locales/en/notifications.json';
import enCommon from '../i18n/locales/en/common.json';

const { getNotificationConfig, listPushSubscriptions } = vi.hoisted(() => ({
  getNotificationConfig: vi.fn(),
  listPushSubscriptions: vi.fn(),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    api: { ...actual.api, getNotificationConfig, listPushSubscriptions },
  };
});

vi.mock('../push/capability', () => ({ pushSupport: () => 'unsupported' }));

function mountView() {
  return mount(NotificationSettingsView, {
    global: { plugins: [createTestI18n({ notifications: enNotifications, common: enCommon })] },
  });
}

describe('NotificationSettingsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    getNotificationConfig.mockReset();
    listPushSubscriptions.mockReset();
  });

  it('shows a create-account notice for an anonymous visitor, without calling the API', async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Create an account to receive notifications.');
    expect(getNotificationConfig).not.toHaveBeenCalled();
  });

  it('shows the unavailable notice when push is not configured on the server', async () => {
    const auth = useAuthStore();
    auth.$patch({ user: { id: 'u1', userName: 'ragnar' } as never });
    getNotificationConfig.mockResolvedValue({ enabled: false, vapidPublicKey: null });

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Push notifications are not available on this server.');
  });

  it('shows the unsupported-browser notice once push is configured but this browser has no Push API', async () => {
    const auth = useAuthStore();
    auth.$patch({ user: { id: 'u1', userName: 'ragnar' } as never });
    getNotificationConfig.mockResolvedValue({ enabled: true, vapidPublicKey: 'the-key' });
    listPushSubscriptions.mockResolvedValue([]);

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain('Push notifications are not supported in this browser.');
  });
});
