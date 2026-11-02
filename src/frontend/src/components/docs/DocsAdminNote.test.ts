// @vitest-environment jsdom
//
// Admin notes are technical docs content players must never see. These tests
// pin the gate: the note renders only for an admin with the header toggle on,
// and the toggle (in DocsPageLayout's header) only exists for admins.
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { h } from 'vue';
import DocsAdminNote from './DocsAdminNote.vue';
import DocsPageLayout from './DocsPageLayout.vue';
import { useAuthStore } from '../../stores/auth';
import { useDocsAdminNotes } from '../../composables/useDocsAdminNotes';
import type { UserResponse } from '../../api/types';
import { createTestI18n } from '../../test/i18n';
import enDocs from '../../i18n/locales/en/docs.json';

const mountPage = () =>
  mount(DocsPageLayout, {
    props: { title: 'Page', caption: 'DOCS', intro: 'Lede' },
    slots: { default: () => h(DocsAdminNote, { as: 'section', id: 'rules' }, () => 'Secret rule') },
    global: {
      plugins: [createTestI18n({ docs: enDocs })],
      stubs: { TopBar: true, HudNav: true, MobileHudDrawer: true, RouterLink: true },
    },
  });

describe('DocsAdminNote', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useDocsAdminNotes().setEnabled(false);
  });

  it('renders nothing for a player, even with the stored toggle on, and offers no toggle', () => {
    useAuthStore().user = { role: 'player' } as unknown as UserResponse;
    useDocsAdminNotes().setEnabled(true);
    const wrapper = mountPage();

    expect(wrapper.find('[data-testid=admin-note]').exists()).toBe(false);
    expect(wrapper.find('[data-testid=docs-admin-toggle]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Secret rule');
  });

  it('hides the note from an admin until the toggle is switched on', async () => {
    useAuthStore().user = { role: 'admin' } as unknown as UserResponse;
    const wrapper = mountPage();

    expect(wrapper.find('[data-testid=admin-note]').exists()).toBe(false);
    await wrapper.get('[data-testid=docs-admin-toggle] input').setValue(true);

    const note = wrapper.get('[data-testid=admin-note]');
    expect(note.element.tagName).toBe('SECTION');
    expect(note.attributes('id')).toBe('rules');
    expect(note.text()).toContain('Admin note');
    expect(note.text()).toContain('Secret rule');

    await wrapper.get('[data-testid=docs-admin-toggle] input').setValue(false);
    expect(wrapper.find('[data-testid=admin-note]').exists()).toBe(false);
  });
});
