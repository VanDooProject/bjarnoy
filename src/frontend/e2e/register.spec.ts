import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Issue #108: the anon->permanent account flow. Runs against demo mode
 * (`vite preview` with no backend — see playwright.config.ts and
 * leaderboard.spec.ts's identical note), so `/auth/register` is mocked with
 * `page.route` rather than hitting a real database — the endpoint itself is
 * covered end to end by `Bjarnoy.Api.IntegrationTests/AuthEndpointsTests`.
 * This spec's job is the UI's own wiring: the request it sends, and how it
 * reacts to what comes back.
 *
 * Doesn't cover the taken-username (409) response: fixtures.ts's
 * `forbidConsoleErrors` fails a test on any console error, and Chromium
 * itself logs a "Failed to load resource" console error for any non-2xx
 * response regardless of app code — there's no way to mock an HTTP error
 * status here without tripping that unrelated to app behavior. The 409
 * path is covered by AuthEndpointsTests and RegisterView's own error
 * branch is straightforward enough to review directly.
 */

const PLAYER_ID = 'player_11111111-1111-1111-1111-111111111111';

const REGISTERED_USER = { id: 'u-1', userName: 'newjarl', role: 'player', status: 'active', displayName: null };

async function seedPlayerId(page: Page) {
  await page.addInitScript((id) => localStorage.setItem('bjarnoy.playerId', id), PLAYER_ID);
}

test('register creates an account, claims the local settlement id, and logs in', async ({ page }) => {
  await seedPlayerId(page);

  let requestBody: { userName: string; password: string; existingOwnerId: string | null } | undefined;
  await page.route('**/api/v1/auth/register', (route: Route) => {
    requestBody = route.request().postDataJSON();
    return route.fulfill({
      json: { accessToken: 'e2e-access-token', refreshToken: 'e2e-refresh-token', user: REGISTERED_USER },
    });
  });

  // Redirect target set to /leaderboards (a route with no map/canvas
  // rendering, unlike the default '/') so this test stays about the
  // register flow's own request/response wiring rather than incidentally
  // depending on the HexMapRenderer/vendor texture pack that '/' pulls in.
  await page.goto('/register?redirect=%2Fleaderboards');
  await page.getByLabel('Username').fill('newjarl');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByLabel('Confirm password').fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/leaderboards$/);

  expect(requestBody).toEqual({
    userName: 'newjarl',
    password: 'correct horse battery',
    existingOwnerId: PLAYER_ID,
  });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('bjarnoy.refreshToken')))
    .toBe('e2e-refresh-token');
});

test('register catches a mismatched confirmation before sending a request', async ({ page }) => {
  await seedPlayerId(page);
  let requested = false;
  await page.route('**/api/v1/auth/register', (route: Route) => {
    requested = true;
    return route.fulfill({ json: { accessToken: 'x', refreshToken: 'y', user: REGISTERED_USER } });
  });

  await page.goto('/register');
  await page.getByLabel('Username').fill('newjarl');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByLabel('Confirm password').fill('does not match');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  expect(requested).toBe(false);
});

test('login and register link to each other', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Playing anonymously? Create an account' }).click();
  await expect(page).toHaveURL(/\/register$/);

  await page.getByRole('button', { name: 'Already have an account? Log in' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
