// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('antialiasPreference', () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('defaults to on when nothing is stored', async () => {
    const { antialiasPreference } = await import('./antialiasPreference');
    expect(antialiasPreference.setting).toBe('on');
    expect(antialiasPreference.enabled).toBe(true);
  });

  it('reads a stored off at load, so the next mount creates the canvas without MSAA', async () => {
    localStorage.setItem('bjarnoy.antialias', 'off');
    const { antialiasPreference } = await import('./antialiasPreference');
    expect(antialiasPreference.enabled).toBe(false);
  });

  it('treats an unknown stored value as the default', async () => {
    localStorage.setItem('bjarnoy.antialias', 'sometimes');
    const { antialiasPreference } = await import('./antialiasPreference');
    expect(antialiasPreference.setting).toBe('on');
  });

  it('persists a change', async () => {
    const { antialiasPreference } = await import('./antialiasPreference');
    antialiasPreference.setting = 'off';
    expect(localStorage.getItem('bjarnoy.antialias')).toBe('off');
    expect(antialiasPreference.enabled).toBe(false);
  });
});
