// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PhoneSheet from './PhoneSheet.vue';
import { __resetPhoneLayersForTest, topPhoneLayerId } from '../../composables/usePhoneLayer';
import { createTestI18n } from '../../test/i18n';
import enCommon from '../../i18n/locales/en/common.json';

import { motionPreferences } from '../../lib/perf/motionPreferences';

function mountSheet(open = true) {
  const state = ref(open);
  const wrapper = mount(
    { components: { PhoneSheet }, setup: () => ({ state }), template: '<PhoneSheet v-model:open="state" label="Reports" layer-id="test-sheet"><p class="content">hi</p></PhoneSheet>' },
    { attachTo: document.body, global: { stubs: { transition: false }, plugins: [createTestI18n({ common: enCommon })] } },
  );
  return { wrapper, state };
}

function pointer(el: Element, type: string, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, clientY, button: 0 });
  Object.assign(event, { pointerId: 1 });
  el.dispatchEvent(event);
}

describe('PhoneSheet', () => {
  beforeEach(() => {
    __resetPhoneLayersForTest();
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.hasPointerCapture = () => false;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    motionPreferences.hud = 'auto';
    delete (Element.prototype as { animate?: unknown }).animate;
  });

  it('is a named phone layer while open and leaves the stack when closed', async () => {
    const { wrapper, state } = mountSheet();
    expect(topPhoneLayerId.value).toBe('test-sheet');
    expect(wrapper.find('.content').exists()).toBe(true);
    state.value = false;
    await nextTick();
    await nextTick();
    expect(topPhoneLayerId.value).toBeNull();
    expect(wrapper.find('.content').exists()).toBe(false);
    wrapper.unmount();
  });

  it('slides through animate() with the HUD motion on, and leaves at once with it off', async () => {
    const animateSpy = vi.fn(() => ({ finished: new Promise(() => {}) }));
    Element.prototype.animate = animateSpy as unknown as typeof Element.prototype.animate;
    motionPreferences.hud = 'on';
    const on = mountSheet(false);
    on.state.value = true;
    await nextTick();
    expect(animateSpy).toHaveBeenCalledTimes(1);
    on.wrapper.unmount();

    animateSpy.mockClear();
    motionPreferences.hud = 'off';
    const off = mountSheet(true);
    off.state.value = false;
    await nextTick();
    await flushPromises();
    expect(animateSpy).not.toHaveBeenCalled();
    expect(off.wrapper.find('.phone-sheet').exists()).toBe(false);
    off.wrapper.unmount();
  });

  it('closes on Escape and on a tap on the grip', async () => {
    const { wrapper, state } = mountSheet();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(state.value).toBe(false);
    state.value = true;
    await nextTick();
    await wrapper.get('[data-testid="phone-sheet-grip"]').trigger('click');
    expect(state.value).toBe(false);
    wrapper.unmount();
  });

  it('closes when dragged down past 30% of its height, and stays open on a short drag', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
    const { wrapper, state } = mountSheet();
    const grip = wrapper.get('[data-testid="phone-sheet-grip"]').element;
    // 50 px down over a long time: below 30% of 400 and slow.
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(1000);
    pointer(grip, 'pointerdown', 100);
    pointer(grip, 'pointermove', 150);
    pointer(grip, 'pointerup', 150);
    expect(state.value).toBe(true);
    // 150 px down: past 30%.
    pointer(grip, 'pointerdown', 100);
    pointer(grip, 'pointermove', 250);
    pointer(grip, 'pointerup', 250);
    expect(state.value).toBe(false);
    wrapper.unmount();
  });

  it('closes on a fast flick down even when short', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
    const { wrapper, state } = mountSheet();
    const grip = wrapper.get('[data-testid="phone-sheet-grip"]').element;
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(50);
    pointer(grip, 'pointerdown', 100);
    pointer(grip, 'pointermove', 140);
    pointer(grip, 'pointerup', 140);
    expect(state.value).toBe(false);
    wrapper.unmount();
  });
});
