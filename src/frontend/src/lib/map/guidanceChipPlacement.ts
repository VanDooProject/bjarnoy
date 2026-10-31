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
export function placeChip(
  arrow: Box,
  chip: Size,
  safe: Box,
  prefer: ChipSide,
  gap = 4,
  avoid: readonly Disc[] = [],
): ChipPlacement {
  const order = ([prefer, 'above', 'left', 'right', 'below'] as const satisfies readonly ChipSide[]).filter(
    (side, i, arr) => arr.indexOf(side) === i,
  );

  const maxX = safe.right - chip.width;
  const maxY = safe.bottom - chip.height;
  const clampX = (x: number) => (maxX >= safe.left ? clamp(x, safe.left, maxX) : safe.left);
  const clampY = (y: number) => (maxY >= safe.top ? clamp(y, safe.top, maxY) : safe.top);

  let best: Candidate | null = null;
  let bestOverflow = Infinity;
  for (const side of order) {
    const raw = candidateFor(side, arrow, chip, gap);
    // Each side may slide along its free axis first (above/below
    // horizontally, left/right vertically): that keeps the chip on its own
    // side of the arrow, so it never lands on the arrow or the thing it
    // points at, and a small nudge (e.g. 13px down to clear the HUD bar)
    // no longer throws the chip onto a worse side.
    const candidate =
      side === 'above' || side === 'below' ? { ...raw, x: clampX(raw.x) } : { ...raw, y: clampY(raw.y) };
    const candidateOverflow =
      overflow(candidate.x, candidate.y, chip, safe) + (avoid.length ? coverage(boxAt(candidate, chip), avoid) : 0);
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

  // None of the four sides is clear of the discs (a ring round the arrow's target): the nearest free
  // spot on screen instead - slid along each side of the arrow, or above/below everything it must
  // keep clear of - so the chip never covers what the arrow points at or its neighbours.
  if (bestOverflow > 0 && avoid.length) {
    const hardTrouble = (c: Candidate) => overflow(c.x, c.y, chip, safe) + coverage(boxAt(c, chip), avoid);
    // The arrow's box is the rotated svg's, bigger than the arrow itself: clear of it when there is room, but
    // covering it a little is better than covering a bubble or leaving the screen.
    const trouble = (c: Candidate) => hardTrouble(c) + (boxesOverlap(boxAt(c, chip), arrow) ? 0.001 : 0);
    const arrowCx = (arrow.left + arrow.right) / 2;
    const arrowCy = (arrow.top + arrow.bottom) / 2;
    const distance = (c: Candidate) => Math.hypot(c.x + chip.width / 2 - arrowCx, c.y + chip.height / 2 - arrowCy);
    const top = Math.min(...avoid.map((d) => d.y - d.r)) - gap - chip.height;
    const bottom = Math.max(...avoid.map((d) => d.y + d.r)) + gap;
    const spots: Candidate[] = [];
    for (let x = safe.left; x <= Math.max(safe.left, maxX); x += 8) {
      for (const y of [arrow.top - gap - chip.height, arrow.bottom + gap, top, bottom]) spots.push({ side: 'above', x, y });
    }
    for (let y = safe.top; y <= Math.max(safe.top, maxY); y += 8) {
      for (const x of [arrow.left - gap - chip.width, arrow.right + gap]) spots.push({ side: 'left', x, y });
    }
    // Fewest troubles first (clear of everything, then clear of the bubbles and screen edge), nearest the arrow among equals.
    let free: Candidate | null = null;
    for (const spot of spots) {
      const t = trouble(spot);
      if (!free || t < trouble(free) - 1e-9 || (Math.abs(t - trouble(free)) <= 1e-9 && distance(spot) < distance(free))) free = spot;
    }
    return { x: free!.x, y: free!.y, side: free!.side };
  }

  return { x: clampX(chosen.x), y: clampY(chosen.y), side: chosen.side };
}

/** A round thing the chip must keep clear of (a ring bubble), in the same space as the boxes. */
export interface Disc {
  x: number;
  y: number;
  r: number;
}

/** Breathing room kept between the chip and a disc. */
const DISC_MARGIN_PX = 3;

/** How far `box` reaches into the discs, summed; 0 means it touches none of them. */
function coverage(box: Box, discs: readonly Disc[]): number {
  let total = 0;
  for (const d of discs) {
    const nx = clamp(d.x, box.left, box.right);
    const ny = clamp(d.y, box.top, box.bottom);
    total += Math.max(0, d.r + DISC_MARGIN_PX - Math.hypot(d.x - nx, d.y - ny));
  }
  return total;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** The chip's box when placed with its top-left at `at`. */
function boxAt(at: { x: number; y: number }, chip: Size): Box {
  return { left: at.x, top: at.y, right: at.x + chip.width, bottom: at.y + chip.height };
}
