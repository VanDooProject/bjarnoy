// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { IDLE_DIM_MS, useIdleDim } from './useIdleDim';
const mounted = [];
function mountIdle() {
    let idle;
    const w = mount(defineComponent({ setup() { idle = useIdleDim(); return () => h('div'); } }));
    mounted.push(w);
    return { w, idle };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    mounted.splice(0).forEach((w) => w.unmount());
    vi.useRealTimers();
});
describe('useIdleDim', () => {
    it('starts active and turns idle after the idle time without input', () => {
        const { idle } = mountIdle();
        expect(idle.value).toBe(false);
        vi.advanceTimersByTime(IDLE_DIM_MS - 1);
        expect(idle.value).toBe(false);
        vi.advanceTimersByTime(1);
        expect(idle.value).toBe(true);
    });
    it.each(['pointermove', 'pointerdown', 'keydown'])('%s wakes it and restarts the countdown', (type) => {
        const { idle } = mountIdle();
        vi.advanceTimersByTime(IDLE_DIM_MS);
        expect(idle.value).toBe(true);
        window.dispatchEvent(new Event(type));
        expect(idle.value).toBe(false);
        vi.advanceTimersByTime(IDLE_DIM_MS - 1);
        expect(idle.value).toBe(false);
        vi.advanceTimersByTime(1);
        expect(idle.value).toBe(true);
    });
    it('stops listening and counting after unmount', () => {
        const { w, idle } = mountIdle();
        w.unmount();
        vi.advanceTimersByTime(IDLE_DIM_MS * 2);
        expect(idle.value).toBe(false);
        window.dispatchEvent(new Event('pointermove'));
        expect(vi.getTimerCount()).toBe(0);
    });
});
