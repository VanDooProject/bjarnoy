import { onUnmounted } from 'vue';

// Real data-entry forms register a "dirty" predicate while mounted, so an
// app update (lib/appUpdate.ts) never reloads away what the player typed.
const predicates = new Set<() => boolean>();

export function hasUnsavedInput(): boolean {
  for (const isDirty of predicates) if (isDirty()) return true;
  return false;
}

/** Registers `isDirty` for the lifetime of the calling component; returns the unregister function. */
export function registerUnsavedInput(isDirty: () => boolean): () => void {
  predicates.add(isDirty);
  return () => void predicates.delete(isDirty);
}

/** `isDirty`: the user typed or changed something a reload would lose. */
export function useUnsavedInput(isDirty: () => boolean): void {
  onUnmounted(registerUnsavedInput(isDirty));
}
