// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUsersView from './AdminUsersView.vue';
import { ApiError } from '../../api/client';
import type { AdminUserResponse } from '../../api/types';
import { useAuthStore } from '../../stores/auth';
import { createTestI18n } from '../../test/i18n';
import adminUsers from '../../i18n/locales/en/adminUsers.json';

const global = { plugins: [createTestI18n({ adminUsers })] };

const { adminListUsers, adminUpdateUser, adminSetUserStatus, adminSetUserPremium, adminSetUserRenown } = vi.hoisted(() => ({
  adminListUsers: vi.fn(),
  adminUpdateUser: vi.fn(),
  adminSetUserStatus: vi.fn(),
  adminSetUserPremium: vi.fn(),
  adminSetUserRenown: vi.fn(),
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    api: { adminListUsers, adminUpdateUser, adminSetUserStatus, adminSetUserPremium, adminSetUserRenown },
  };
});

function user(overrides: Partial<AdminUserResponse> = {}): AdminUserResponse {
  return {
    id: 'user-1',
    userName: 'ragnar',
    displayName: null,
    role: 'admin',
    status: 'active',
    statusReason: null,
    statusChangedAt: null,
    settlementCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    lastLoginAt: null,
    isPremium: false,
    renown: 0,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
  window.prompt = vi.fn(() => '');
});

describe('AdminUsersView guards', () => {
  it("disables an admin's own lock/ban buttons, but not another user's", async () => {
    const self = user({ id: 'admin-1', userName: 'me' });
    const other = user({ id: 'player-1', userName: 'someone-else', role: 'player' });
    adminListUsers.mockResolvedValue({ items: [self, other], totalCount: 2, page: 1, pageSize: 25 });

    const auth = useAuthStore();
    auth.user = {
      id: 'admin-1',
      userName: 'me',
      role: 'admin',
      status: 'active',
      displayName: null,
      isPremium: false,
      preferredLocale: null,
    };

    const wrapper = mount(AdminUsersView, { global });
    await flushPromises();

    const rows = wrapper.findAll('tbody tr');
    const selfRow = rows.find((r) => r.text().includes('me'))!;
    const otherRow = rows.find((r) => r.text().includes('someone-else'))!;

    const selfButtons = selfRow.findAll('button').filter((b) => /Lock|Ban/.test(b.text()));
    expect(selfButtons.length).toBeGreaterThan(0);
    for (const button of selfButtons) {
      expect(button.attributes('disabled')).toBeDefined();
    }

    const otherButtons = otherRow.findAll('button').filter((b) => /Lock|Ban/.test(b.text()));
    expect(otherButtons.length).toBeGreaterThan(0);
    for (const button of otherButtons) {
      expect(button.attributes('disabled')).toBeUndefined();
    }
  });

  it('renders the last-admin-demotion rejection as a row error instead of applying the change', async () => {
    const onlyAdmin = user({ id: 'admin-1', userName: 'lone-admin' });
    adminListUsers.mockResolvedValue({ items: [onlyAdmin], totalCount: 1, page: 1, pageSize: 25 });
    adminUpdateUser.mockRejectedValue(
      new ApiError(400, { title: 'Bad Request', detail: 'This is the last remaining admin; demote another admin first.' }),
    );

    const auth = useAuthStore();
    auth.user = {
      id: 'other-admin',
      userName: 'someone-else-entirely',
      role: 'admin',
      status: 'active',
      displayName: null,
      isPremium: false,
      preferredLocale: null,
    };

    const wrapper = mount(AdminUsersView, { global });
    await flushPromises();

    const roleSelect = wrapper.find('select.cell-input');
    await roleSelect.setValue('player');

    const saveButton = wrapper.findAll('button').find((b) => b.text() === 'Save')!;
    await saveButton.trigger('click');
    await flushPromises();

    expect(adminUpdateUser).toHaveBeenCalledWith('admin-1', { displayName: '', role: 'player' });
    expect(wrapper.text()).toContain('This is the last remaining admin; demote another admin first.');
    // The row's own status/role display is untouched by the rejected edit.
    expect(wrapper.find('.status').text()).toBe('active');
  });
});

describe('AdminUsersView renown', () => {
  it('sets the typed renown and shows the value the server returns', async () => {
    adminListUsers.mockResolvedValue({
      items: [user({ id: 'player-1', userName: 'someone', role: 'player', renown: 12.7 })],
      totalCount: 1,
      page: 1,
      pageSize: 25,
    });
    adminSetUserRenown.mockResolvedValue(user({ id: 'player-1', userName: 'someone', role: 'player', renown: 80000 }));

    const wrapper = mount(AdminUsersView, { global });
    await flushPromises();

    const input = wrapper.find('input.renown-input');
    expect((input.element as HTMLInputElement).value).toBe('12');
    await input.setValue('80000');
    await wrapper.find('button.renown-set').trigger('click');
    await flushPromises();

    expect(adminSetUserRenown).toHaveBeenCalledWith('player-1', { renown: 80000 });
    expect((wrapper.find('input.renown-input').element as HTMLInputElement).value).toBe('80000');
  });

  it('does not call the API for a negative renown and shows a row error', async () => {
    adminListUsers.mockResolvedValue({
      items: [user({ id: 'player-1', userName: 'someone', role: 'player' })],
      totalCount: 1,
      page: 1,
      pageSize: 25,
    });

    const wrapper = mount(AdminUsersView, { global });
    await flushPromises();

    await wrapper.find('input.renown-input').setValue('-5');
    await wrapper.find('button.renown-set').trigger('click');
    await flushPromises();

    expect(adminSetUserRenown).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Renown must be a number of zero or more.');
  });
});
