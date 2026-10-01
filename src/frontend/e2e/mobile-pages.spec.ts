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

test.describe('landscape phone gets the phone HUD', { tag: '@g2' }, () => {
  test.use({ viewport: PHONE_LANDSCAPE, hasTouch: true, isMobile: true });

  // 844px is wider than the phone breakpoint, so a phone held sideways got
  // the desktop header (clipped resource bar), the ArmyPanel over a ~320px
  // tall map, and a completion banner whose "Enter your settlement" sat
  // under the profile nudge — found() clicks that CTA, so it must be
  // reachable for this to even get to the settlement.
  test('founding completes and the settlement shows the compact bar, not the desktop panels', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);
    await expect(page.locator('.hud-grip')).toBeVisible();
    await expect(page.locator('.army-panel')).toHaveCount(0);
    const { pageScrollsSideways, offscreen } = await layoutOverflow(page);
    expect(pageScrollsSideways).toBe(false);
    expect(offscreen).toEqual([]);
  });
});

// Landscape rail HUD: on a short landscape phone the full-width top bar (and
// its pull-down drawer) is replaced by a column of floating bubbles at the
// top-left — the ☰ button, then one pill per resource — and the drawer opens
// as a side sheet from the left. The settlement bubble moves to the right of
// the rail; nothing of the HUD may span the top edge any more.
test.describe('landscape rail HUD', { tag: '@g2' }, () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  async function box(locator: Locator, what: string) {
    const b = await locator.boundingBox();
    expect(b, `${what}: not rendered`).not.toBeNull();
    return b!;
  }

  test('is a left column of stacked bubbles with a side-sheet drawer, and nothing spans the top edge', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);
    const viewport = page.viewportSize()!;

    // The toggle: first in the column, at the far left.
    const grip = page.locator('.hud-grip');
    await expect(grip).toBeVisible();
    const gripBox = await box(grip, 'grip');
    expect(gripBox.x + gripBox.width).toBeLessThanOrEqual(64);

    // The pills: stacked, same x, strictly increasing y, below the grip.
    const pills = page.locator('.resource-bar .resource--compact');
    await expect(pills.first()).toBeVisible();
    const pillBoxes = [];
    for (let i = 0; i < (await pills.count()); i++) pillBoxes.push(await box(pills.nth(i), `pill ${i}`));
    expect(pillBoxes.length).toBeGreaterThanOrEqual(4);
    for (const [i, b] of pillBoxes.entries()) {
      expect(Math.abs(b.x - pillBoxes[0].x), `pill ${i} x`).toBeLessThanOrEqual(2);
      expect(b.x + b.width, `pill ${i} stays in the left column`).toBeLessThanOrEqual(120);
      if (i > 0) expect(b.y, `pill ${i} below pill ${i - 1}`).toBeGreaterThan(pillBoxes[i - 1].y + pillBoxes[i - 1].height - 1);
    }
    expect(pillBoxes[0].y).toBeGreaterThanOrEqual(gripBox.y + gripBox.height - 1);

    // Nothing of the HUD is a bar across the top.
    for (const selector of ['.hud-bar', '.resource-bar', '.settlement-bubble']) {
      const el = page.locator(selector).first();
      if (await el.isVisible()) {
        const b = await box(el, selector);
        expect(b.width, `${selector} spans the top edge`).toBeLessThanOrEqual(viewport.width * 0.5);
      }
    }

    // The menu button and the settlement name are one capsule at the top-left:
    // the button sits inside the bubble's left end.
    const bubble = page.locator('.settlement-bubble');
    await expect(bubble).toBeVisible();
    const bubbleBox = await box(bubble, 'settlement bubble');
    expect(gripBox.x).toBeGreaterThanOrEqual(bubbleBox.x - 1);
    expect(gripBox.x + gripBox.width).toBeLessThanOrEqual(bubbleBox.x + bubbleBox.width);
    expect(Math.abs(gripBox.y + gripBox.height / 2 - (bubbleBox.y + bubbleBox.height / 2))).toBeLessThanOrEqual(2);

    // The quest card is a round quest button on a phone until tapped.
    await expect(page.getByTestId('quest-tray')).toHaveCount(0);
    const questToggle = page.getByTestId('quest-toggle');
    await expect(questToggle).toBeVisible();
    const questBox = await box(questToggle, 'quest button');
    expect(questBox.width).toBeLessThanOrEqual(48);

    // Tapping the toggle opens the drawer as a left side sheet with the nav in it.
    await grip.tap();
    const drawer = page.locator('.hud-drawer');
    await expect(grip).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer.locator('.drawer-links')).toBeVisible();
    await expect.poll(async () => (await box(drawer, 'drawer')).x).toBeLessThanOrEqual(1);
    const drawerBox = await box(drawer, 'drawer');
    expect(drawerBox.width).toBeLessThanOrEqual(300 + 1);
    expect(drawerBox.height).toBeGreaterThanOrEqual(viewport.height - 1);
    // The rail's pills do not turn into the expanded layout while it is open.
    await expect(page.locator('.resource-bar.expanded')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(grip).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer.locator('.drawer-links')).toBeHidden();

    const { pageScrollsSideways, offscreen } = await layoutOverflow(page);
    expect(pageScrollsSideways).toBe(false);
    expect(offscreen).toEqual([]);
  });

  test('a tap outside the open side sheet closes it', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.found(page);
    const grip = page.locator('.hud-grip');
    await grip.tap();
    await expect(grip).toHaveAttribute('aria-expanded', 'true');
    await page.mouse.click(page.viewportSize()!.width - 20, page.viewportSize()!.height / 2);
    await expect(grip).toHaveAttribute('aria-expanded', 'false');
  });

  // Right after founding the "Name your jarl" bubble floats in the top-right
  // corner (it used to sit in the rail, its nudge hanging past the left
  // screen edge and over the completion banner).
  test('the account nudge stays on screen and clear of the completion banner', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.openLanding(page);
    await settlement.claimLandfall();
    await settlement.placeGuidedBuildings();
    const nudge = settlement.profileNudge;
    await expect(nudge).toBeVisible();
    await expectFullyInViewport(page, nudge, 'profile nudge');
    const trigger = await box(page.getByTestId('returning-player-trigger'), 'jarl trigger');
    expect(trigger.x + trigger.width, 'jarl trigger in the top-right corner').toBeGreaterThan(page.viewportSize()!.width - 24);
    expect(trigger.y).toBeLessThan(24);
    const banner = settlement.banner.filter({ has: settlement.continueButton });
    await expect(banner).toBeVisible();
    const a = await box(nudge, 'nudge');
    const b = await box(banner, 'completion banner');
    const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlaps, 'nudge covers the completion banner').toBe(false);
  });

  // The landfall banner was a full-width card and the slim checklist floated
  // 44px above the bottom edge (room for a footer that is hidden here).
  test('the landfall banner is a compact pill and the checklist sits in the corner', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    const settlement = await SettlementPage.openLanding(page);
    await settlement.claimLandfall();
    const viewport = page.viewportSize()!;
    const banner = await box(settlement.banner.first(), 'landfall banner');
    expect(banner.height, 'one line').toBeLessThanOrEqual(48);
    expect(banner.width).toBeLessThan(viewport.width * 0.7);
    const tray = await box(settlement.checklist, 'checklist');
    expect(viewport.height - (tray.y + tray.height), 'checklist bottom gap').toBeLessThanOrEqual(16);
    expect(viewport.width - (tray.x + tray.width), 'checklist right gap').toBeLessThanOrEqual(16);
  });

  test.describe('at 667x375', () => {
    test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

    // The "Now build here" chip used to land on the landfall banner here.
    test('the guidance chip stays below the landfall banner', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      const settlement = await SettlementPage.openLanding(page);
      await settlement.claimLandfall();
      const banner = settlement.banner.first();
      await expect(banner).toBeVisible();
      const chip = settlement.guidancePointer.locator('.chip');
      await expect(chip).toBeVisible();
      await expect
        .poll(async () => (await box(chip, 'chip')).y - ((await box(banner, 'banner')).y + (await box(banner, 'banner')).height))
        .toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('on a taller phone', () => {
    test.use({ viewport: { width: 932, height: 430 }, hasTouch: true, isMobile: true });

    test('each pill shows the stock and, under it, the rate', async ({ page }) => {
      test.setTimeout(MAP_SPEC_TIMEOUT_MS);
      await SettlementPage.found(page);
      const pills = page.locator('.resource-bar .resource--compact');
      await expect(pills.first()).toBeVisible();
      const count = await pills.count();
      expect(count).toBeGreaterThanOrEqual(4);
      for (let i = 0; i < count; i++) {
        const pill = pills.nth(i);
        await expect(pill.locator('.value-compact')).toHaveCount(2);
        await expect(pill.locator('.value-line2')).toContainText('/h');
        const lines = await pill.locator('.value-compact').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
        expect(lines[1], `pill ${i}: rate under the stock`).toBeGreaterThan(lines[0]);
      }
      // A tap swaps only the second line to the cap.
      await pills.first().tap();
      await expect(pills.first().locator('.value-line2')).toContainText('/');
      await expect(pills.first().locator('.value-line2')).not.toContainText('/h');
      const { offscreen } = await layoutOverflow(page);
      expect(offscreen).toEqual([]);
    });
  });
});

test.describe('demo tag on a phone', { tag: '@g2' }, () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  // Demo mode is local development only; on a phone it is a small "Demo"
  // tag in the bottom-left corner, not a pill competing with the HUD rows —
  // and it must not sit on the landing page's own footer line either.
  test('is a short tag in the bottom-left corner, clear of the landing footer', async ({ page }) => {
    test.setTimeout(MAP_SPEC_TIMEOUT_MS);
    await SettlementPage.openLanding(page);
    const tag = page.locator('.demo-badge');
    await expect(tag).toHaveText(/^demo$/i);
    const box = (await tag.boundingBox())!;
    expect(box.x).toBeLessThan(8);
    expect(box.y + box.height).toBeGreaterThan(PHONE.height - 8);
    const footerText = page.locator('.footer > span').first();
    const footerBox = (await footerText.boundingBox())!;
    expect(box.y, 'demo tag overlaps the footer text').toBeGreaterThanOrEqual(footerBox.y + footerBox.height);
  });
});
