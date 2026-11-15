import { expect, test } from './fixtures';
import { REGISTER_PLAYER_ID, RegisterPage } from './pages';

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

test('register creates an account, claims the local settlement id, and logs in', { tag: '@g2' }, async ({ page }) => {
  await RegisterPage.seedPlayerId(page);

  // Redirect target set to /leaderboards. Leaderboards now opens as a
  // modal over whatever page was showing before (App.vue's modal-route
  // pattern), so this does still mount the settlement-fallback
  // HexMapRenderer underneath (same as the default '/') — but the
  // assertions below are all about the register flow's own request/
  // response wiring and the modal's URL, not the map underneath it.
  const register = await RegisterPage.openRegister(page, '/leaderboards');
  await register.mockRegister();
  await register.fill('newjarl', 'correct horse battery', 'correct horse battery');
  await register.submit();

  await expect(page).toHaveURL(/\/leaderboards$/);

  expect(register.request).toEqual({
    userName: 'newjarl',
    password: 'correct horse battery',
    existingOwnerId: REGISTER_PLAYER_ID,
  });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('bjarnoy.refreshToken')))
    .toBe('e2e-refresh-token');
});

test('register catches a mismatched confirmation before sending a request', { tag: '@g2' }, async ({ page }) => {
  await RegisterPage.seedPlayerId(page);
  const register = await RegisterPage.openRegister(page);
  await register.mockRegister();
  await register.fill('newjarl', 'correct horse battery', 'does not match');
  await register.submit();

  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  expect(register.request).toBeUndefined();
});

test('login and register link to each other', { tag: '@g2' }, async ({ page }) => {
  const login = await RegisterPage.openLogin(page);
  await login.toRegisterLink.click();
  await expect(page).toHaveURL(/\/register$/);

  await login.toLoginLink.click();
  await expect(page).toHaveURL(/\/login$/);
});
