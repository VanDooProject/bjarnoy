import type { Locator, Page } from '@playwright/test';

/**
 * The shared `table.table` list rendering (issue #189's fourth duplicated
 * selector): the leaderboard board, the admin worlds/settlements lists and
 * the admin activity user list all render the same table shell, and four
 * specs each spelled `table.table tbody tr` / `tbody tr` / `tr.user-row` /
 * `tr.my-row` out by hand.
 *
 * Scoped by a root selector so a view with more than one table (or one
 * whose rows carry a marker class, like activity's `tr.user-row`) can still
 * name exactly the rows it means.
 */
export class AdminTablePage {
  /** The table itself — `toHaveCount(0)` on it is "no board is rendered at all". */
  readonly table: Locator;
  /** The table body. */
  readonly body: Locator;
  /** Every data row. */
  readonly rows: Locator;

  private readonly page: Page;

  constructor(page: Page, rootSelector = 'table.table') {
    this.page = page;
    this.table = page.locator(rootSelector);
    this.body = this.table.locator('tbody');
    this.rows = this.table.locator('tbody tr');
  }

  /** A row by the text it contains, e.g. a user name. */
  row(hasText: string): Locator {
    return this.rows.filter({ hasText });
  }

  /** The activity view's user rows, which carry their own marker class. */
  get userRows(): Locator {
    return this.page.locator('tr.user-row');
  }

  /** The leaderboard's "this is you" row. */
  get myRow(): Locator {
    return this.page.locator('tr.my-row');
  }
}
