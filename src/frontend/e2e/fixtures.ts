import { test as base, expect } from '@playwright/test';

/**
 * Every e2e test should fail on an uncaught page error or a `console.error`
 * call, not just the handful of tests that happened to add their own
 * `page.on('pageerror', ...)` listener — a red console line is exactly how
 * bugs like a swallowed 409 from `bootstrapLiveWorld` surface in practice
 * (the UI itself just quietly does nothing). This autouse fixture wires that
 * check into every test in the suite instead of leaving it opt-in per file.
 */
export const test = base.extend<{ forbidConsoleErrors: void }>({
  forbidConsoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await use();

      expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
