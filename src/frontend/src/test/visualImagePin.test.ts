// The visual baselines are only valid for one browser build: the pinned Playwright image must match the installed @playwright/test.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');

describe('visual regression image pin', () => {
  it('names the Playwright image of the installed @playwright/test version', () => {
    const { image } = JSON.parse(readFileSync(join(ROOT, 'e2e/visual/image.json'), 'utf8')) as { image: string };
    const { version } = JSON.parse(readFileSync(join(ROOT, 'node_modules/@playwright/test/package.json'), 'utf8')) as {
      version: string;
    };
    expect(image).toBe(`mcr.microsoft.com/playwright:v${version}-noble`);
  });
});
