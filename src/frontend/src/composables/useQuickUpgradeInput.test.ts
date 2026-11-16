// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useQuickUpgradeStore } from '../stores/quickUpgrade';
import { QUICK_UPGRADE_KEEP_ATTR, useQuickUpgradeInput } from './useQuickUpgradeInput';

// jsdom has no PointerEvent: a MouseEvent of the pointer type carries target and modifier.
function press(target: Element, init: MouseEventInit = {}) {
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...init }));
}

describe('useQuickUpgradeInput', () => {
  let wrapper: VueWrapper;
  let router: Router;
  const ringOpen = ref(false);
  const inSettlement = ref(true);
  const settlementId = ref<string | null>('s1');
  let map: HTMLElement;
  let chip: HTMLElement;
  let elsewhere: HTMLElement;

  beforeEach(async () => {
    setActivePinia(createPinia());
    useAuthStore().user = { id: 'u1', userName: 'p', role: 'player', preferredLocale: null, isPremium: true } as never;
    ringOpen.value = false;
    inSettlement.value = true;
    settlementId.value = 's1';
    map = document.createElement('div');
    chip = document.createElement('div');
    chip.setAttribute(QUICK_UPGRADE_KEEP_ATTR, '');
    const chipInner = document.createElement('button');
    chip.append(chipInner);
    elsewhere = document.createElement('div');
    document.body.append(map, chip, elsewhere);
    router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });
    await router.push('/settlement');
    const Harness = defineComponent({
      setup() {
        useQuickUpgradeInput({
          mapElement: () => map,
          ringOpen: () => ringOpen.value,
          inSettlement: () => inSettlement.value,
          settlementId: () => settlementId.value,
        });
        return () => h('div');
      },
    });
    wrapper = mount(Harness, { global: { plugins: [router] } });
  });
  afterEach(() => {
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  const key = (type: 'keydown' | 'keyup', k: string) => window.dispatchEvent(new KeyboardEvent(type, { key: k }));

  it('tracks Shift down and up, and drops it when the window loses focus', () => {
    const quick = useQuickUpgradeStore();
    key('keydown', 'Shift');
    expect(quick.shiftHeld).toBe(true);
    key('keyup', 'Shift');
    expect(quick.shiftHeld).toBe(false);
    key('keydown', 'Shift');
    window.dispatchEvent(new Event('blur'));
    expect(quick.shiftHeld).toBe(false);
  });

  it('a press reports the real Shift state even when the key-down was missed', () => {
    const quick = useQuickUpgradeStore();
    press(map, { shiftKey: true });
    expect(quick.shiftHeld).toBe(true);
    press(map, { shiftKey: false });
    expect(quick.shiftHeld).toBe(false);
  });

  it('a press outside the map ends the mode, a press on the map or on a kept element does not', () => {
    const quick = useQuickUpgradeStore();
    quick.start();
    press(map);
    expect(quick.on).toBe(true);
    press(chip.firstElementChild!);
    expect(quick.on).toBe(true);
    press(elsewhere);
    expect(quick.on).toBe(false);
  });

  it('Esc ends the mode, unless the ring is open (the ring handles that Esc itself)', () => {
    const quick = useQuickUpgradeStore();
    quick.start();
    ringOpen.value = true;
    key('keydown', 'Escape');
    expect(quick.on).toBe(true);
    ringOpen.value = false;
    key('keydown', 'Escape');
    expect(quick.on).toBe(false);
  });

  it('leaving the settlement view, switching the settlement or any route change ends the mode', async () => {
    const quick = useQuickUpgradeStore();
    quick.start();
    inSettlement.value = false;
    await wrapper.vm.$nextTick();
    expect(quick.on).toBe(false);

    quick.start();
    settlementId.value = 's2';
    await wrapper.vm.$nextTick();
    expect(quick.on).toBe(false);

    quick.start();
    await router.push('/reports');
    expect(quick.on).toBe(false);
  });

  it('unmounting ends the mode and releases Shift', () => {
    const quick = useQuickUpgradeStore();
    quick.start();
    key('keydown', 'Shift');
    wrapper.unmount();
    expect(quick.on).toBe(false);
    expect(quick.shiftHeld).toBe(false);
  });
});
