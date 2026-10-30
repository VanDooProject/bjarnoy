// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import type { UserResponse } from '../api/types';
import { useDocsAdminNotes } from './useDocsAdminNotes';

const asRole = (role: 'admin' | 'player') => {
  useAuthStore().user = { role } as unknown as UserResponse;
};

describe('useDocsAdminNotes', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useDocsAdminNotes().setEnabled(false);
    localStorage.clear();
  });

  it('stays hidden for a non-admin even when the toggle is stored on', () => {
    asRole('player');
    const notes = useDocsAdminNotes();
    notes.setEnabled(true);

    expect(notes.enabled.value).toBe(true);
    expect(notes.canToggle.value).toBe(false);
    expect(notes.visible.value).toBe(false);
  });

  it('shows for an admin only while the toggle is on', () => {
    asRole('admin');
    const notes = useDocsAdminNotes();

    expect(notes.canToggle.value).toBe(true);
    expect(notes.visible.value).toBe(false);
    notes.setEnabled(true);
    expect(notes.visible.value).toBe(true);
    notes.setEnabled(false);
    expect(notes.visible.value).toBe(false);
  });

  it('persists the choice in localStorage', () => {
    useDocsAdminNotes().setEnabled(true);
    expect(localStorage.getItem('docs.adminNotes')).toBe('1');
    useDocsAdminNotes().setEnabled(false);
    expect(localStorage.getItem('docs.adminNotes')).toBeNull();
  });
});
