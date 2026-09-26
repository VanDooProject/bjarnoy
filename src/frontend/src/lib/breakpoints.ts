// Shared breakpoint for the mobile-only HUD bar (pull-down resource drawer,
// compact resource pills, top/bottom docking). Chosen so tablet-portrait
// (768px) and up stay on the desktop path untouched, while anything narrower
// — where the stacked resource bar genuinely has no room — gets the compact
// layout. Plain CSS in this repo has no preprocessor/custom-property access
// inside `@media` conditions, so any `@media (max-width: ...)` rule using
// this breakpoint must repeat the literal by hand — keep them in sync.
export const HUD_COMPACT_MAX_WIDTH = 768;
export const HUD_COMPACT_QUERY = `(max-width: ${HUD_COMPACT_MAX_WIDTH}px)`;
