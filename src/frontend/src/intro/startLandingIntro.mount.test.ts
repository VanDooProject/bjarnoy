// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';

vi.mock('./fogTexture', () => ({ introFogUrl: () => 'data:image/png;base64,' }));

import { mountLandingIntro } from './startLandingIntro';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('mountLandingIntro', () => {
  it('mounts on its own root and Esc removes it at once, without an exit phase', async () => {
    const phases: string[] = [];
    mountLandingIntro();
    const root = () => document.querySelector('[data-testid="landing-intro"]');
    new MutationObserver(() => {
      const p = root()?.getAttribute('data-phase');
      if (p && phases[phases.length - 1] !== p) phases.push(p);
    }).observe(document.body, { subtree: true, attributes: true, childList: true });
    expect(root()).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(root()).toBeNull();
    expect(document.getElementById('landing-intro')).toBeNull();
    expect(phases).not.toContain('exiting');
  });
});
