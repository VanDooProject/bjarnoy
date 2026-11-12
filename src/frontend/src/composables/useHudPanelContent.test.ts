// @vitest-environment jsdom
//
// The one set of "has something to show" rules the docked panels and the icon column both read.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useHudPanelContent, useHudPanelCounts } from './useHudPanelContent';
import { useWorldStore } from '../stores/world';
import { createTestI18n } from '../test/i18n';
import enHud from '../i18n/locales/en/hud.json';
import enQuests from '../i18n/locales/en/quests.json';
import enCatalogue from '../i18n/locales/en/catalogue.json';
import type { BuildOrderResponse, QuestResponse } from '../api/types';

function content() {
  let result!: ReturnType<typeof useHudPanelContent>;
  mount(
    defineComponent({
      setup() {
        result = useHudPanelContent();
        return () => h('div');
      },
    }),
    { global: { plugins: [createTestI18n({ hud: enHud, quests: enQuests, catalogue: enCatalogue })] } },
  );
  return result;
}

const quest = (id: string, patch: Partial<QuestResponse> = {}): QuestResponse => ({
  id,
  completed: false,
  claimed: false,
  reward: { wood: 1, stone: 1, food: 1, iron: 0 },
  ...patch,
});

describe('useHudPanelContent', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('has nothing but the armies panel in an empty settlement', () => {
    const c = content();
    expect(c.construction.value).toBe(false);
    expect(c.garrison.value).toBe(false);
    expect(c.quests.value).toBe(false);
    expect(c.armies.value).toBe(true);
  });

  it('shows construction while an order is queued', () => {
    const world = useWorldStore();
    const c = content();
    world.hud.queue = [
      { id: 'o1', building: 'sawmill', q: 1, r: 1, targetLevel: 1, kind: 'build', state: 'active', completesInSeconds: 10, totalSeconds: 10 } as unknown as BuildOrderResponse,
    ];
    expect(c.construction.value).toBe(true);
  });

  it('shows the garrison panel for troops at home, but not for a zero count', () => {
    const world = useWorldStore();
    const c = content();
    world.hud.garrison = [{ unit: 'spearman', count: 0 }];
    expect(c.garrison.value).toBe(false);
    world.hud.garrison = [{ unit: 'spearman', count: 3 }];
    expect(c.garrison.value).toBe(true);
  });

  it('shows quests while one is unclaimed, and steps aside while a dispatch is composed', () => {
    const world = useWorldStore();
    const c = content();
    world.hud.quests = [quest('producers3')];
    expect(c.quests.value).toBe(true);
    world.sendPicker = { armyId: 'a' } as never;
    expect(c.quests.value).toBe(false);
    world.sendPicker = null;
    world.hud.quests = [quest('producers3', { claimed: true })];
    expect(c.quests.value).toBe(false);
  });
});

describe('useHudPanelCounts', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  function counts() {
    let result!: ReturnType<typeof useHudPanelCounts>;
    mount(
      defineComponent({
        setup() {
          result = useHudPanelCounts();
          return () => h('div');
        },
      }),
      { global: { plugins: [createTestI18n({ hud: enHud, quests: enQuests, catalogue: enCatalogue })] } },
    );
    return result;
  }

  it('counts build orders, armies on the road and claimable quests; garrison has none', () => {
    const world = useWorldStore();
    const c = counts();
    expect(c.construction.value + c.armies.value + c.quests.value + c.garrison.value).toBe(0);
    world.hud.queue = [
      { id: 'o1', building: 'sawmill', q: 1, r: 1, targetLevel: 1, kind: 'build', state: 'active', completesInSeconds: 10, totalSeconds: 10 },
      { id: 'o2', building: 'sawmill', q: 2, r: 1, targetLevel: 1, kind: 'build', state: 'waiting', completesInSeconds: 10, totalSeconds: 10 },
    ] as unknown as BuildOrderResponse[];
    world.armies = [{ movement: { id: 'm1' } }, { movement: null }, { movement: { id: 'm2' } }] as unknown as typeof world.armies;
    world.hud.quests = [quest('producers3', { completed: true }), quest('a2', { completed: true }), quest('a3'), quest('a4', { completed: true, claimed: true })];
    expect(c.construction.value).toBe(2);
    expect(c.armies.value).toBe(2);
    expect(c.garrison.value).toBe(0);
    // Only quests this build has copy for count, so the unknown ids add nothing; the known one that is done does.
    expect(c.quests.value).toBe(1);
  });
});
