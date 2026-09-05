import { expect, type Locator, type Page } from '@playwright/test';
import { AdminTablePage } from './AdminTablePage';

/**
 * `/admin/settlements` — the settlements list plus the god-mode detail panel
 * behind its "Manage" button (issue #105) and the resource grant form
 * (issue #98).
 *
 * `hex(q, r)` is the third of issue #189's duplicated raw selectors:
 * `polygon[data-hex="q,r"]`, the SVG grid the graphical settlement editor
 * draws, spelled out four times across admin-god-mode.spec.ts.
 */
export class AdminSettlementsPage {
  readonly list: AdminTablePage;
  /** The graphical editor's per-hex form. */
  readonly hexForm: Locator;
  /** The troop-creation form under the editor. */
  readonly garrisonForm: Locator;
  /** The in-the-field army editor. */
  readonly armyEditor: Locator;
  /** The resource grant form (issue #98). */
  readonly grantForm: Locator;
  /** The detail panel's resource read-out, "Wood 750 / 750". */
  readonly stocks: Locator;
  /** The notice shown when a grant was truncated by storage capacity. */
  readonly clampNotice: Locator;
  /** The "Instant build (n queued)" button. */
  readonly instantBuild: Locator;

  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.list = new AdminTablePage(page);
    this.hexForm = page.locator('.hex-form');
    this.garrisonForm = page.locator('.garrison-form');
    this.armyEditor = page.locator('.army-editor');
    this.grantForm = page.locator('.grant-form');
    this.stocks = page.locator('.stocks');
    this.clampNotice = page.locator('.clamp-notice');
    this.instantBuild = page.locator('button.insta');
  }

  /** Navigates to the settlements list. */
  async goto(): Promise<void> {
    await this.page.goto('/admin/settlements');
  }

  /** Opens the god-mode detail panel for the first listed settlement. */
  async openManagePanel(): Promise<void> {
    await this.goto();
    await this.page.getByRole('button', { name: 'Manage' }).click();
    await expect(this.page.getByText('Settlement editor')).toBeVisible();
  }

  /** One hex of the graphical editor's SVG grid. */
  hex(q: number, r: number): Locator {
    return this.page.locator(`polygon[data-hex="${q},${r}"]`);
  }
}
