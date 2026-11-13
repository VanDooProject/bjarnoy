import { createDocsNotesSwitch } from './docsNotesSwitch';

// Historical background of units and buildings (finds, dates, sources) on the docs pages. Admin-only
// for now, behind its own "Show history" switch, separate from the admin notes.
export const useDocsHistoryNotes = createDocsNotesSwitch('docs.historyNotes');
