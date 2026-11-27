import { expect, test } from './fixtures';

test('an unknown URL shows the not-found page with a way back to the start', async ({ page }) => {
  await page.goto('/does-not-exist');
  const notFound = page.getByTestId('not-found');
  await expect(notFound).toBeVisible();
  await expect(notFound.getByRole('heading', { level: 1 })).toBeVisible();

  await notFound.getByRole('link').click();
  await expect(page.getByTestId('not-found')).toHaveCount(0);
  expect(new URL(page.url()).pathname).not.toBe('/does-not-exist');
});
