// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useEscapeCancelsPlanning } from './useEscapeCancelsPlanning';
import { useWorldStore } from '../stores/world';

function setup(host: { ringOpen?: () => boolean } = {}) {
  const wrapper = mount(
    defineComponent({
      setup() {
        useEscapeCancelsPlanning(host);
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

  it('closes the send picker together with the order it was composing', () => {
    const { wrapper, world } = setup();
    world.openSendPicker({ q: 1, r: 1 });
    world.fieldOrderDraft = { armyId: 'a', route: [] } as unknown as typeof world.fieldOrderDraft;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(world.sendPicker).toBeNull();
    expect(world.fieldOrderDraft).toBeNull();
    wrapper.unmount();
  });

  it('cancels the route first and keeps the army selected, a second Escape deselects it', () => {
    const { wrapper, world } = setup();
    world.selectArmy('a');
    world.fieldOrderDraft = { armyId: 'a', route: [{ q: 1, r: 0 }] } as unknown as typeof world.fieldOrderDraft;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(world.fieldOrderDraft).toBeNull();
    expect(world.selectedArmyId).toBe('a');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(world.selectedArmyId).toBeNull();
    wrapper.unmount();
  });

  it('leaves the selected army alone while the ring menu is open (the ring takes that Escape)', () => {
    const { wrapper, world } = setup({ ringOpen: () => true });
    world.selectArmy('a');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(world.selectedArmyId).toBe('a');
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
