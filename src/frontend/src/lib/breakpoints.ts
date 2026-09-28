// Shared breakpoint for the mobile-only HUD bar (pull-down resource drawer,
// compact resource pills, top/bottom docking). Chosen so tablet-portrait
// (768px) and up stay on the desktop path untouched, while anything narrower
// — where the stacked resource bar genuinely has no room — gets the compact
// layout. Plain CSS in this repo has no preprocessor/custom-property access
// inside `@media` conditions, so any `@media (max-width: ...)` rule using
// this breakpoint must repeat the literal by hand — keep them in sync.
export const HUD_COMPACT_MAX_WIDTH = 768;
export const HUD_COMPACT_QUERY = `(max-width: ${HUD_COMPACT_MAX_WIDTH}px)`;

// ProfileModal.vue's own breakpoint — deliberately narrower than
// HUD_COMPACT_MAX_WIDTH above. That one is about the HUD bar running out of
// horizontal room for its pills; this is about a centered ~720px dialog
// no longer fitting comfortably, which happens at a smaller width. Keep any
// `@media (max-width: ...)` rule using it in sync by hand (see
// HUD_COMPACT_MAX_WIDTH's own comment on why).
export const MOBILE_MODAL_MAX_WIDTH = 640;
export const MOBILE_MODAL_QUERY = `(max-width: ${MOBILE_MODAL_MAX_WIDTH}px)`;
