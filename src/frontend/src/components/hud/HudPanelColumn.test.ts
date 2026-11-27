// @vitest-environment jsdom
//
// The desktop icon column: the building info switch plus one icon per panel that has something to show, in a fixed order,
// each toggling its panel's open state.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { ref } from 'vue';
import HudPanelColumn from './HudPanelColumn.vue';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { createTestI18n } from '../../test/i18n';
import { railLeft } from '../../composables/useHudRail';
import enHud from '../../i18n/locales/en/hud.json';
import enQuests from '../../i18n/locales/en/quests.json';

const flags = vi.hoisted(() => ({ draft: undefined as unknown, hasNew: undefined as unknown, content: undefined as unknown, counts: undefined as unknown }));
vi.mock('../../composables/useHudPanelContent', async () => {
  const { ref } = await import('vue');
  flags.content = { construction: ref(true), garrison: ref(true), armies: ref(true), quests: ref(true) };
  flags.draft = ref(false);
  flags.counts = { construction: ref(0), garrison: ref(0), armies: ref(0), quests: ref(0) };
  return { useHudPanelContent: () => flags.content, useHudPanelCounts: () => flags.counts, useHasActiveDraft: () => flags.draft };
});
vi.mock('../../composables/useQuests', async () => {
  const { ref } = await import('vue');
  flags.hasNew = ref(false);
  return { useQuests: () => ({ hasNew: flags.hasNew }) };
});

const counts = () => flags.counts as Record<'construction' | 'garrison' | 'armies' | 'quests', ReturnType<typeof ref<number>>>;
const content = () => flags.content as Record<'construction' | 'garrison' | 'armies' | 'quests', ReturnType<typeof ref<boolean>>>;

function mountColumn() {
  return mount(HudPanelColumn, { global: { plugins: [createTestI18n({ hud: enHud, quests: enQuests })] } });
}

const labels = (w: ReturnType<typeof mountColumn>) => w.findAll('button').map((b) => b.attributes('aria-label'));

