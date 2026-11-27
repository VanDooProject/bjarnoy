// Escape steps back out of army planning, the same as the Cancel button in the army's box: the send picker closes (with the order it
// was composing), else a field order or a dispatch being planned is cancelled, else the selected army is deselected, so map clicks
// open the ring menu again instead of queueing waypoints for it. One step per press.
import { onMounted, onUnmounted } from 'vue';
import { useWorldStore } from '../stores/world';

export function useEscapeCancelsPlanning(host: { ringOpen?: () => boolean } = {}): void {
  const world = useWorldStore();

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    // Escape inside a text field belongs to that field.
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    if (world.sendPicker) world.closeSendPicker();
    else if (world.fieldOrderDraft) world.cancelFieldOrder();
    else if (world.dispatchDraft) world.cancelDispatch();
    // The open ring takes this Escape itself (it closes).
    else if (world.selectedArmyId && !host.ringOpen?.()) world.clearSelectedArmy();
  }

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onUnmounted(() => window.removeEventListener('keydown', onKeydown));
}
