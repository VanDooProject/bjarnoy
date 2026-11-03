// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DocsMapControls from './DocsMapControls.vue';
import { createTestI18n } from '../../test/i18n';
import enDocs from '../../i18n/locales/en/docs.json';

const mountControls = (wheelHint: boolean, zoomIn = vi.fn(), zoomOut = vi.fn(), attachTo?: HTMLElement) =>
  mount(DocsMapControls, {
    props: { zoomIn, zoomOut, wheelHint },
    attachTo,
    global: { plugins: [createTestI18n({ docs: enDocs })] },
  });

describe('DocsMapControls', () => {
  it('calls the zoom handlers from its buttons', async () => {
    const zoomIn = vi.fn();
    const zoomOut = vi.fn();
    const wrapper = mountControls(false, zoomIn, zoomOut);
    await wrapper.get('[data-testid="docs-map-zoom-in"]').trigger('click');
    expect(zoomIn).toHaveBeenCalledOnce();
    expect(zoomOut).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="docs-map-zoom-out"]').trigger('click');
    expect(zoomOut).toHaveBeenCalledOnce();
    expect(wrapper.get('[data-testid="docs-map-zoom-in"]').attributes('aria-label')).toBe('Zoom in');
  });

  it('does not let a button press reach the map underneath', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onHost = vi.fn();
    host.addEventListener('pointerdown', onHost);
    const wrapper = mountControls(false, vi.fn(), vi.fn(), host);
    wrapper.get('[data-testid="docs-map-zoom-in"]').element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onHost).not.toHaveBeenCalled();
    wrapper.unmount();
    host.remove();
  });

  it('shows the Ctrl hint only while wheelHint is set', async () => {
    const wrapper = mountControls(false);
    expect(wrapper.find('[data-testid="docs-map-wheel-hint"]').exists()).toBe(false);
    await wrapper.setProps({ wheelHint: true });
    expect(wrapper.get('[data-testid="docs-map-wheel-hint"]').text()).toBe('Ctrl + scroll to zoom');
  });
});