describe('HudPanelColumn', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    for (const flag of Object.values(content())) flag.value = true;
    for (const c of Object.values(counts())) c.value = 0;
    (flags.hasNew as ReturnType<typeof ref<boolean>>).value = false;
    (flags.draft as ReturnType<typeof ref<boolean>>).value = false;
    railLeft.value = 16;
  });

  it('sits at the x the dock gives it and follows it', async () => {
    const wrapper = mountColumn();
    const rail = wrapper.get('[data-testid="hud-panel-column"]').element as HTMLElement;
    expect(rail.style.left).toBe('16px');
    railLeft.value = 308;
    await wrapper.vm.$nextTick();
    expect(rail.style.left).toBe('308px');
  });

  it('shows the five icons top to bottom: building info, construction, garrison, armies, quests', () => {
    expect(labels(mountColumn())).toEqual(['Building info (H)', 'Construction', 'Garrison', 'Armies', 'Quests']);
  });

  it('leaves out the icon of a panel that has nothing to show, but never the building info switch or construction', () => {
    content().garrison.value = false;
    content().quests.value = false;
    expect(labels(mountColumn())).toEqual(['Building info (H)', 'Construction', 'Armies']);
    for (const flag of Object.values(content())) flag.value = false;
    expect(labels(mountColumn())).toEqual(['Building info (H)', 'Construction']);
  });

  it('keeps the construction icon with no build orders, dimmed and disabled, and a click changes nothing', async () => {
    content().construction.value = false;
    const wrapper = mountColumn();
    const button = wrapper.get('[data-testid="hud-panel-toggle-construction"]');
    expect(button.attributes('aria-label')).toBe('Construction');
    expect(button.attributes('title')).toBe('Nothing under construction');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.classes()).toContain('hud-panel-column__button--empty');
    const before = useHudPrefsStore().panels.construction.open;
    await button.trigger('click');
    expect(useHudPrefsStore().panels.construction.open).toBe(before);
    // With orders it is a normal, enabled icon again.
    content().construction.value = true;
    await wrapper.vm.$nextTick();
    expect(button.attributes('disabled')).toBeUndefined();
    expect(button.classes()).not.toContain('hud-panel-column__button--empty');
  });

  it.each(['construction', 'armies', 'quests'] as const)('shows the %s count only while its panel is collapsed and the count is above zero', async (id) => {
    counts()[id].value = 3;
    const wrapper = mountColumn();
    const badge = () => wrapper.find(`[data-testid="hud-panel-badge-${id}"]`);
    expect(badge().exists()).toBe(false);
    await wrapper.get(`[data-testid="hud-panel-toggle-${id}"]`).trigger('click');
    expect(badge().text()).toBe('3');
    expect(wrapper.get(`[data-testid="hud-panel-toggle-${id}"]`).attributes('aria-label')).toContain('(3)');
    counts()[id].value = 0;
    await wrapper.vm.$nextTick();
    expect(badge().exists()).toBe(false);
  });

  it('never shows a count badge on the garrison icon', async () => {
    // The counts composable gives garrison no count (always 0), so its collapsed icon has no badge.
    const wrapper = mountColumn();
    await wrapper.get('[data-testid="hud-panel-toggle-garrison"]').trigger('click');
    expect(wrapper.find('[data-testid="hud-panel-badge-garrison"]').exists()).toBe(false);
  });

  it('shows the new-quest dot instead of nothing, but never together with the quest badge', async () => {
    (flags.hasNew as ReturnType<typeof ref<boolean>>).value = true;
    counts().quests.value = 2;
    const wrapper = mountColumn();
    await wrapper.get('[data-testid="hud-panel-toggle-quests"]').trigger('click');
    expect(wrapper.find('[data-testid="hud-panel-badge-quests"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(false);
    counts().quests.value = 0;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(true);
  });

  it('toggles a panel open and closed, pressed meaning open', async () => {
    const wrapper = mountColumn();
    const button = wrapper.get('[data-testid="hud-panel-toggle-garrison"]');
    expect(button.attributes('aria-pressed')).toBe('true');
    await button.trigger('click');
    expect(useHudPrefsStore().panels.garrison.open).toBe(false);
    expect(button.attributes('aria-pressed')).toBe('false');
    await button.trigger('click');
    expect(useHudPrefsStore().panels.garrison.open).toBe(true);
    expect(button.attributes('aria-pressed')).toBe('true');
    // The other panels are untouched.
    expect(useHudPrefsStore().panels.armies.open).toBe(true);
  });

  it('toggles the building info from its button', async () => {
    const wrapper = mountColumn();
    const button = wrapper.get('[data-testid="building-info-toggle"]');
    expect(button.attributes('aria-pressed')).toBe('true');
    await button.trigger('click');
    expect(useHudPrefsStore().buildingInfo).toBe(false);
    expect(button.attributes('aria-pressed')).toBe('false');
  });

  it('shows the new-quest dot only while the quest panel is collapsed', async () => {
    (flags.hasNew as ReturnType<typeof ref<boolean>>).value = true;
    const wrapper = mountColumn();
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(false);
    await wrapper.get('[data-testid="hud-panel-toggle-quests"]').trigger('click');
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(true);
    (flags.hasNew as ReturnType<typeof ref<boolean>>).value = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="quest-ready-dot"]').exists()).toBe(false);
  });

  it('holds the Armies icon pressed and disabled while a draft shows the collapsed Armies panel', async () => {
    useHudPrefsStore().togglePanel('armies');
    const wrapper = mountColumn();
    const button = wrapper.get('[data-testid="hud-panel-toggle-armies"]');
    expect(button.attributes('aria-pressed')).toBe('false');
    (flags.draft as ReturnType<typeof ref<boolean>>).value = true;
    await wrapper.vm.$nextTick();
    expect(button.attributes('aria-pressed')).toBe('true');
    expect(button.attributes('disabled')).toBeDefined();
    (flags.draft as ReturnType<typeof ref<boolean>>).value = false;
    await wrapper.vm.$nextTick();
    expect(button.attributes('aria-pressed')).toBe('false');
    expect(button.attributes('disabled')).toBeUndefined();
  });
});
