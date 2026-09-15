// Pure drag-distance math for the mobile HUD pull-down drawer
// (see composables/useHudDrawer.ts). Kept free of DOM/Vue so it's cheap to
// unit-test directly with plain numbers.

/** Clamp a drag offset (0 = fully closed, `height` = fully open) into range. */
export function clampOffset(offset: number, height: number): number {
  if (height <= 0) return 0;
  return Math.max(0, Math.min(height, offset));
}

/**
 * Whether releasing now should land the drawer open or closed — a distance
 * threshold (past `openThresholdRatio` of the drawer's height), overridden by
 * a fast flick in either direction regardless of how far the drag got.
 * `velocity` is signed px/ms in the "opening" direction (positive = towards
 * open).
 */
export function shouldOpenOnRelease(
  offset: number,
  height: number,
  velocity: number,
  openThresholdRatio: number,
  flickVelocityPxMs: number,
): boolean {
  if (height <= 0) return false;
  if (velocity > flickVelocityPxMs) return true;
  if (velocity < -flickVelocityPxMs) return false;
  return offset / height >= openThresholdRatio;
}
