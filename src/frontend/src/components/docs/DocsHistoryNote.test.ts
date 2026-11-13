// @vitest-environment jsdom
//
// History notes are admin-only for now: they render only for an admin with the "Show history"
// switch on, independent of the admin-notes switch.
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { h } from 'vue';
import DocsHistoryNote from './DocsHistoryNote.vue';
import DocsAdminNote from './DocsAdminNote.vue';
import DocsPageLayout from './DocsPageLayout.vue';
import { useAuthStore } from '../../stores/auth';
import { useDocsAdminNotes } from '../../composables/useDocsAdminNotes';
import { useDocsHistoryNotes } from '../../composables/useDocsHistoryNotes';
import type { UserResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enDocs from '../../i18n/locales/en/docs.json';

const mountPage = () =>
  mount(DocsPageLayout, {
    props: { title: 'Page', caption: 'DOCS', intro: 'Lede' },
    slots: {
      default: () => [
        h(DocsHistoryNote, { as: 'section', id: 'past' }, () => 'Old finding'),
        h(DocsAdminNote, null, () => 'Secret rule'),
      ],
    },
    global: {
      plugins: [createTestI18n({ docs: enDocs })],
      stubs: { TopBar: true, HudNav: true, MobileHudDrawer: true, RouterLink: true },
    },
  });

describe('DocsHistoryNote', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useDocsHistoryNotes().setEnabled(false);
    useDocsAdminNotes().setEnabled(false);
  });

  it('renders nothing for a player, even with the stored switch on, and offers no switch', () => {
    useAuthStore().user = { role: 'player' } as unknown as UserResponse;
    useDocsHistoryNotes().setEnabled(true);
    const wrapper = mountPage();

    expect(wrapper.find('[data-testid=history-note]').exists()).toBe(false);
    expect(wrapper.find('[data-testid=docs-history-toggle]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Old finding');
  });

  it('shows to an admin only with the history switch on, separately from admin notes', async () => {
    useAuthStore().user = { role: 'admin' } as unknown as UserResponse;
    const wrapper = mountPage();

    expect(wrapper.find('[data-testid=history-note]').exists()).toBe(false);
    await wrapper.get('[data-testid=docs-history-toggle] input').setValue(true);

    const note = wrapper.get('[data-testid=history-note]');
    expect(note.element.tagName).toBe('SECTION');
    expect(note.attributes('id')).toBe('past');
    expect(note.text()).toContain('History');
    expect(note.text()).toContain('Old finding');
    expect(wrapper.find('[data-testid=admin-note]').exists()).toBe(false);

    await wrapper.get('[data-testid=docs-history-toggle] input').setValue(false);
    expect(wrapper.find('[data-testid=history-note]').exists()).toBe(false);
  });
});
