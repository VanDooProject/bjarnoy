import { createDocsNotesSwitch } from './docsNotesSwitch';

// Technical / admin content on the docs pages (map-generation rules, layout
// algorithms, art-pipeline notes) is hidden from players. An admin can switch
// it on; the choice is a per-browser convenience kept in localStorage.
export const useDocsAdminNotes = createDocsNotesSwitch('docs.adminNotes');
