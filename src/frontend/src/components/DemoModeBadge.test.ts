// @vitest-environment jsdom
//
// Mobile audit: the full sentence-length label ("Demo mode — progress isn't
// saved") wraps to two lines at 390px and covers the header sitting right
// underneath it. Both a full and a short label are always rendered — CSS
// alone toggles which one is visible per viewport (see the component's
// `@media` rule) — so this test just pins that both labels exist with the
// right text, rather than asserting on a viewport it can't fake in jsdom.
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DemoModeBadge from './DemoModeBadge.vue';
import { createTestI18n } from '../test/i18n';
import enDemoModeBadge from '../i18n/locales/en/demoModeBadge.json';

function mountBadge() {
  return mount(DemoModeBadge, {
    global: { plugins: [createTestI18n({ demoModeBadge: enDemoModeBadge })] },
  });
}

describe('DemoModeBadge', () => {
  it('renders both the full and short labels, and the explanatory title', () => {
    const wrapper = mountBadge();

    expect(wrapper.get('.label-full').text()).toBe("Demo mode — progress isn't saved");
    expect(wrapper.get('.label-short').text()).toBe('Demo');
    expect(wrapper.get('.demo-badge').attributes('title')).toBe(
      'No backend is connected — progress lives only in this browser tab and is lost on reload.',
    );
    wrapper.unmount();
  });
});
