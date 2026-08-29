// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminActivityView from './AdminActivityView.vue';
import ActivityChart from '../../components/admin/ActivityChart.vue';
import { ApiError } from '../../api/client';
import type {
  ActivitySummaryResponse,
  AdminActivityUser,
  AdminUserActivityDetailResponse,
  PagedAdminActivityUsersResponse,
} from '../../api/types';

const { adminGetActivitySummary, adminListActivityUsers, adminGetUserActivityDetail } = vi.hoisted(() => ({
  adminGetActivitySummary: vi.fn(),
  adminListActivityUsers: vi.fn(),
  adminGetUserActivityDetail: vi.fn(),
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    api: { adminGetActivitySummary, adminListActivityUsers, adminGetUserActivityDetail },
  };
});

function summary(overrides: Partial<ActivitySummaryResponse> = {}): ActivitySummaryResponse {
  return {
    from: '2026-08-22T00:00:00.000Z',
    to: '2026-08-29T23:59:59.999Z',
    bucket: 'day',
    buckets: [
      { bucketStart: '2026-08-22T00:00:00Z', activeUserCount: 4 },
      { bucketStart: '2026-08-23T00:00:00Z', activeUserCount: 6 },
    ],
    ...overrides,
  };
}

function usersPage(overrides: Partial<PagedAdminActivityUsersResponse> = {}): PagedAdminActivityUsersResponse {
  return {
    items: [
      { userId: 'u1', userName: 'ragnar', displayName: 'Ragnar', lastActiveAtUtc: '2026-08-28T10:00:00Z' },
      { userId: 'u2', userName: 'freydis', displayName: null, lastActiveAtUtc: null },
    ],
    totalCount: 2,
    page: 1,
    pageSize: 25,
    ...overrides,
  };
}

function detail(overrides: Partial<AdminUserActivityDetailResponse> = {}): AdminUserActivityDetailResponse {
  return {
    userId: 'u1',
    from: '2026-08-22T00:00:00.000Z',
    to: '2026-08-29T23:59:59.999Z',
    sessionCount: 2,
    totalActiveDuration: '1.02:03:04.5000000',
    sessions: [
      { startedAtUtc: '2026-08-28T09:00:00Z', lastSeenAtUtc: '2026-08-28T09:30:00Z' },
      { startedAtUtc: '2026-08-28T14:00:00Z', lastSeenAtUtc: '2026-08-28T15:00:00Z' },
    ],
    ...overrides,
  };
}

function user(overrides: Partial<AdminActivityUser> = {}): AdminActivityUser {
  return { userId: 'u1', userName: 'ragnar', displayName: 'Ragnar', lastActiveAtUtc: '2026-08-28T10:00:00Z', ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ActivityChart itself renders a real Chart.js instance (see its own
// colocated test for the canvas/jsdom mocking that requires) — this view's
// tests only care that the right buckets/bucketUnit are handed down, so the
// chart is stubbed out here rather than duplicating that setup.
const stubs = { ActivityChart: true };

describe('AdminActivityView', () => {
  it('loads the summary and users on mount and renders them', async () => {
    adminGetActivitySummary.mockResolvedValue(summary());
    adminListActivityUsers.mockResolvedValue(usersPage());

    const wrapper = mount(AdminActivityView, { global: { stubs } });
    await flushPromises();

    expect(adminGetActivitySummary).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'day' }),
    );
    expect(adminListActivityUsers).toHaveBeenCalledWith({ page: 1, pageSize: 25, sort: 'lastActive' });

    const chart = wrapper.findComponent(ActivityChart);
    expect(chart.props('buckets')).toHaveLength(2);
    expect(chart.props('bucketUnit')).toBe('day');

    expect(wrapper.text()).toContain('ragnar');
    expect(wrapper.text()).toContain('freydis');
    // The never-tracked user (null lastActiveAtUtc) renders distinctly.
    expect(wrapper.text()).toContain('Never');
  });

  it('shows a summary error without blocking the users table', async () => {
    adminGetActivitySummary.mockRejectedValue(new ApiError(400, { detail: 'Range exceeds 92 days.' }));
    adminListActivityUsers.mockResolvedValue(usersPage());

    const wrapper = mount(AdminActivityView, { global: { stubs } });
    await flushPromises();

    expect(wrapper.text()).toContain('Range exceeds 92 days.');
    expect(wrapper.findComponent(ActivityChart).exists()).toBe(false);
    expect(wrapper.text()).toContain('ragnar');
  });

  it('shows an empty state when there are no tracked users', async () => {
    adminGetActivitySummary.mockResolvedValue(summary());
    adminListActivityUsers.mockResolvedValue(usersPage({ items: [], totalCount: 0 }));

    const wrapper = mount(AdminActivityView, { global: { stubs } });
    await flushPromises();

    expect(wrapper.text()).toContain('No users.');
  });

  it('refetches the summary with the hour bucket when the toggle is clicked', async () => {
    adminGetActivitySummary.mockResolvedValue(summary());
    adminListActivityUsers.mockResolvedValue(usersPage());

    const wrapper = mount(AdminActivityView, { global: { stubs } });
    await flushPromises();
    adminGetActivitySummary.mockClear();

    const hourButton = wrapper.findAll('button').find((b) => b.text() === 'Hour')!;
    await hourButton.trigger('click');
    await flushPromises();

    expect(adminGetActivitySummary).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'hour' }));
    expect(wrapper.findComponent(ActivityChart).props('bucketUnit')).toBe('hour');
  });

  it('fetches and shows session windows and totals when a user row is clicked', async () => {
    adminGetActivitySummary.mockResolvedValue(summary());
    adminListActivityUsers.mockResolvedValue(usersPage());
    adminGetUserActivityDetail.mockResolvedValue(detail());

    const wrapper = mount(AdminActivityView, { global: { stubs } });
    await flushPromises();

    const row = wrapper.findAll('tr.user-row').find((r) => r.text().includes('ragnar'))!;
    await row.trigger('click');
    await flushPromises();

    expect(adminGetUserActivityDetail).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    );
    expect(wrapper.text()).toContain('2 sessions');
    // 1.02:03:04.5 -> 1 day 2h3m -> rendered as "26h 3m" (hours across the day boundary).
    expect(wrapper.text()).toContain('26h 3m');
  });

  it('closes the drill-down when the same user row is clicked again', async () => {
    adminGetActivitySummary.mockResolvedValue(summary());
    adminListActivityUsers.mockResolvedValue(usersPage());
    adminGetUserActivityDetail.mockResolvedValue(detail());

    const wrapper = mount(AdminActivityView, { global: { stubs } });
    await flushPromises();

    const row = wrapper.findAll('tr.user-row').find((r) => r.text().includes('ragnar'))!;
    await row.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('2 sessions');

    await row.trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('2 sessions');
  });

  it('surfaces a 404 from the detail fetch as a row-scoped error', async () => {
    adminGetActivitySummary.mockResolvedValue(summary());
    adminListActivityUsers.mockResolvedValue(usersPage({ items: [user()], totalCount: 1 }));
    adminGetUserActivityDetail.mockRejectedValue(new ApiError(404, { title: 'Not Found' }));

    const wrapper = mount(AdminActivityView, { global: { stubs } });
    await flushPromises();

    const row = wrapper.findAll('tr.user-row').find((r) => r.text().includes('ragnar'))!;
    await row.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Not Found');
  });
});
