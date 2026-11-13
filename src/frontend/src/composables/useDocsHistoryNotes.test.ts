// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import type { UserResponse } from '../api/types';
import { useDocsHistoryNotes } from './useDocsHistoryNotes';
import { useDocsAdminNotes } from './useDocsAdminNotes';

const asRole = (role: 'admin' | 'player') => {
  useAuthStore().user = { role } as unknown as UserResponse;
};

describe('useDocsHistoryNotes', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useDocsHistoryNotes().setEnabled(false);
    useDocsAdminNotes().setEnabled(false);
    localStorage.clear();
  });

  it('stays hidden for a non-admin even when the switch is stored on', () => {
    asRole('player');
    const notes = useDocsHistoryNotes();
    notes.setEnabled(true);

    expect(notes.canToggle.value).toBe(false);
    expect(notes.visible.value).toBe(false);
  });

  it('shows for an admin only while the switch is on', () => {
    asRole('admin');
    const notes = useDocsHistoryNotes();

    expect(notes.visible.value).toBe(false);
    notes.setEnabled(true);
    expect(notes.visible.value).toBe(true);
    notes.setEnabled(false);
    expect(notes.visible.value).toBe(false);
  });

  it('keeps its own storage key, independent of the admin notes', () => {
    asRole('admin');
    useDocsHistoryNotes().setEnabled(true);
    expect(localStorage.getItem('docs.historyNotes')).toBe('1');
    expect(localStorage.getItem('docs.adminNotes')).toBeNull();
    expect(useDocsAdminNotes().visible.value).toBe(false);
    useDocsHistoryNotes().setEnabled(false);
    expect(localStorage.getItem('docs.historyNotes')).toBeNull();
  });
});
