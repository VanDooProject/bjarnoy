import { computed, ref } from 'vue';
import { useAuthStore } from '../stores/auth';

// Technical / admin content on the docs pages (map-generation rules, layout
// algorithms, art-pipeline notes) is hidden from players. An admin can switch
// it on; the choice is a per-browser convenience kept in localStorage.
const STORAGE_KEY = 'docs.adminNotes';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

const enabled = ref<boolean>(readStored());

function setEnabled(value: boolean): void {
  enabled.value = value;
  try {
    if (value) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the toggle still works for this page view.
  }
}

export function useDocsAdminNotes() {
  const auth = useAuthStore();
  return {
    canToggle: computed(() => auth.isAdmin),
    enabled,
    visible: computed(() => auth.isAdmin && enabled.value),
    setEnabled,
  };
}
