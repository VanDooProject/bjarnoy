import { test as base, expect } from '@playwright/test';

/**
 * Every e2e test should fail on an uncaught page error or a `console.error`
 * call, not just the handful of tests that happened to add their own
 * `page.on('pageerror', ...)` listener — a red console line is exactly how
 * bugs like a swallowed 409 from `bootstrapLiveWorld` surface in practice
 * (the UI itself just quietly does nothing). This autouse fixture wires that
 * check into every test in the suite instead of leaving it opt-in per file.
 */
// Sandbox/CI proxy noise: a resource request occasionally gets reset by the
// outbound proxy sitting in front of this environment, independent of any
// app code — reproduces even on unmodified, previously-green specs. It's
// not a real bug, so it shouldn't fail every test that happens to hit it;
// everything else still fails the run.
const isEnvironmentNoise = (text: string) => text.includes('net::ERR_CONNECTION_RESET');

export const test = base.extend<{ forbidConsoleErrors: void }>({
  forbidConsoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !isEnvironmentNoise(msg.text())) errors.push(msg.text());
      });

      await use();

      expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
