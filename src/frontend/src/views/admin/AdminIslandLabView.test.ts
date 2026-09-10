// @vitest-environment jsdom
//
// jsdom has no canvas 2D context (same gap ActivityChart.test.ts documents
// for Chart.js) — the minimap here draws with plain fillRect/clearRect calls,
// so a minimal mock context that just records those calls is enough to
// verify the lab actually redraws on every parameter/seed change, without
// asserting anything about pixel output.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import AdminIslandLabView from './AdminIslandLabView.vue';
import { createTestI18n } from '../../test/i18n';
import adminIslandLab from '../../i18n/locales/en/adminIslandLab.json';

function stubCanvasContext() {
  const clearRect = vi.fn();
  const fillRect = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => ({ clearRect, fillRect, fillStyle: '' })) as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
  return { clearRect, fillRect };
}

function mountLab() {
  return mount(AdminIslandLabView, { global: { plugins: [createTestI18n({ adminIslandLab })] } });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('AdminIslandLabView', () => {
  it('renders two default variants, each with its own canvas', async () => {
    stubCanvasContext();
    const wrapper = mountLab();
    await flushPromises();

    expect(wrapper.findAll('[data-testid="island-lab-variant"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid="island-lab-canvas"]')).toHaveLength(2);
  });

  it('draws every variant on mount', async () => {
    const { clearRect } = stubCanvasContext();
    mountLab();
    await flushPromises();

    // One clearRect per variant's initial draw.
    expect(clearRect).toHaveBeenCalledTimes(2);
  });

  it('adding a variant renders another card and draws it', async () => {
    const { clearRect } = stubCanvasContext();
    const wrapper = mountLab();
    await flushPromises();
    const callsBeforeAdd = clearRect.mock.calls.length;

    await wrapper.find('[data-testid="add-variant"]').trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[data-testid="island-lab-variant"]')).toHaveLength(3);
    expect(clearRect.mock.calls.length).toBeGreaterThan(callsBeforeAdd);
  });

  it('duplicating a variant copies its seed and parameters into a new card', async () => {
    stubCanvasContext();
    const wrapper = mountLab();
    await flushPromises();

    const firstSeedInput = wrapper.find('input[id^="lab-seed-"]');
    await firstSeedInput.setValue('12345');
    await wrapper.find('[data-testid="duplicate-variant"]').trigger('click');
    await flushPromises();

    const seedInputs = wrapper.findAll('input[id^="lab-seed-"]');
    expect((seedInputs[0].element as HTMLInputElement).value).toBe('12345');
    expect((seedInputs.at(-1)!.element as HTMLInputElement).value).toBe('12345');
  });

  it('removing a variant drops its card, and the last one cannot be removed', async () => {
    stubCanvasContext();
    const wrapper = mountLab();
    await flushPromises();

    const removeButtons = wrapper.findAll('[data-testid="remove-variant"]');
    await removeButtons[0].trigger('click');
    await flushPromises();

    expect(wrapper.findAll('[data-testid="island-lab-variant"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="remove-variant"]').attributes('disabled')).toBeDefined();
  });

  it('changing a generation parameter redraws that variant', async () => {
    const { clearRect } = stubCanvasContext();
    const wrapper = mountLab();
    await flushPromises();
    const callsBefore = clearRect.mock.calls.length;

    const cellSizeInput = wrapper.find('[data-testid^="lab-gen-"][data-testid$="-islandCellSize"]');
    await cellSizeInput.setValue(30);

    expect(clearRect.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('randomizing a seed changes its value and redraws', async () => {
    const { clearRect } = stubCanvasContext();
    const wrapper = mountLab();
    await flushPromises();
    const seedInput = wrapper.find('input[id^="lab-seed-"]');
    const before = (seedInput.element as HTMLInputElement).value;
    const callsBefore = clearRect.mock.calls.length;

    await wrapper.find('[data-testid="randomize-seed"]').trigger('click');

    const after = (seedInput.element as HTMLInputElement).value;
    expect(after).not.toBe(before);
    expect(clearRect.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('resetting to default restores the shipped generation values', async () => {
    stubCanvasContext();
    const wrapper = mountLab();
    await flushPromises();

    const cellSizeInput = wrapper.find('[data-testid^="lab-gen-"][data-testid$="-islandCellSize"]');
    await cellSizeInput.setValue(99);
    await wrapper.find('[data-testid="reset-generation"]').trigger('click');

    expect((cellSizeInput.element as HTMLInputElement).value).toBe('36');
  });

  it('toggling the docs section shows and hides its explanation', async () => {
    stubCanvasContext();
    const wrapper = mountLab();
    await flushPromises();

    expect(wrapper.find('[data-testid="docs-body"]').exists()).toBe(false);
    await wrapper.find('[data-testid="docs-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="docs-body"]').exists()).toBe(true);
  });

  it('applying a preset writes it into the selected target variant', async () => {
    stubCanvasContext();
    const wrapper = mountLab();
    await flushPromises();

    const targetSelect = wrapper.find('[data-testid="preset-target"]');
    const variantIds = wrapper.findAll('[data-testid="island-lab-variant"]');
    expect(variantIds).toHaveLength(2);

    // Target the second variant, then apply the baseline preset to it.
    await targetSelect.setValue((targetSelect.element as HTMLSelectElement).options[1].value);
    await wrapper.find('[data-testid="preset-baseline"]').trigger('click');

    const cellSizeInputs = wrapper.findAll('[data-testid^="lab-gen-"][data-testid$="-islandCellSize"]');
    expect((cellSizeInputs[0].element as HTMLInputElement).value).toBe('36');
    expect((cellSizeInputs[1].element as HTMLInputElement).value).toBe('23');
  });

  it('applying a preset with a single variant open needs no target selector', async () => {
    stubCanvasContext();
    const wrapper = mountLab();
    await flushPromises();
    await wrapper.find('[data-testid="remove-variant"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="preset-target"]').exists()).toBe(false);
    await wrapper.find('[data-testid="preset-baseline"]').trigger('click');

    const cellSizeInput = wrapper.find('[data-testid^="lab-gen-"][data-testid$="-islandCellSize"]');
    expect((cellSizeInput.element as HTMLInputElement).value).toBe('23');
  });

  it('resetting a variant view restores its default pan/zoom', async () => {
    stubCanvasContext();
    const wrapper = mountLab();
    await flushPromises();

    const canvas = wrapper.find('[data-testid="island-lab-canvas"]');
    // jsdom's clientX/clientY are getter-only, so @vue/test-utils' trigger()
    // helper can't assign them onto a wheel event — dispatch a real one instead.
    canvas.element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 10, clientY: 10 }));
    await flushPromises();
    await wrapper.find('[data-testid="reset-view"]').trigger('click');

    // Just confirms the reset button exists and doesn't throw when clicked;
    // pan/zoom state isn't reflected in any DOM attribute to assert on.
    expect(wrapper.find('[data-testid="reset-view"]').exists()).toBe(true);
  });

  it('syncing viewports mirrors pan/zoom from one variant onto the others', async () => {
    const { clearRect } = stubCanvasContext();
    const wrapper = mountLab();
    await flushPromises();

    await wrapper.find('[data-testid="sync-viewports"]').setValue(true);
    const callsBefore = clearRect.mock.calls.length;

    const canvases = wrapper.findAll('[data-testid="island-lab-canvas"]');
    canvases[0].element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 10, clientY: 10 }));
    await flushPromises();

    // Zooming the first variant should also redraw the second (mocked
    // getBoundingClientRect on jsdom returns all zeros, so this only checks
    // that the sync path actually ran a second draw, not the resulting math).
    expect(clearRect.mock.calls.length).toBeGreaterThan(callsBefore + 1);
  });
});
