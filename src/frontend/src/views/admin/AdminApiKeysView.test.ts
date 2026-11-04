// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminApiKeysView from './AdminApiKeysView.vue';
import type { ApiKeyRequestResponse, ApiKeyResponse } from '../../api/types';
import { useAuthStore } from '../../stores/auth';
import { createTestI18n } from '../../test/i18n';
import adminApiKeys from '../../i18n/locales/en/adminApiKeys.json';

const mocks = vi.hoisted(() => ({
  getApiKeyFeatures: vi.fn(),
  adminListWorlds: vi.fn(),
  adminListApiKeys: vi.fn(),
  adminListApiKeyRequests: vi.fn(),
  adminListUsers: vi.fn(),
  adminApproveApiKeyRequest: vi.fn(),
  adminDenyApiKeyRequest: vi.fn(),
  adminCreateApiKey: vi.fn(),
  adminRecreateApiKey: vi.fn(),
  adminRevokeApiKey: vi.fn(),
  adminUpdateApiKey: vi.fn(),
}));
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: mocks };
});

function request(code: string, overrides: Partial<ApiKeyRequestResponse> = {}): ApiKeyRequestResponse {
  return {
    id: `id-${code}`,
    userCode: code,
    kind: 'New',
    status: 'Pending',
    name: `agent ${code}`,
    purpose: null,
    description: null,
    contextUrl: null,
    requestedOwnerUserName: null,
    requestsPerMinute: null,
    lifetimeMinutes: 60,
    renewsApiKeyId: null,
    requesterIp: '10.0.0.1',
    requesterUserAgent: 'curl',
    createdAt: '2026-10-01T00:00:00Z',
    expiresAt: '2026-10-01T00:30:00Z',
    decidedAt: null,
    decidedByUserId: null,
    decidedByUserName: null,
    apiKeyId: null,
    completedAt: null,
    approved: null,
    features: { chat: 'Read' },
    allWorlds: false,
    worldIds: [],
    ...overrides,
  };
}

function key(): ApiKeyResponse {
  return {
    id: 'k1',
    name: 'ci key',
    purpose: null,
    keyHint: 'bjk_0123456789abcdef_…',
    ownerUserId: 'a1',
    ownerUserName: 'boss',
    createdByUserId: 'a1',
    createdByUserName: 'boss',
    status: 'Active',
    createdAt: '2026-10-01T00:00:00Z',
    expiresAt: '2026-10-02T00:00:00Z',
    lastUsedAt: null,
    revokedAt: null,
    replacedByApiKeyId: null,
    autoRenewUntil: null,
    requestsPerMinute: 120,
    features: { chat: 'Read' },
    allWorlds: true,
    worldIds: [],
  };
}

async function mountAt(url: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/api-keys', component: AdminApiKeysView }],
  });
  await router.push(url);
  await router.isReady();
  const wrapper = mount(AdminApiKeysView, {
    attachTo: document.body,
    global: { plugins: [createTestI18n({ adminApiKeys }), router] },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  const auth = useAuthStore();
  auth.user = {
    id: 'a1',
    userName: 'boss',
    role: 'admin',
    status: 'active',
    displayName: null,
    isPremium: false,
    preferredLocale: null,
  };
  mocks.getApiKeyFeatures.mockResolvedValue([
    { id: 'chat', worldScoped: false, admin: false, description: 'Chat' },
  ]);
  mocks.adminListWorlds.mockResolvedValue([]);
  mocks.adminListApiKeys.mockResolvedValue([key()]);
  mocks.adminListApiKeyRequests.mockResolvedValue([request('ABCD-2345'), request('WXYZ-6789')]);
  mocks.adminListUsers.mockResolvedValue({ items: [], totalCount: 0, page: 1, pageSize: 10 });
  window.confirm = vi.fn(() => true);
  Element.prototype.scrollIntoView = vi.fn();
});

describe('AdminApiKeysView', () => {
  it('highlights and scrolls to the request named by ?request=<code>', async () => {
    const wrapper = await mountAt('/admin/api-keys?request=wxyz-6789');
    expect(wrapper.get('[data-testid="request-WXYZ-6789"]').attributes('data-highlighted')).toBe('true');
    expect(wrapper.get('[data-testid="request-ABCD-2345"]').attributes('data-highlighted')).toBe('false');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('highlights nothing without the query parameter', async () => {
    const wrapper = await mountAt('/admin/api-keys');
    expect(wrapper.findAll('[data-highlighted="true"]')).toHaveLength(0);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('approves a request through the editor with the prefilled scope', async () => {
    mocks.adminApproveApiKeyRequest.mockResolvedValue(request('ABCD-2345', { status: 'Approved' }));
    const wrapper = await mountAt('/admin/api-keys?request=ABCD-2345');
    await wrapper.get('[data-testid="approve-ABCD-2345"]').trigger('click');
    await flushPromises();
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(mocks.adminApproveApiKeyRequest).toHaveBeenCalledWith('id-ABCD-2345', {
      ownerUserId: 'a1',
      features: { chat: 'Read' },
      allWorlds: false,
      worldIds: [],
      lifetimeMinutes: 60,
      requestsPerMinute: null,
      autoRenewMinutes: null,
    });
    wrapper.unmount();
  });

  it('denies a request after confirmation', async () => {
    mocks.adminDenyApiKeyRequest.mockResolvedValue(request('ABCD-2345', { status: 'Denied' }));
    const wrapper = await mountAt('/admin/api-keys');
    await wrapper.get('[data-testid="deny-ABCD-2345"]').trigger('click');
    expect(mocks.adminDenyApiKeyRequest).toHaveBeenCalledWith('id-ABCD-2345');
    wrapper.unmount();
  });

  it('shows the token once after recreating a key', async () => {
    mocks.adminRecreateApiKey.mockResolvedValue({ token: 'bjk_abc_secret', apiKey: key() });
    const wrapper = await mountAt('/admin/api-keys');
    await wrapper.get('[data-testid="recreate-k1"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="token-value"]').text()).toBe('bjk_abc_secret');
    wrapper.unmount();
  });
});
