import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import { loginTestUser } from './helpers';

/**
 * Demo mode has no backend behind it (see playwright.config.ts's webServer),
 * so `/api/v1/notifications/*` is mocked with `page.route` — the endpoints
 * themselves are covered end to end by
 * `Bjarnoy.Api.IntegrationTests/NotificationEndpointsTests`. This spec is
 * the settings page's own click -> subscribe -> PUT -> "on" state wiring.
 *
 * Chromium has no reachable push service in CI, and none is needed to test
 * this UI flow: `PushManager.prototype.subscribe`/`getSubscription` are
 * stubbed to return a fixed fake `PushSubscription`, and
 * `context.grantPermissions(['notifications'])` makes
 * `Notification.requestPermission()` resolve to `granted` without a real
 * permission prompt. The real, project-served `/sw.js` still registers
 * (verified separately in landing.spec.ts) — only the Push API surface is
 * faked here.
 */

const VAPID_PUBLIC_KEY = 'BLVLvVQOdXPmaq0OBrafyLwaroPwrrnCJwZPNYk9K872OaZH3cHl1ETnpKlBwsczy_gCrrdxBI_clksPtCGn-1g';
const FAKE_ENDPOINT = 'https://push.example/fake-endpoint';
const FAKE_SUBSCRIPTION_ID = 'sub-1';

async function stubPushManager(page: Page) {
  await page.addInitScript(
    ({ endpoint }) => {
      class FakePushSubscription {
        endpoint = endpoint;
        toJSON() {
          return { endpoint, keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' } };
        }
        unsubscribe() {
          return Promise.resolve(true);
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proto = (window as any).PushManager?.prototype;
      if (!proto) return;
      let subscribed: FakePushSubscription | null = null;
      proto.subscribe = () => {
        subscribed = new FakePushSubscription();
        return Promise.resolve(subscribed);
      };
      proto.getSubscription = () => Promise.resolve(subscribed);
    },
    { endpoint: FAKE_ENDPOINT },
  );
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['notifications']);
});

test('a logged-in player can enable push, sees the "on" state, and can send a test notification', async ({
  page,
}) => {
  await loginTestUser(page);
  await stubPushManager(page);

  await page.route('**/api/v1/notifications/config', (route: Route) =>
    route.fulfill({ json: { enabled: true, vapidPublicKey: VAPID_PUBLIC_KEY } }),
  );
  await page.route('**/api/v1/notifications/subscriptions', (route: Route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: [] });
    }
    if (route.request().method() === 'PUT') {
      return route.fulfill({
        status: 201,
        json: {
          id: FAKE_SUBSCRIPTION_ID,
          deviceLabel: 'Chrome on Linux',
          userAgent: null,
          createdAt: '2026-01-01T00:00:00Z',
          lastSeenAt: '2026-01-01T00:00:00Z',
          lastDeliveredAt: null,
        },
      });
    }
    return route.fallback();
  });

  let testNotificationRequested = false;
  await page.route(`**/api/v1/notifications/subscriptions/${FAKE_SUBSCRIPTION_ID}/test`, (route: Route) => {
    testNotificationRequested = true;
    return route.fulfill({ status: 202 });
  });

  await page.goto('/settings/notifications');

  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  // Temporary CI diagnostic (issue: PR #265's e2e run) — remove once the
  // root cause of the missing Enable button in CI (but not locally) is
  // confirmed.
  await page.waitForTimeout(2000);
  const diag = await page.evaluate(() => ({
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    hasServiceWorker: 'serviceWorker' in navigator,
    notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'n/a',
    bodyText: document.body.innerText,
  }));
  console.log('DIAG', JSON.stringify(diag));
  const enableButton = page.getByRole('button', { name: 'Enable notifications on this device' });
  await expect(enableButton).toBeVisible();
  await enableButton.click();

  await expect(page.getByText('Notifications are on for this device.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn off on this device' })).toBeVisible();

  await page.getByRole('button', { name: 'Send test notification' }).click();
  await expect(page.getByText('Test notification sent')).toBeVisible();
  expect(testNotificationRequested).toBe(true);
});

test('an anonymous visitor sees a create-account notice instead of the enable flow', async ({ page }) => {
  await page.goto('/settings/notifications');

  await expect(page.getByText('Create an account to receive notifications.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enable notifications on this device' })).toHaveCount(0);
});
