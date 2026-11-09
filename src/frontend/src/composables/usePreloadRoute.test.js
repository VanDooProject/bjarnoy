// @vitest-environment jsdom
import { defineComponent, h, nextTick, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { usePreloadRoute } from './usePreloadRoute';
const RegisterStub = defineComponent({ render: () => h('div', 'register') });
async function setup(when) {
    const loadRegister = vi.fn(() => Promise.resolve({ default: RegisterStub }));
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', component: { template: '<div />' } },
            { path: '/register', component: loadRegister },
        ],
    });
    await router.push('/');
    await router.isReady();
    const Host = defineComponent({
        setup() {
            usePreloadRoute('/register', when);
            return () => h('div');
        },
    });
    mount(Host, { global: { plugins: [router] } });
    await flushPromises();
    return { router, loadRegister };
}
describe('usePreloadRoute', () => {
    // The flake this guards against: a click on "Name your jarl" left the URL unchanged for
    // seconds on a busy main thread, because the click itself started loading the view chunk.
    it('loads the route view on mount, so the navigation needs no load of its own', async () => {
        const { router, loadRegister } = await setup();
        expect(loadRegister).toHaveBeenCalledTimes(1);
        await router.push('/register');
        expect(loadRegister).toHaveBeenCalledTimes(1);
        expect(router.currentRoute.value.path).toBe('/register');
    });
    it('waits until `when` turns true', async () => {
        const active = ref(false);
        const { loadRegister } = await setup(() => active.value);
        expect(loadRegister).not.toHaveBeenCalled();
        active.value = true;
        await nextTick();
        await flushPromises();
        expect(loadRegister).toHaveBeenCalledTimes(1);
    });
    it('a failed preload stays quiet and the click loads the view again', async () => {
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        const loadRegister = vi
            .fn()
            .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
            .mockResolvedValue({ default: RegisterStub });
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/', component: { template: '<div />' } },
                { path: '/register', component: loadRegister },
            ],
        });
        await router.push('/');
        mount(defineComponent({
            setup() {
                usePreloadRoute('/register');
                return () => h('div');
            },
        }), { global: { plugins: [router] } });
        await flushPromises();
        await router.push('/register');
        process.off('unhandledRejection', unhandled);
        expect(unhandled).not.toHaveBeenCalled();
        expect(loadRegister).toHaveBeenCalledTimes(2);
        expect(router.currentRoute.value.path).toBe('/register');
    });
});
