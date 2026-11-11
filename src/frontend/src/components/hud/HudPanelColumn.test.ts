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
import enHud from '../../i18n/locales/en/hud.json';
import enQuests from '../../i18n/locales/en/quests.json';

const flags = vi.hoisted(() => ({ draft: undefined as unknown, hasNew: undefined as unknown, content: undefined as unknown }));
vi.mock('../../composables/useHudPanelContent', async () => {
  const { ref } = await import('vue');
  flags.content = { construction: ref(true), garrison: ref(true), armies: ref(true), quests: ref(true) };
  flags.draft = ref(false);
  return { useHudPanelContent: () => flags.content, useHasActiveDraft: () => flags.draft };
});
vi.mock('../../composables/useQuests', async () => {
  const { ref } = await import('vue');
  flags.hasNew = ref(false);
  return { useQuests: () => ({ hasNew: flags.hasNew }) };
});

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
    (flags.hasNew as ReturnType<typeof ref<boolean>>).value = false;
    (flags.draft as ReturnType<typeof ref<boolean>>).value = false;
  });

  it('shows the five icons top to bottom: building info, construction, garrison, armies, quests', () => {
    expect(labels(mountColumn())).toEqual(['Building info (H)', 'Construction', 'Garrison', 'Armies', 'Quests']);
  });

  it('leaves out the icon of a panel that has nothing to show, but never the building info switch', () => {
    content().construction.value = false;
    content().quests.value = false;
    expect(labels(mountColumn())).toEqual(['Building info (H)', 'Garrison', 'Armies']);
    for (const flag of Object.values(content())) flag.value = false;
    expect(labels(mountColumn())).toEqual(['Building info (H)']);
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
