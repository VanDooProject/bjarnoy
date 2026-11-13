import { computed, ref } from 'vue';
import { useAuthStore } from '../stores/auth';

// Shared behaviour of the admin-only docs switches (admin notes, history notes): a per-browser
// choice kept in localStorage under its own key, effective only for an admin.
export function createDocsNotesSwitch(storageKey: string) {
  function readStored(): boolean {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  }

  const enabled = ref<boolean>(readStored());

  function setEnabled(value: boolean): void {
    enabled.value = value;
    try {
      if (value) localStorage.setItem(storageKey, '1');
      else localStorage.removeItem(storageKey);
    } catch {
      // Storage blocked: the toggle still works for this page view.
    }
  }

  return () => {
    const auth = useAuthStore();
    return {
      canToggle: computed(() => auth.isAdmin),
      enabled,
      visible: computed(() => auth.isAdmin && enabled.value),
      setEnabled,
    };
  };
}
