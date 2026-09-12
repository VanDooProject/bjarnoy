// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';
import ProfileNudge from './ProfileNudge.vue';
import { usePlayerStore } from '../../stores/player';
import { createTestI18n } from '../../test/i18n';
import enOnboarding from '../../i18n/locales/en/onboarding.json';

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/register', component: { template: '<div />' } },
    ],
  });
}

async function mountNudge() {
  const router = testRouter();
  await router.push('/');
  await router.isReady();
  const wrapper = mount(ProfileNudge, {
    global: { plugins: [router, createTestI18n({ onboarding: enOnboarding })] },
  });
  return { wrapper, router };
}

describe('ProfileNudge', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows the eyebrow/title/body copy', async () => {
    const { wrapper } = await mountNudge();
    expect(wrapper.text()).toContain('Your realm runs');
    expect(wrapper.text()).toContain('Three buildings, no jarl.');
  });

  it('"Name your jarl" navigates to /register', async () => {
    const { wrapper, router } = await mountNudge();
    await wrapper.get('.cta').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/register');
  });

  it('"Later" dismisses the nudge in the player store', async () => {
    const { wrapper } = await mountNudge();
    const player = usePlayerStore();
    expect(player.profileNudgeDismissed).toBe(false);
    await wrapper.get('.later').trigger('click');
    expect(player.profileNudgeDismissed).toBe(true);
  });
});
