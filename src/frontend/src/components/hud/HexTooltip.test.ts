// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import HexTooltip from './HexTooltip.vue';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';
import { createTestI18n } from '../../test/i18n';
import enHud from '../../i18n/locales/en/hud.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';

const grass = (screenX: number, screenY: number): HoverInfo =>
  ({
    screenX,
    screenY,
    coord: { q: 1, r: 2 },
    subject: { kind: 'terrain', terrain: 'grass', wasted: false, isRiver: false },
  }) as HoverInfo;

describe('HexTooltip', () => {
  // The tooltip jumps on every hex change. Moving it with left/top re-laid
  // out and repainted the page over the WebGL map each time, which flashed
  // white rectangles beside the cursor on real GPUs.
  it('follows the hovered hex with a transform, not left/top', async () => {
    const wrapper = mount(HexTooltip, {
      props: { info: grass(300, 200) },
      global: { plugins: [createTestI18n({ hud: enHud, catalogue: enCatalogue })] },
    });
    const el = wrapper.get('.hex-tooltip').element as HTMLElement;
    expect(el.style.transform).toBe('translate(312px, 200px) translateY(-50%)');

    await wrapper.setProps({ info: grass(420, 260) });
    expect(el.style.transform).toBe('translate(432px, 260px) translateY(-50%)');
    expect(el.style.left).toBe('');
    expect(el.style.top).toBe('');
    wrapper.unmount();
  });
});
