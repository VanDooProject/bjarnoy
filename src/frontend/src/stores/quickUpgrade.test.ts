import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './auth';
import { useQuickUpgradeStore } from './quickUpgrade';

function account(isPremium: boolean) {
  useAuthStore().user = { id: 'u1', userName: 'p', role: 'player', preferredLocale: null, isPremium } as never;
}

describe('quickUpgrade store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('a premium account: the mode and Shift both make it apply, only the mode is "active"', () => {
    account(true);
    const quick = useQuickUpgradeStore();
    expect(quick.applies).toBe(false);
    quick.setShift(true);
    expect(quick.applies).toBe(true);
    expect(quick.active).toBe(false);
    quick.setShift(false);
    quick.start();
    expect(quick.active).toBe(true);
    expect(quick.applies).toBe(true);
    quick.stop();
    expect(quick.on).toBe(false);
    expect(quick.applies).toBe(false);
  });

  it('a free account: start does nothing and a held Shift never applies', () => {
    account(false);
    const quick = useQuickUpgradeStore();
    quick.start();
    expect(quick.on).toBe(false);
    quick.setShift(true);
    expect(quick.available).toBe(false);
    expect(quick.applies).toBe(false);
    expect(quick.active).toBe(false);
  });

  it('an account that loses premium while the mode is on no longer has it active', () => {
    account(true);
    const quick = useQuickUpgradeStore();
    quick.start();
    useAuthStore().user = { ...useAuthStore().user!, isPremium: false };
    expect(quick.active).toBe(false);
    expect(quick.applies).toBe(false);
  });
});
