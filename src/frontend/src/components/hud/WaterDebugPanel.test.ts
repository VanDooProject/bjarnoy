// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import WaterDebugPanel from './WaterDebugPanel.vue';
import { BOG_LAKE_FOAM_STYLES, waterDebugFlags, waterDebugTuning } from '../../lib/map/water/waterDebug';

const DEFAULT_TUNING = { ...waterDebugTuning };
const DEFAULT_FLAGS = { ...waterDebugFlags };

describe('WaterDebugPanel', () => {
  afterEach(() => {
    Object.assign(waterDebugTuning, DEFAULT_TUNING);
    Object.assign(waterDebugFlags, DEFAULT_FLAGS);
  });

  it('offers every bog lake foam style in a dropdown, starting on micro curls, and sets the style the renderer reads', async () => {
    // Foam lines ship off; the dropdown is live once they are switched on.
    waterDebugFlags.bogLakeFoam = true;
    const wrapper = mount(WaterDebugPanel);
    const select = wrapper.get('[data-testid="bog-lake-foam-style"]');
    expect(select.findAll('option').map((o) => o.text())).toEqual([...BOG_LAKE_FOAM_STYLES]);
    expect((select.element as HTMLSelectElement).value).toBe(String(BOG_LAKE_FOAM_STYLES.indexOf('micro curls')));

    await select.setValue(String(BOG_LAKE_FOAM_STYLES.indexOf('crest + shadow')));
    expect(waterDebugTuning.bogLakeFoamStyle).toBe(BOG_LAKE_FOAM_STYLES.indexOf('crest + shadow'));
    wrapper.unmount();
  });

  it('disables the dropdown while the foam look is off (the default)', async () => {
    const wrapper = mount(WaterDebugPanel);
    expect(wrapper.get('[data-testid="bog-lake-foam-style"]').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
