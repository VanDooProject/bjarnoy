import type { Locator, Page, Route } from '@playwright/test';
import { ScrollableView } from './ScrollableView';

/** One row of `/admin/activity/users`, as the view expects it. */
export interface ActivityUser {
  userId: string;
  userName: string;
  displayName: string | null;
  lastActiveAtUtc: string;
}

/** One bar of `/admin/activity/summary`. */
export interface ActivityBucket {
  bucketStart: string;
  activeUserCount: number;
}

/**
 * `/admin/activity` — the aggregate chart plus the per-user last-active
 * table.
 *
 * Demo mode has no backend behind it (see playwright.config.ts's webServer),
 * so both specs that open this view mock its two endpoints; `mockApi` is the
 * shape they were each spelling out separately. It only takes the parts the
 * specs actually vary — the buckets and the user rows — and fills in the
 * envelope around them.
 */
export class AdminActivityPage {
  /** The per-user rows (`tr.user-row`). */
  readonly userRows: Locator;
  /** The chart's "No activity data" empty state. */
  readonly chartEmpty: Locator;
  /** The Chart.js canvas the summary data mounts. */
  readonly chartCanvas: Locator;
  /** The admin shell (`.admin`), which is the element that has to scroll. */
  readonly shell: ScrollableView;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.userRows = page.locator('tr.user-row');
    this.chartEmpty = page.locator('.activity-chart .empty');
    this.chartCanvas = page.locator('.canvas-wrap canvas');
    this.shell = new ScrollableView(page, '.admin');
  }

  /** Navigates straight to the activity view. */
  async goto(): Promise<void> {
    await this.page.goto('/admin/activity');
  }

  /**
   * Answers the two endpoints AdminActivityView calls, before the page ever
   * navigates. Routes registered up front apply to every later navigation.
   */
  async mockApi(data: { buckets: ActivityBucket[]; users: ActivityUser[] }): Promise<void> {
    await this.page.route('**/api/v1/admin/activity/summary*', (route: Route) =>
      route.fulfill({
        json: {
          from: '2026-08-22T00:00:00.000Z',
          to: '2026-08-29T23:59:59.999Z',
          bucket: 'day',
          buckets: data.buckets,
        },
      }),
    );
    // pageSize 25 mirrors AdminActivityView.vue's own page size.
    await this.page.route('**/api/v1/admin/activity/users*', (route: Route) =>
      route.fulfill({
        json: { items: data.users, totalCount: data.users.length, page: 1, pageSize: 25 },
      }),
    );
  }

  /** A row by user name. */
  userRow(userName: string): Locator {
    return this.userRows.filter({ hasText: userName });
  }
}
