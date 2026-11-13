import { expect, test } from '../fixtures';
import { DocsPage, LandingPage, LeaderboardPage, MessagesPage, RegisterPage, scoreEntry } from '../pages';
import { expectScreen, freezeClock } from './screen';

test.use({ mapLayers: { water: false, fog: false }, mapMotion: { hud: 'off' } });

test.beforeEach(async ({ page }) => {
  await freezeClock(page);
});

test('landing', async ({ page }) => {
  await LandingPage.open(page);
  await expectScreen(page, 'landing');
});

test('docs-hub', async ({ page }) => {
  await DocsPage.openHub(page);
  await expectScreen(page, 'docs-hub');
});

test('docs-tech-tree', async ({ page }) => {
  await DocsPage.openTechTree(page);
  await expectScreen(page, 'docs-tech-tree');
});

test('docs-tiles', async ({ page }) => {
  await DocsPage.openTiles(page);
  await expectScreen(page, 'docs-tiles');
});

test('login', async ({ page }) => {
  await RegisterPage.openLogin(page);
  await expectScreen(page, 'login');
});

test('register', async ({ page }) => {
  await RegisterPage.openRegister(page);
  await expectScreen(page, 'register');
});

test('register-mismatch', async ({ page }) => {
  // The one client-side refusal: the confirmation differs, so nothing is sent.
  const register = await RegisterPage.openRegister(page);
  await register.fill('newjarl', 'correct horse battery', 'does not match');
  await register.submit();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  await expectScreen(page, 'register-mismatch');
});

const THREAD = [
  { id: 'm1', mine: false, body: 'Longhouse is up. Can you spare some wood for the palisade?', sentAt: '2026-05-30T09:15:00Z' },
  { id: 'm2', mine: true, body: 'Sending two carts at dawn.', sentAt: '2026-05-30T09:40:00Z', readAt: '2026-05-30T10:05:00Z' },
  { id: 'm3', mine: false, body: 'Thank you, the wall will hold now.', sentAt: '2026-05-31T18:20:00Z' },
];

test('messages', async ({ page, adminAuth }) => {
  await adminAuth.loginAsPlayer('e2e-player');
  const messages = new MessagesPage(page);
  await messages.mockApi({ unread: 2, thread: THREAD });
  await messages.openList();
  await expectScreen(page, 'messages');
});

test('conversation', async ({ page, adminAuth }) => {
  await adminAuth.loginAsPlayer('e2e-player');
  const messages = new MessagesPage(page);
  await messages.mockApi({ unread: 0, thread: THREAD });
  await messages.openConversation();
  await expect(messages.bubbles).toHaveCount(THREAD.length);
  await expectScreen(page, 'conversation');
});

test('leaderboard', async ({ page, adminAuth }) => {
  // The player's own row (rank 1 is `user-1`) is marked; on a phone the first screen is the list of boards.
  await adminAuth.loginAsPlayer('e2e-player');
  const leaderboard = new LeaderboardPage(page);
  await leaderboard.mockApi({ first: { items: [scoreEntry(1), scoreEntry(2), scoreEntry(3)], nextAfterRank: null } });
  await leaderboard.goto();
  await expectScreen(page, 'leaderboard');
});

test('leaderboard-board', async ({ page, adminAuth }, testInfo) => {
  test.skip(testInfo.project.name !== 'visual-phone', 'phone-only surface: on desktop the board is already the first screen');
  await adminAuth.loginAsPlayer('e2e-player');
  const leaderboard = new LeaderboardPage(page);
  await leaderboard.mockApi({ first: { items: [scoreEntry(1), scoreEntry(2), scoreEntry(3)], nextAfterRank: null } });
  await leaderboard.goto();
  await leaderboard.firstScoreBoard.click();
  await expect(page.getByText('Player 2')).toBeVisible();
  await expectScreen(page, 'leaderboard-board');
});
