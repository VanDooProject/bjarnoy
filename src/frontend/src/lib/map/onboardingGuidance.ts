// The guided landing-page checklist's decision logic, kept out of
// LandingView.vue (which mounts a real Pixi renderer and so has no test
// file of its own — see LandingView.vue's own comments) so the actual
// "what step are we on / what's done" contract can be asserted directly,
// the same way ringLayout.ts's geometry is tested apart from RingMenu.vue.
import type { Tile } from './types';

/** The two buildings the onboarding ring guides the player toward — see LandingView.vue's own GUIDED_BUILD_TERRAIN. */
export type GuidedBuildType = 'farm' | 'lumberjack';
export const GUIDED_BUILD_TYPES: readonly GuidedBuildType[] = ['farm', 'lumberjack'];

export type ChecklistRowKey = 'longhouse' | GuidedBuildType;
export type ChecklistRowState = 'done' | 'current' | 'upcoming';

export interface ChecklistRow {
  key: ChecklistRowKey;
  state: ChecklistRowState;
}

export interface OnboardingGuidance {
  /** 1-based, out of `totalSteps` — stays at `totalSteps` once `complete`. */
  step: number;
  totalSteps: number;
  /** 0..1, for the progress bar. */
  progress: number;
  complete: boolean;
  rows: ChecklistRow[];
}

const TOTAL_STEPS = 1 + GUIDED_BUILD_TYPES.length;

/**
 * Derives the checklist purely from what's actually standing
 * (`WorldModel.listPlacedBuildings`, surfaced as `hud.placedBuildingTypes`)
 * rather than a separately tracked step counter that could drift from the
 * real build order. The ring only requires the clicked tile's terrain to
 * match a guided type (grass -> farm, forest -> lumberjack), so the player
 * can place either one first — a row is "done" the moment its type appears
 * anywhere in `placedTypes`, regardless of order.
 */
export function deriveOnboardingGuidance(
  hasFounded: boolean,
  placedTypes: readonly Tile['buildingType'][],
): OnboardingGuidance {
  const placed = new Set(placedTypes);
  const rows: ChecklistRow[] = [
    { key: 'longhouse', state: hasFounded ? 'done' : 'upcoming' },
    ...GUIDED_BUILD_TYPES.map((type) => ({
      key: type,
      state: (placed.has(type) ? 'done' : 'upcoming') as ChecklistRowState,
    })),
  ];

  // Exactly one row reads "current": the first not-yet-done row, if any.
  const firstUpcoming = rows.findIndex((row) => row.state !== 'done');
  if (firstUpcoming !== -1) rows[firstUpcoming] = { ...rows[firstUpcoming], state: 'current' };

  const doneCount = rows.filter((row) => row.state === 'done').length;
  const complete = doneCount === TOTAL_STEPS;

  return {
    step: Math.min(doneCount + 1, TOTAL_STEPS),
    totalSteps: TOTAL_STEPS,
    progress: doneCount / TOTAL_STEPS,
    complete,
    rows,
  };
}

/**
 * Which guided building type the next-step pointer (GuidancePointer.vue)
 * should aim the player at — the first not-yet-placed guided type, or
 * `null` once both are done (or before founding, when there's nothing to
 * point at on the ring yet).
 */
export function nextGuidedType(placedTypes: readonly Tile['buildingType'][]): GuidedBuildType | null {
  const placed = new Set(placedTypes);
  return GUIDED_BUILD_TYPES.find((type) => !placed.has(type)) ?? null;
}
