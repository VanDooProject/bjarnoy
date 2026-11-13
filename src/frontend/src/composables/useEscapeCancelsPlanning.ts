// Escape cancels an army movement being planned (a dispatch or a field order), the same as the Cancel button in the army's box.
import { onMounted, onUnmounted } from 'vue';
import { useWorldStore } from '../stores/world';

export function useEscapeCancelsPlanning(): void {
  const world = useWorldStore();

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // Escape inside a text field belongs to that field.
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    if (world.fieldOrderDraft) world.cancelFieldOrder();
    else if (world.dispatchDraft) world.cancelDispatch();
  }

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onUnmounted(() => window.removeEventListener('keydown', onKeydown));
}
