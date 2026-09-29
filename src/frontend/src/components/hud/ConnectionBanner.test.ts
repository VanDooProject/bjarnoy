// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import ConnectionBanner from './ConnectionBanner.vue';
import { ApiError } from '../../api/client';
import { useConnectionStatusStore } from '../../stores/connectionStatus';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';

function mountBanner() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(ConnectionBanner, { global: { plugins: [pinia, createTestI18n({ hud: enHud })] } });
  return { wrapper, status: useConnectionStatusStore() };
}

describe('ConnectionBanner', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders nothing while there are no issues', () => {
    const { wrapper } = mountBanner();
    expect(wrapper.find('[data-testid="connection-banner"]').exists()).toBe(false);
  });

  it('shows the failing call, a repeat count, and disappears when the poll recovers', async () => {
    const { wrapper, status } = mountBanner();
    const err = new ApiError(503, undefined, 'GET', '/settlements/s1');
    status.report('settlement', err);
    await wrapper.vm.$nextTick();

    const banner = wrapper.get('[data-testid="connection-banner"]');
    expect(banner.attributes('role')).toBe('status');
    expect(banner.text()).toContain(enHud.mapStatus.pollErrorTitle);
    expect(banner.text()).toContain('GET /settlements/s1 → 503');
    expect(banner.find('.count').exists()).toBe(false);

    status.report('settlement', err);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.count').text()).toBe('×2');

    status.clear('settlement');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="connection-banner"]').exists()).toBe(false);
  });

  it('dismiss hides the current failure but a new failure brings it back', async () => {
    const { wrapper, status } = mountBanner();
    status.report('trade', new Error('down'));
    await wrapper.vm.$nextTick();

    await wrapper.get('button').trigger('click');
    expect(wrapper.find('[data-testid="connection-banner"]').exists()).toBe(false);

    status.report('trade', new Error('still down'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="connection-banner"]').exists()).toBe(true);
  });

  it('starts visible again for a fresh outage after recovering from a dismissed one', async () => {
    const { wrapper, status } = mountBanner();
    status.report('trade', new Error('down'));
    await wrapper.vm.$nextTick();
    await wrapper.get('button').trigger('click');

    status.clear('trade');
    await wrapper.vm.$nextTick();
    status.report('trade', new Error('down again'));
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="connection-banner"]').exists()).toBe(true);
  });
});
