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

/** One gesture-frame's delta, split between the drawer's scroll container and its drag offset. */
export interface DrawerDragSplit {
  /** Amount to add to the scroll container's current `scrollTop`. */
  scrollDelta: number;
  /** Remaining amount, if any, to add to the drawer's own drag offset. */
  dragDelta: number;
}

/**
 * Splits one incremental pointer-move delta between the open drawer's
 * scroll container and the drawer's own drag offset. This is what makes the
 * open drawer a "native sheet": scrolling its content takes priority over
 * closing it.
 *
 * `rawDelta` is the *raw* screen-space finger/pointer delta (positive =
 * moved down), not useHudDrawer's own "opening direction is positive"
 * convention — natural touch/wheel scrolling always moves the content with
 * the finger regardless of which edge the bar docks to (finger moves up ⇒
 * content scrolls down, i.e. `scrollTop` rises), so the scroll half of this
 * split has to work in raw screen space. Only the *leftover* — the part the
 * scroll container couldn't absorb — gets converted into `edge`'s
 * opening-positive convention for the drag offset, via the same sign flip
 * useHudDrawer's own gesture math uses (`edge === 'top' ? 1 : -1`).
 *
 * Concretely: `scrollTop -= rawDelta`, clamped to `[0, maxScrollTop]`;
 * whatever of `rawDelta` that clamp couldn't absorb is the leftover that
 * drags the sheet instead. For a top-docked bar that leftover closes once
 * scrolled to the end (finger up) and is harmlessly a no-op once scrolled
 * to the start (finger down — the drawer's already fully open). For a
 * bottom-docked bar it mirrors: finger down scrolls towards the start and
 * only closes once `scrollTop` hits 0; finger up scrolls towards the end
 * and never closes. Content that doesn't overflow (`scrollHeight <=
 * clientHeight`) has no room to scroll either way, so the whole delta
 * (converted to `edge`'s convention) passes straight through to the drag
 * offset — today's behaviour, unchanged.
 */
export function splitDrawerDragDelta(
  rawDelta: number,
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  edge: 'top' | 'bottom',
): DrawerDragSplit {
  const sign = edge === 'top' ? 1 : -1;
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  if (maxScrollTop <= 0 || rawDelta === 0) return { scrollDelta: 0, dragDelta: rawDelta * sign };
  const desiredScrollTop = scrollTop - rawDelta;
  const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, desiredScrollTop));
  const scrollDelta = clampedScrollTop - scrollTop;
  const consumedRaw = -scrollDelta; // the portion of rawDelta the scroll actually absorbed
  const leftoverRaw = rawDelta - consumedRaw;
  // `-0` would appear whenever a value comes out exactly zero after these
  // subtractions (e.g. scrollTop already at the clamp it's heading towards)
  // — normalized away so callers comparing against a plain `0` (including
  // this function's own tests) don't have to know about signed-zero.
  return { scrollDelta: scrollDelta === 0 ? 0 : scrollDelta, dragDelta: leftoverRaw === 0 ? 0 : leftoverRaw * sign };
}
