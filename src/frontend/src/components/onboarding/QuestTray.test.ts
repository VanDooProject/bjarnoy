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

const progress = (current: number, target: number) => ({ current, target });

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

  it('shows the first unfinished quest when the current one is already claimable', () => {
    const world = useWorldStore();
    world.hud.quests = all({ producers3: { completed: true }, longhouse2: { completed: true } });

    const wrapper = mountTray();

    expect(wrapper.get('[data-testid="quest-next-up"]').attributes('data-quest-id')).toBe('storagehouse1');
  });

  it('shows premium days in the next-up block for a quest that pays premium instead of resources', () => {
    const world = useWorldStore();
    world.hud.quests = [
      quest('producers3', { completed: true }),
      quest('register', { reward: { wood: 0, stone: 0, food: 0, iron: 0 }, premiumDays: 14 }),
    ];

    const wrapper = mountTray();

    expect(wrapper.get('[data-testid="quest-next-up"] [data-testid="quest-premium-reward"]').text()).toBe('14 days of Premium');
  });

  it('shows no separate next-up block while the current quest is itself unfinished', () => {
    const world = useWorldStore();
    world.hud.quests = all({ longhouse2: { completed: true } });

    const wrapper = mountTray();

    expect(wrapper.find('[data-testid="quest-next-up"]').exists()).toBe(false);
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

  it('shows premium days instead of resources for the register quest, claimable at once', () => {
    const world = useWorldStore();
    world.hud.quests = [
      quest('register', { completed: true, reward: { wood: 0, stone: 0, food: 0, iron: 0 }, premiumDays: 14 }),
      quest('longhouse2'),
    ];

    const wrapper = mountTray();

    expect(wrapper.get('[data-testid="quest-premium-reward"]').text()).toBe('14 days of Premium');
    expect(wrapper.get('[data-testid="quest-reward"]').find('svg, img').exists()).toBe(false);
    expect(wrapper.find('[data-testid="quest-claim"]').exists()).toBe(true);
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

  it.each([
    ['producers3', 'build', progress(1, 3), '2 more to build'],
    ['producers3', 'build', progress(2, 3), '1 more to build'],
    ['spearmen5', 'train', progress(2, 5), '3 more to train'],
    ['longhouse5', 'level', progress(2, 5), '3 levels to go'],
    ['longhouse2', 'level', progress(1, 2), '1 level to go'],
  ])('shows the %s progress as %s with remaining text', (id, kind, prog, left) => {
    const world = useWorldStore();
    world.hud.quests = IDS.map((i) => quest(i, { claimed: IDS.indexOf(i) < IDS.indexOf(id), ...(i === id ? { progress: prog } : {}) }));

    const wrapper = mountTray();

    expect(wrapper.get('[data-testid="quest-progress-visual"]').attributes('data-kind')).toBe(kind);
    expect(wrapper.get('[data-testid="quest-progress-left"]').text()).toBe(left);
  });

  it('draws one pip per target unit with the current ones filled', () => {
    useWorldStore().hud.quests = all({ producers3: { progress: progress(2, 3) } });
    const pips = mountTray().findAll('[data-testid="quest-progress-visual"] i');
    expect(pips.map((p) => p.classes('on'))).toEqual([true, true, false]);
  });

  it('draws numbered level steps with the current ringed and the target marked', () => {
    useWorldStore().hud.quests = all({ producers3: { claimed: true }, longhouse2: { claimed: true }, storagehouse1: { claimed: true }, producers6: { claimed: true }, longhouse3: { claimed: true }, longhouse5: { progress: progress(2, 5) } });
    const steps = mountTray().findAll('[data-testid="quest-progress-visual"] span');
    expect(steps.map((x) => x.text())).toEqual(['1', '2', '3', '4', '5']);
    expect(steps.map((x) => x.classes('on'))).toEqual([true, true, false, false, false]);
    expect(steps[1].classes('cur')).toBe(true);
    expect(steps[4].classes('goal')).toBe(true);
  });

  it('hides the progress when the quest is completed or has none', () => {
    useWorldStore().hud.quests = all({ producers3: { completed: true, progress: progress(3, 3) } });
    expect(mountTray().find('[data-testid="quest-progress-visual"]').exists()).toBe(false);
    useWorldStore().hud.quests = all();
    expect(mountTray().find('[data-testid="quest-progress-visual"]').exists()).toBe(false);
  });
});

describe('QuestTray on a phone', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    const world = useWorldStore();
    world.selectedSettlementId = 's1';
    world.hud.resources = { wood: 0, stone: 0, food: 0, iron: 0 };
    world.hud.storageCap = { wood: 750, stone: 750, food: 900, iron: 375 };
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });

  async function mounted() {
    const wrapper = mountTray();
    await flushPromises();
    return wrapper;
  }

  it('starts as a strip with the quest title and its progress', async () => {
    useWorldStore().hud.quests = all({ producers3: { progress: progress(1, 3) } });
    const wrapper = await mounted();
    expect(wrapper.find('[data-testid="quest-tray"]').exists()).toBe(false);
    const strip = wrapper.get('[data-testid="quest-toggle"]');
    expect(strip.get('[data-testid="quest-strip-title"]').text()).toBe('Build 3 resource producers');
    expect(strip.get('[data-testid="quest-progress-visual"]').attributes('data-kind')).toBe('build');
    expect(strip.find('[data-testid="quest-progress-left"]').exists()).toBe(false);
  });

  it('lights the dot for a quest not seen yet', async () => {
    useWorldStore().hud.quests = all();
    const wrapper = await mounted();
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(true);
  });

  it('clears the dot after opening and keeps it cleared on remount', async () => {
    useWorldStore().hud.quests = all({ longhouse2: { completed: true } });
    const wrapper = await mounted();
    await wrapper.get('[data-testid="quest-toggle"]').trigger('click');
    await wrapper.get('[data-testid="quest-collapse"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(false);
    wrapper.unmount();

    const again = await mounted();
    expect(again.find('[data-testid="quest-toggle"]').exists()).toBe(true);
    expect(again.find('[data-testid="quest-ready-dot"]').exists()).toBe(false);
  });

  it('lights the dot again for a new current quest and for a newly claimable one', async () => {
    const world = useWorldStore();
    world.hud.quests = all();
    const wrapper = await mounted();
    await wrapper.get('[data-testid="quest-toggle"]').trigger('click');
    await wrapper.get('[data-testid="quest-collapse"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(false);

    world.hud.quests = all({ storagehouse1: { completed: true } });
    await flushPromises();
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(true);
    await wrapper.get('[data-testid="quest-toggle"]').trigger('click');
    await wrapper.get('[data-testid="quest-collapse"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(false);

    world.hud.quests = all({ producers3: { claimed: true }, storagehouse1: { completed: true } });
    await flushPromises();
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(true);
  });

  it('opens on tap and collapses again', async () => {
    useWorldStore().hud.quests = all();
    const wrapper = await mounted();
    await wrapper.get('[data-testid="quest-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="quest-current"]').exists()).toBe(true);
    await wrapper.get('[data-testid="quest-collapse"]').trigger('click');
    expect(wrapper.find('[data-testid="quest-tray"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="quest-toggle"]').exists()).toBe(true);
  });

  it('offers More/Less only when the hint overflows its two lines', async () => {
    useWorldStore().hud.quests = all();
    const sh = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(80);
    const ch = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(32);
    const wrapper = await mounted();
    await wrapper.get('[data-testid="quest-toggle"]').trigger('click');
    await flushPromises();
    const hint = wrapper.get('.quest-hint');
    expect(hint.classes('clamped')).toBe(true);
    const more = wrapper.get('[data-testid="quest-more"]');
    expect(more.text()).toBe('More');
    await more.trigger('click');
    expect(wrapper.get('.quest-hint').classes('clamped')).toBe(false);
    expect(wrapper.get('[data-testid="quest-more"]').text()).toBe('Less');
    sh.mockRestore();
    ch.mockRestore();
  });

  it('shows no More button when the hint fits', async () => {
    useWorldStore().hud.quests = all();
    const wrapper = await mounted();
    await wrapper.get('[data-testid="quest-toggle"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="quest-more"]').exists()).toBe(false);
  });
});
