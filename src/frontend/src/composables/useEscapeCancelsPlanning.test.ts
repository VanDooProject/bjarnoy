// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useEscapeCancelsPlanning } from './useEscapeCancelsPlanning';
import { useWorldStore } from '../stores/world';

function setup() {
  const wrapper = mount(
    defineComponent({
      setup() {
        useEscapeCancelsPlanning();
        return () => h('div', [h('input', { id: 'field' })]);
      },
    }),
    { attachTo: document.body },
  );
  return { wrapper, world: useWorldStore() };
}

describe('useEscapeCancelsPlanning', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('cancels a dispatch being planned', () => {
    const { wrapper, world } = setup();
    world.startDispatch();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(world.dispatchDraft).toBeNull();
    wrapper.unmount();
  });

  it('cancels a field order being planned', () => {
    const { wrapper, world } = setup();
    world.fieldOrderDraft = {
      armyId: 'a',
      route: [],
      provisions: 0,
      submitting: false,
      error: null,
      mission: 'move',
      targetSettlementId: null,
      targetBuildingCoord: null,
      units: null,
    } as unknown as typeof world.fieldOrderDraft;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(world.fieldOrderDraft).toBeNull();
    wrapper.unmount();
  });

  it('ignores Escape typed in a text field and other keys', () => {
    const { wrapper, world } = setup();
    world.startDispatch();
    wrapper.get('#field').element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(world.dispatchDraft).not.toBeNull();
    wrapper.unmount();
  });

  it('stops listening after unmount', () => {
    const { wrapper, world } = setup();
    wrapper.unmount();
    world.startDispatch();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(world.dispatchDraft).not.toBeNull();
  });
});
