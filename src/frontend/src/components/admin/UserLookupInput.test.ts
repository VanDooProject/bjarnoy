// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UserLookupInput from './UserLookupInput.vue';
import type { AdminUserLookupResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import adminApiKeys from '../../i18n/locales/en/adminApiKeys.json';

const { adminLookupUsers } = vi.hoisted(() => ({ adminLookupUsers: vi.fn() }));
vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return { ...actual, api: { adminLookupUsers } };
});

const global = { plugins: [createTestI18n({ adminApiKeys })] };

function hit(id: string, overrides: Partial<AdminUserLookupResponse> = {}): AdminUserLookupResponse {
  return {
    userId: id,
    userName: `user-${id}`,
    displayName: null,
    role: 'player',
    status: 'active',
    via: 'user',
    matchedName: null,
    worldName: null,
    ...overrides,
  };
}

async function type(wrapper: ReturnType<typeof mount>, text: string) {
  await wrapper.get('[data-testid="user-lookup-input"]').setValue(text);
  await vi.advanceTimersByTimeAsync(300);
  await flushPromises();
}

beforeEach(() => {
  vi.useFakeTimers();
  adminLookupUsers.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('UserLookupInput', () => {
  it('searches as you type, debounced, and not below two characters', async () => {
    adminLookupUsers.mockResolvedValue([hit('1')]);
    const wrapper = mount(UserLookupInput, { global });
    await type(wrapper, 'a');
    expect(adminLookupUsers).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="user-lookup-input"]').setValue('ra');
    await wrapper.get('[data-testid="user-lookup-input"]').setValue('rag');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(adminLookupUsers).toHaveBeenCalledTimes(1);
    expect(adminLookupUsers.mock.calls[0][0]).toBe('rag');
  });

  it('says which settlement or jarl matched', async () => {
    adminLookupUsers.mockResolvedValue([hit('1', { via: 'jarl', matchedName: 'Ragnvald', worldName: 'Midgard' })]);
    const wrapper = mount(UserLookupInput, { global });
    await type(wrapper, 'ragn');
    expect(wrapper.get('[data-testid="user-lookup-pick-1"]').text()).toContain('jarl Ragnvald');
    expect(wrapper.get('[data-testid="user-lookup-pick-1"]').text()).toContain('Midgard');
  });

  it('picks with the keyboard and hides accounts listed in exclude', async () => {
    adminLookupUsers.mockResolvedValue([hit('1'), hit('2'), hit('3')]);
    const wrapper = mount(UserLookupInput, { global, props: { exclude: ['1'] } });
    await type(wrapper, 'user');
    expect(wrapper.find('[data-testid="user-lookup-pick-1"]').exists()).toBe(false);

    const input = wrapper.get('[data-testid="user-lookup-input"]');
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('pick')![0][0]).toMatchObject({ userId: '3' });
    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('drops an answer that arrives after a newer query', async () => {
    let resolveFirst: (v: AdminUserLookupResponse[]) => void = () => {};
    adminLookupUsers
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce([hit('new')]);
    const wrapper = mount(UserLookupInput, { global });
    await type(wrapper, 'old');
    await type(wrapper, 'newer');
    resolveFirst([hit('old')]);
    await flushPromises();
    expect(wrapper.find('[data-testid="user-lookup-pick-old"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="user-lookup-pick-new"]').exists()).toBe(true);
  });
});
