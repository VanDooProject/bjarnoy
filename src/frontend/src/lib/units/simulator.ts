// Issue #40 phase 7 (frontend): pure helpers behind the premium fight
// simulator (SimulatorView.vue) — kept dependency-free and unit-testable,
// same reasoning as lib/units/armyDispatch.ts/battleReports.ts.
import { ApiError } from '../../api/client';
import type { SimulatorRequest, UnitCountRequest } from '../../api/types';

/** Drops zero/blank counts and turns a `{unit: count}` draft into the wire `UnitCountRequest[]` shape. */
function stacksFrom(counts: Record<string, number>): UnitCountRequest[] {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([unit, count]) => ({ unit, count }));
}

/**
 * Builds a `SimulatorRequest` from the form's draft state. `defenderStacks`/
 * `guestDefenderStacks` are only included when non-empty — both are optional
 * on the wire, and an empty army client-side should read the same as never
 * having filled the section in (an undefended settlement), not as an
 * explicit `[]`. `towerLevel` below 1 and an empty/omitted seed are likewise
 * left out so the request matches what a bare-minimum form actually asked
 * for. Returns `null` when there's nothing to attack with yet (mirrors
 * `buildAttackDispatchRequest`'s own "nothing to send" null).
 */
export function buildSimulatorRequest(
  attackerCounts: Record<string, number>,
  defenderCounts: Record<string, number>,
  guestDefenderCounts: Record<string, number>,
  towerLevel: number,
  mission: 'attack' | 'raid',
  seed?: number | null,
): SimulatorRequest | null {
  const attackerStacks = stacksFrom(attackerCounts);
  if (attackerStacks.length === 0) return null;

  const defenderStacks = stacksFrom(defenderCounts);
  const guestDefenderStacks = stacksFrom(guestDefenderCounts);

  return {
    attackerStacks,
    ...(defenderStacks.length > 0 ? { defenderStacks } : {}),
    ...(guestDefenderStacks.length > 0 ? { guestDefenderStacks } : {}),
    ...(towerLevel > 0 ? { towerLevel } : {}),
    mission,
    ...(seed !== undefined && seed !== null ? { seed } : {}),
  };
}

/**
 * True for the one rejection the simulator form treats as an everyday,
 * expected outcome rather than a bug state: an authenticated-but-not-premium
 * caller hitting `PremiumUserEndpointFilter`'s 403. A 401 (not even logged
 * in — shouldn't normally happen since `/simulator` is behind
 * `meta: { requiresAuth: true }`) is treated as an ordinary error instead.
 */
export function isPremiumRequiredError(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 403) return false;
  return (error.problem as { error?: string } | undefined)?.error === 'premium_required';
}
