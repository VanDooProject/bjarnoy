// No client.test.ts existed before this change — this file covers the new
// admin activity methods directly against a mocked `fetch`, exercising the
// shared `request()` plumbing (URL/query building, JSON parsing, ApiError on
// failure) the same way it behaves for every other client method.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, authHooks } from './client';
import type {
  ActivitySummaryResponse,
  AdminUserActivityDetailResponse,
  PagedAdminActivityUsersResponse,
} from './types';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  authHooks.getAccessToken = () => null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api.adminGetActivitySummary', () => {
  it('sends from/to/bucket as query params and returns the parsed response', async () => {
    const body: ActivitySummaryResponse = {
      from: '2026-08-01T00:00:00Z',
      to: '2026-08-08T00:00:00Z',
      bucket: 'day',
      buckets: [{ bucketStart: '2026-08-01T00:00:00Z', activeUserCount: 12 }],
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(body));

    const result = await api.adminGetActivitySummary({
      from: '2026-08-01T00:00:00Z',
      to: '2026-08-08T00:00:00Z',
      bucket: 'day',
    });

    const [url] = vi.mocked(fetch).mock.calls[0]!;
    const requestUrl = new URL(String(url), 'http://localhost');
    expect(requestUrl.pathname).toBe('/api/v1/admin/activity/summary');
    expect(requestUrl.searchParams.get('from')).toBe('2026-08-01T00:00:00Z');
    expect(requestUrl.searchParams.get('to')).toBe('2026-08-08T00:00:00Z');
    expect(requestUrl.searchParams.get('bucket')).toBe('day');
    expect(result).toEqual(body);
  });

  it('omits bucket from the query when not given', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ from: 'a', to: 'b', bucket: 'day', buckets: [] }),
    );

    await api.adminGetActivitySummary({ from: 'a', to: 'b' });

    const [url] = vi.mocked(fetch).mock.calls[0]!;
    const requestUrl = new URL(String(url), 'http://localhost');
    expect(requestUrl.searchParams.has('bucket')).toBe(false);
  });

  it('throws ApiError with the problem detail on a 400 range-validation failure', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ title: 'Bad Request', detail: 'Range exceeds 92 days for bucket=day.' }, 400),
    );

    await expect(
      api.adminGetActivitySummary({ from: '2026-01-01T00:00:00Z', to: '2026-08-01T00:00:00Z' }),
    ).rejects.toMatchObject(new ApiError(400, { detail: 'Range exceeds 92 days for bucket=day.' }));
  });
});

describe('api.adminListActivityUsers', () => {
  it('sends paging/sort params and parses a page including a never-tracked user', async () => {
    const body: PagedAdminActivityUsersResponse = {
      items: [
        { userId: 'u1', userName: 'ragnar', displayName: 'Ragnar', lastActiveAtUtc: '2026-08-20T10:00:00Z' },
        { userId: 'u2', userName: 'freydis', displayName: null, lastActiveAtUtc: null },
      ],
      totalCount: 2,
      page: 1,
      pageSize: 25,
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(body));

    const result = await api.adminListActivityUsers({ page: 1, pageSize: 25, sort: 'lastActive' });

    const [url] = vi.mocked(fetch).mock.calls[0]!;
    const requestUrl = new URL(String(url), 'http://localhost');
    expect(requestUrl.pathname).toBe('/api/v1/admin/activity/users');
    expect(requestUrl.searchParams.get('page')).toBe('1');
    expect(requestUrl.searchParams.get('pageSize')).toBe('25');
    expect(requestUrl.searchParams.get('sort')).toBe('lastActive');
    expect(result.items[1]!.lastActiveAtUtc).toBeNull();
    expect(result).toEqual(body);
  });

  it('requests with no query string when called with no params', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [], totalCount: 0, page: 1, pageSize: 25 }));

    await api.adminListActivityUsers();

    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe('/api/v1/admin/activity/users');
  });
});

describe('api.adminGetUserActivityDetail', () => {
  it('sends from/to and returns session windows plus the raw TimeSpan string', async () => {
    const body: AdminUserActivityDetailResponse = {
      userId: 'u1',
      from: '2026-08-01T00:00:00Z',
      to: '2026-08-08T00:00:00Z',
      sessionCount: 1,
      totalActiveDuration: '1.02:03:04.5000000',
      sessions: [{ startedAtUtc: '2026-08-01T09:00:00Z', lastSeenAtUtc: '2026-08-01T09:30:00Z' }],
    };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(body));

    const result = await api.adminGetUserActivityDetail('u1', {
      from: '2026-08-01T00:00:00Z',
      to: '2026-08-08T00:00:00Z',
    });

    const [url] = vi.mocked(fetch).mock.calls[0]!;
    const requestUrl = new URL(String(url), 'http://localhost');
    expect(requestUrl.pathname).toBe('/api/v1/admin/activity/users/u1');
    expect(requestUrl.searchParams.get('from')).toBe('2026-08-01T00:00:00Z');
    expect(requestUrl.searchParams.get('to')).toBe('2026-08-08T00:00:00Z');
    // Passed through verbatim — parsing/formatting is the view's job, not the client's.
    expect(result.totalActiveDuration).toBe('1.02:03:04.5000000');
    expect(result).toEqual(body);
  });

  it('throws ApiError on a 404 for an unknown user', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ title: 'Not Found' }, 404));

    await expect(
      api.adminGetUserActivityDetail('missing', { from: '2026-08-01T00:00:00Z', to: '2026-08-08T00:00:00Z' }),
    ).rejects.toThrow(ApiError);
  });
});
