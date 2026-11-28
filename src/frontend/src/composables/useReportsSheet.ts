import { ref } from 'vue';

// Whether the phone's Reports sheet is open. A shared singleton: the Reports chip (ReportsChip.vue) opens it, the sheet
// (ReportsSheet.vue) shows it and closes itself, and MapView.vue closes it when the chip goes away.
export const reportsSheetOpen = ref(false);
