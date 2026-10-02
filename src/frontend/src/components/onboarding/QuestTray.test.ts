// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import QuestTray from './QuestTray.vue';
import { useWorldStore } from '../../stores/world';
import type { QuestResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enQuests from '../../i18n/locales/en/quests.json';
import enCatalogue from '../../i18n/locales/en/catalogue.json';
import enApiErrors from '../../i18n/locales/en/apiErrors.json';

const IDS = ['producers3', 'longhouse2', 'storagehouse1', 'producers6', 'longhouse3', 'longhouse5', 'spearmen5', 'hunt1'];

function quest(id: string, patch: Partial<QuestResponse> = {}): QuestResponse {
  return { id, completed: false, claimed: false, reward: { wood: 250, stone: 200, food: 150, iron: 0 }, ...patch };
}

function all(patches: Record<string, Partial<QuestResponse>> = {}): QuestResponse[] {
  return IDS.map((id) => quest(id, patches[id]));
}

function mountTray() {
  return mount(QuestTray, {
    global: { plugins: [createTestI18n({ quests: enQuests, catalogue: enCatalogue, apiErrors: enApiErrors })] },
  });
}

describe('QuestTray', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const world = useWorldStore();
    world.hud.resources = { wood: 0, stone: 0, food: 0, iron: 0 };
    world.hud.storageCap = { wood: 750, stone: 750, food: 900, iron: 375 };
  });

  it('shows the first unclaimed quest with its hint, reward and progress', () => {
    const world = useWorldStore();
    world.hud.quests = all({ producers3: { claimed: true } });

    const wrapper = mountTray();

    const current = wrapper.get('[data-testid="quest-current"]');
    expect(current.attributes('data-quest-id')).toBe('longhouse2');
    expect(current.text()).toContain('Upgrade your Longhouse to level 2');
    expect(current.text()).toContain('Open the Longhouse and choose Upgrade.');
    expect(current.text()).toContain('250');
    expect(current.text()).toContain('200');
    expect(current.text()).toContain('150');
    expect(wrapper.get('[data-testid="quest-progress"]').text()).toBe('1 of 8');
  });

  it('shows no Claim button while the current quest is not completed', () => {
    const world = useWorldStore();
    world.hud.quests = all();

    const wrapper = mountTray();

    expect(wrapper.find('[data-testid="quest-claim"]').exists()).toBe(false);
  });

  it('shows Claim once completed and claims through the store', async () => {
    const world = useWorldStore();
    world.hud.quests = all({ producers3: { completed: true } });
    const claim = vi.spyOn(world, 'claimQuest').mockResolvedValue(undefined);

    const wrapper = mountTray();
    await wrapper.get('[data-testid="quest-claim"]').trigger('click');

    expect(claim).toHaveBeenCalledWith('producers3');
  });

  it('also lists other completed-but-unclaimed quests so they can be claimed', async () => {
    const world = useWorldStore();
    world.hud.quests = all({ longhouse2: { completed: true }, storagehouse1: { completed: true } });
    const claim = vi.spyOn(world, 'claimQuest').mockResolvedValue(undefined);

    const wrapper = mountTray();

    const rows = wrapper.findAll('[data-testid="quest-ready-row"]');
    expect(rows.map((r) => r.attributes('data-quest-id'))).toEqual(['longhouse2', 'storagehouse1']);
    // The current quest (producers3) is not completed, so it has no button of its own.
    expect(wrapper.find('[data-testid="quest-claim"]').exists()).toBe(false);
    await rows[1].get('button').trigger('click');
    expect(claim).toHaveBeenCalledWith('storagehouse1');
  });

  it('moves on to the next quest once the current one is claimed', () => {
    const world = useWorldStore();
    world.hud.quests = all({ producers3: { claimed: true, completed: true }, longhouse2: { claimed: true, completed: true } });

    const wrapper = mountTray();

    expect(wrapper.get('[data-testid="quest-current"]').attributes('data-quest-id')).toBe('storagehouse1');
    expect(wrapper.get('[data-testid="quest-progress"]').text()).toBe('2 of 8');
  });

  it('hides once every quest is claimed', () => {
    const world = useWorldStore();
    world.hud.quests = IDS.map((id) => quest(id, { completed: true, claimed: true }));

    const wrapper = mountTray();

    expect(wrapper.find('[data-testid="quest-tray"]').exists()).toBe(false);
  });

  it('renders nothing when the settlement has no quest list', () => {
    const world = useWorldStore();
    world.hud.quests = [];

    expect(mountTray().find('[data-testid="quest-tray"]').exists()).toBe(false);
  });

  it('warns when a completed quest reward would not fit in storage', () => {
    const world = useWorldStore();
    world.hud.quests = all({ producers3: { completed: true } });
    world.hud.resources = { wood: 700, stone: 0, food: 0, iron: 0 };

    const wrapper = mountTray();

    expect(wrapper.get('[data-testid="quest-overflow-note"]').text()).toBe("Some of this reward won't fit in storage.");
  });

  it('shows no overflow note when the reward fits, or before the quest is completed', () => {
    const world = useWorldStore();
    world.hud.quests = all({ producers3: { completed: true } });
    expect(mountTray().find('[data-testid="quest-overflow-note"]').exists()).toBe(false);

    world.hud.quests = all();
    world.hud.resources = { wood: 700, stone: 0, food: 0, iron: 0 };
    expect(mountTray().find('[data-testid="quest-overflow-note"]').exists()).toBe(false);
  });

  it('shows the translated rejection when a claim fails', async () => {
    const world = useWorldStore();
    world.hud.quests = all({ producers3: { completed: true } });
    vi.spyOn(world, 'claimQuest').mockRejectedValue(Object.assign(new Error('x'), {}));

    const wrapper = mountTray();
    await wrapper.get('[data-testid="quest-claim"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="quest-error"]').text()).toBe("Couldn't claim that reward. Try again.");
  });

  it('leaves out a quest id it has no copy for instead of showing a raw key', () => {
    const world = useWorldStore();
    world.hud.quests = [quest('from-the-future'), quest('longhouse2')];

    const wrapper = mountTray();

    expect(wrapper.get('[data-testid="quest-current"]').attributes('data-quest-id')).toBe('longhouse2');
    expect(wrapper.get('[data-testid="quest-progress"]').text()).toBe('0 of 1');
  });
});

describe('QuestTray on a phone', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const world = useWorldStore();
    world.hud.resources = { wood: 0, stone: 0, food: 0, iron: 0 };
    world.hud.storageCap = { wood: 750, stone: 750, food: 900, iron: 375 };
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  it('starts as a quest button, without a dot while nothing is ready to claim', async () => {
    useWorldStore().hud.quests = all();
    const wrapper = mountTray();
    await flushPromises();
    expect(wrapper.find('[data-testid="quest-tray"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="quest-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(false);
  });

  it('shows a dot when a quest is ready to claim', async () => {
    useWorldStore().hud.quests = all({ longhouse2: { completed: true } });
    const wrapper = mountTray();
    await flushPromises();
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(true);
  });

  it('opens on tap and collapses again', async () => {
    useWorldStore().hud.quests = all();
    const wrapper = mountTray();
    await flushPromises();
    await wrapper.get('[data-testid="quest-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="quest-current"]').exists()).toBe(true);
    await wrapper.get('[data-testid="quest-collapse"]').trigger('click');
    expect(wrapper.find('[data-testid="quest-tray"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="quest-toggle"]').exists()).toBe(true);
  });
});
