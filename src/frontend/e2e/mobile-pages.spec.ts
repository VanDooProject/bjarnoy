import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { MAP_SPEC_TIMEOUT_MS } from './budgets';
import { AdminActivityPage, SettlementPage } from './pages';
import { layoutOverflow, openRingOnGuidedHex } from './helpers';

// Second mobile-readiness sweep (after mobile.spec.ts): defects found by
// walking every page at phone sizes, portrait and landscape. The desktop
// suite's fixed 1280x800 viewport can't see any of them.
const PHONE = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };

async function expectFullyInViewport(page: Page, locator: Locator, what: string): Promise<void> {
  const box = (await locator.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box, `${what}: not rendered`).not.toBeNull();
  expect(box.x, `${what}: past the left edge`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${what}: past the right edge`).toBeLessThanOrEqual(viewport.width + 1);
}

async function mockAdminActivity(page: Page): Promise<AdminActivityPage> {
  const activity = new AdminActivityPage(page);
  await activity.mockApi({
    buckets: [{ bucketStart: '2026-08-29T00:00:00Z', activeUserCount: 1 }],
    users: Array.from({ length: 5 }, (_, i) => ({
      userId: `user-${i}`,
      userName: `a-rather-long-player-name-${i}`,
      displayName: `Player with a long display name ${i}`,
      lastActiveAtUtc: new Date(Date.now() - i * 60_000).toISOString(),
    })),
  });
  return activity;
}

for (const [name, viewport] of [
  ['portrait', PHONE],
  ['landscape', PHONE_LANDSCAPE],
] as const) {
  test.describe(`admin shell on a phone, ${name}`, { tag: '@g2' }, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    // The admin header was one row (brand, seven tabs, world picker,
    // account): on a phone the picker and "Log out" sat past the right
    // edge with no way to reach them, and a wide table dragged the whole
    // page sideways with it.
    test('keeps "Log out" and every tab reachable, and wide tables scroll on their own', async ({ page, adminAuth }) => {
      await adminAuth.login();
      const activity = await mockAdminActivity(page);
      await activity.goto();
      await expect(activity.userRows).toHaveCount(5);

      await expectFullyInViewport(page, page.getByRole('button', { name: 'Log out' }), 'Log out');
      const { pageScrollsSideways, offscreen } = await layoutOverflow(page);
      expect(pageScrollsSideways).toBe(false);
      expect(offscreen).toEqual([]);

      const tools = page.getByRole('link', { name: 'Tools' });
      await tools.scrollIntoViewIfNeeded();
      await expectFullyInViewport(page, tools, 'last tab');
      await tools.click();
      await expect(page).toHaveURL(/\/admin\/island-lab$/);
      await expectFullyInViewport(page, page.getByRole('button', { name: 'Log out' }), 'Log out after switching tabs');
    });
  });
}

test.describe('ring menu labels on a phone', { tag: '@g2' }, () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

  // A long single word used to split mid-word inside its bubble
  // ("Watchtowe" / "r"), and the hub's "GRASSLAND"/"LONGHOUSE" ran past the
  // round edge; the label size now shrinks to fit the longest word.
  test('no bubble splits a word across lines or runs past its own edge', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.openLanding(page);
    await settlement.claimLandfall();
    await openRingOnGuidedHex(settlement);
    // the long single word the bug was found on must be on screen, or the check below proves nothing
    await expect(settlement.ring.bubbles.filter({ hasText: 'Watchtower' })).toBeVisible();

    const broken = await page.locator('.ring-hub, .ring-bubble').evaluateAll((els) =>
      els.flatMap((el) => {
        const box = el.getBoundingClientRect();
        const problems: string[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? '';
          for (const match of text.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(node, match.index!);
            range.setEnd(node, match.index! + match[0].length);
            const rects = [...range.getClientRects()];
            if (rects.length > 1) problems.push(`"${match[0]}" split across lines`);
            for (const r of rects) {
              if (r.left < box.left - 1 || r.right > box.right + 1) problems.push(`"${match[0]}" runs past its bubble`);
            }
          }
        }
        return problems;
      }),
    );
    expect(broken).toEqual([]);
  });
});

test.describe('touch wording on a phone', { tag: '@g2' }, () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  // The onboarding told a phone player to "Click this plot" / "Click an
  // empty hex"; a touch screen gets "Tap" instead.
  test('the onboarding says tap, not click, on a touch screen', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.openLanding(page);
    await expect(settlement.guidancePointer).toContainText('Tap this plot');
    await expect(settlement.checklist).toContainText('Tap your plot to place it');
    await settlement.claimLandfall();
    await expect(settlement.checklist).toContainText('Tap an empty hex in your border');
    await expect(page.locator('#app')).not.toContainText(/click/i);
  });
});

test.describe('account pages on a phone', { tag: '@g2' }, () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  // The phone tap-target rule made both footer links inline, so the short
  // "Already have an account? Log in" ran straight into "← Back".
  for (const path of ['/register', '/login']) {
    test(`${path}: the account link and "Back" sit on their own lines`, async ({ page }) => {
      await page.goto(path);
      const link = page.locator('main button.link');
      const back = page.locator('main button.back');
      const linkBox = (await link.boundingBox())!;
      const backBox = (await back.boundingBox())!;
      expect(backBox.y).toBeGreaterThanOrEqual(linkBox.y + linkBox.height - 1);
    });
  }
});

test.describe('messages on a phone', { tag: '@g2' }, () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  // /messages had no link back into the game at all, and a conversation
  // that failed to load dropped its "Back to messages" with the rest of the
  // thread — dead ends on a phone with no browser back button on screen.
  test('the inbox and a failed conversation both offer a way back', async ({ page, adminAuth }) => {
    await adminAuth.loginAsPlayer('e2e-player');
    await page.goto('/messages/someone-else');
    const toInbox = page.getByRole('link', { name: 'Back to messages' });
    await expectFullyInViewport(page, toInbox, 'Back to messages');
    await toInbox.click();
    await expect(page).toHaveURL(/\/messages$/);

    const toGame = page.getByRole('link', { name: '← Back' });
    await expectFullyInViewport(page, toGame, 'Back to the game');
    await toGame.click();
    await expect(page).not.toHaveURL(/\/messages/);
  });
});

test.describe('docs top bar on a phone', { tag: '@g2' }, () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  // The compact bar ellipsised "I already have a realm" to "I already hav…";
  // it shows the short "Log in" there instead, in full.
  test('the returning-player trigger reads in full', async ({ page }) => {
    await page.goto('/docs');
    const main = page.locator('.hud-bar [data-testid="returning-player-trigger"] .trigger-main:visible');
    await expect(main).toHaveText('Log in');
    expect(await main.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  });
});
