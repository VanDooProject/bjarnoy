// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApiKeyScopeEditor from './ApiKeyScopeEditor.vue';
import type { AdminWorldResponse, ApiKeyFeatureInfo, ApproveApiKeyRequestBody, SaveApiKeyRequest } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import adminApiKeys from '../../i18n/locales/en/adminApiKeys.json';

const { adminListUsers } = vi.hoisted(() => ({ adminListUsers: vi.fn() }));
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: { adminListUsers } };
});

const global = { plugins: [createTestI18n({ adminApiKeys })] };

const features: ApiKeyFeatureInfo[] = [
  { id: 'settlements', worldScoped: true, admin: false, description: 'Settlements' },
  { id: 'chat', worldScoped: false, admin: false, description: 'Chat' },
  { id: 'admin.users', worldScoped: false, admin: true, description: 'Admin users' },
];
const worlds = [
  { id: 'w1', name: 'Midgard' },
  { id: 'w2', name: 'Asgard' },
] as AdminWorldResponse[];
const admin = { id: 'a1', userName: 'boss', role: 'admin' };

function mountEditor(mode: 'key' | 'approve', initial: Record<string, unknown> = {}) {
  return mount(ApiKeyScopeEditor, {
    props: { mode, features, worlds, initial: { owner: admin, ...initial } },
    global,
  });
}

beforeEach(() => vi.clearAllMocks());

describe('ApiKeyScopeEditor', () => {
  it('emits a SaveApiKeyRequest with only granted features and the picked worlds', async () => {
    const wrapper = mountEditor('key', { expiresAt: '2030-01-01T12:00:00Z' });
    await wrapper.get('[data-testid="editor-name"]').setValue('  debug  ');
    await wrapper.get('[data-testid="feature-settlements-ReadWrite"]').setValue(true);
    await wrapper.get('[data-testid="feature-chat-Read"]').setValue(true);
    await wrapper.get('[data-testid="editor-world-w2"]').setValue(true);
    await wrapper.get('[data-testid="editor-rpm"]').setValue('60');
    await wrapper.get('form').trigger('submit');

    const body = wrapper.emitted('submit')![0][0] as SaveApiKeyRequest;
    expect(body).toMatchObject({
      name: 'debug',
      purpose: null,
      ownerUserId: 'a1',
      features: { settlements: 'ReadWrite', chat: 'Read' },
      allWorlds: false,
      worldIds: ['w2'],
      requestsPerMinute: 60,
    });
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(0);
  });

  it('sends no worldIds when all worlds is on', async () => {
    const wrapper = mountEditor('key', { name: 'k', worldIds: ['w1'] });
    await wrapper.get('[data-testid="feature-settlements-Read"]').setValue(true);
    await wrapper.get('[data-testid="editor-all-worlds"]').setValue(true);
    await wrapper.get('form').trigger('submit');
    const body = wrapper.emitted('submit')![0][0] as SaveApiKeyRequest;
    expect(body.allWorlds).toBe(true);
    expect(body.worldIds).toEqual([]);
  });

  it('does not emit without a feature, and without a world for a world-scoped one', async () => {
    const wrapper = mountEditor('key', { name: 'k' });
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
    await wrapper.get('[data-testid="feature-settlements-Read"]').setValue(true);
    expect(wrapper.get('[data-testid="editor-validation"]').text()).toBe(
      adminApiKeys.editor.errors.worldRequired,
    );
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('emits the approve body with lifetime and auto-renew overrides', async () => {
    const wrapper = mountEditor('approve', {
      features: { chat: 'Read' },
      lifetimeMinutes: 120,
      requestsPerMinute: 30,
    });
    await wrapper.get('[data-testid="editor-lifetime"]').setValue('45');
    await wrapper.get('[data-testid="editor-auto-renew"]').setValue('600');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')![0][0]).toEqual({
      ownerUserId: 'a1',
      features: { chat: 'Read' },
      allWorlds: false,
      worldIds: [],
      lifetimeMinutes: 45,
      requestsPerMinute: 30,
      autoRenewMinutes: 600,
    } satisfies ApproveApiKeyRequestBody);
  });

  it('enables admin rows only for an admin owner and drops them when the owner changes', async () => {
    adminListUsers.mockResolvedValue({
      items: [{ id: 'p1', userName: 'player', role: 'player' }],
      totalCount: 1,
      page: 1,
      pageSize: 10,
    });
    const wrapper = mountEditor('key', { name: 'k', features: { 'admin.users': 'Read' } });
    const row = '[data-testid="feature-admin.users-Read"]';
    expect((wrapper.get(row).element as HTMLInputElement).disabled).toBe(false);

    await wrapper.get('[data-testid="editor-owner-search"]').setValue('play');
    await wrapper.get('[data-testid="editor-owner-search"]').trigger('keydown.enter');
    await flushPromises();
    await wrapper.get('[data-testid="owner-pick-p1"]').trigger('click');

    expect((wrapper.get(row).element as HTMLInputElement).disabled).toBe(true);
    await wrapper.get('[data-testid="feature-chat-Read"]').setValue(true);
    await wrapper.get('form').trigger('submit');
    const body = wrapper.emitted('submit')![0][0] as SaveApiKeyRequest;
    expect(body.ownerUserId).toBe('p1');
    expect(body.features).toEqual({ chat: 'Read' });
  });
});
