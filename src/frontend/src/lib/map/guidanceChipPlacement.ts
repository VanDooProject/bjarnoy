/**
 * Pure placement maths for GuidancePointer.vue's label chip.
 *
 * The chip used to be placed purely by CSS, relative to the arrow: desktop
 * put it left/right of the arrow (`chipSide`), and a `max-width: 768px`
 * media query moved it to centred-above instead. Neither rule ever looked at
 * the actual viewport, so on a narrow phone (320px) the side placement ran
 * the chip off the right edge, and in landscape (667x375, a short viewport)
 * "above" pushed it up under the HUD bar, off the top.
 *
 * `placeChip` replaces that guesswork with real measurement: given the
 * arrow's on-screen box, the chip's own size, and the safe area it has to
 * stay inside (excluding the HUD bar), it picks whichever of the four
 * candidate positions (above/left/right/below the arrow) actually fits, and
 * falls back to whichever overflows the *least* — then clamped — when none
 * do. GuidancePointer.vue calls this every animation frame (the arrow moves
 * with the camera) and writes the result as inline `left`/`top`, with the
 * old CSS kept only as the pre-measurement fallback for the first paint.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export type ChipSide = 'above' | 'left' | 'right' | 'below';

export interface ChipPlacement {
  x: number;
  y: number;
  side: ChipSide;
}

interface Candidate {
  side: ChipSide;
  x: number;
  y: number;
}

function candidateFor(side: ChipSide, arrow: Box, chip: Size, gap: number): Candidate {
  const arrowCx = (arrow.left + arrow.right) / 2;
  const arrowCy = (arrow.top + arrow.bottom) / 2;
  switch (side) {
    case 'above':
      return { side, x: arrowCx - chip.width / 2, y: arrow.top - gap - chip.height };
    case 'below':
      return { side, x: arrowCx - chip.width / 2, y: arrow.bottom + gap };
    case 'left':
      return { side, x: arrow.left - gap - chip.width, y: arrowCy - chip.height / 2 };
    case 'right':
      return { side, x: arrow.right + gap, y: arrowCy - chip.height / 2 };
  }
}

/** How far a candidate's box (at `x`,`y`, sized `chip`) falls outside `safe`, summed over all four edges. 0 means it fits entirely. */
function overflow(x: number, y: number, chip: Size, safe: Box): number {
  const left = Math.max(0, safe.left - x);
  const top = Math.max(0, safe.top - y);
  const right = Math.max(0, x + chip.width - safe.right);
  const bottom = Math.max(0, y + chip.height - safe.bottom);
  return left + top + right + bottom;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Picks where the chip's top-left should land (in the same coordinate space
 * as `arrow` and `safe` — viewport px), preferring `prefer` and then trying
 * above/left/right/below in that order (duplicates of `prefer` skipped), and
 * finally clamping into `safe` so the result is always fully on screen
 * (aside from the "chip wider/taller than the safe box" case, where it's
 * aligned to `safe`'s near edge instead of centred outside it).
 */
export function placeChip(arrow: Box, chip: Size, safe: Box, prefer: ChipSide, gap = 4): ChipPlacement {
  const order = ([prefer, 'above', 'left', 'right', 'below'] as const satisfies readonly ChipSide[]).filter(
    (side, i, arr) => arr.indexOf(side) === i,
  );

  let best: Candidate | null = null;
  let bestOverflow = Infinity;
  for (const side of order) {
    const candidate = candidateFor(side, arrow, chip, gap);
    const candidateOverflow = overflow(candidate.x, candidate.y, chip, safe);
    if (candidateOverflow === 0) {
      best = candidate;
      bestOverflow = 0;
      break;
    }
    if (candidateOverflow < bestOverflow) {
      best = candidate;
      bestOverflow = candidateOverflow;
    }
  }
  // `order` always has at least `prefer`, so `best` is never null here.
  const chosen = best!;

  const maxX = safe.right - chip.width;
  const maxY = safe.bottom - chip.height;
  const x = maxX >= safe.left ? clamp(chosen.x, safe.left, maxX) : safe.left;
  const y = maxY >= safe.top ? clamp(chosen.y, safe.top, maxY) : safe.top;
  return { x, y, side: chosen.side };
}
