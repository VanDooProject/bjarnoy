// Whether an army already out in the field can take a new order, and what it costs: the client twin of the backend's field-order
// checks (docs/design/troop-movement-range.md §1 and §3). The part that leaves must reach the target and still afford the way home from
// there with its share of the provisions. Pure (the pathfinder is injected through `env.route`), so it runs for every candidate army
// whenever the send picker or the ring menu needs a verdict, and is unit-testable without a world.
import { neighbors, type AxialCoord } from '../hex/coords';
import type { UnitDefinitionResponse } from '../../api/types';
import { classifyUnitSelection, totalSpeed, totalUpkeepPerHour } from './armyDispatch';

export type SendMission = 'move' | 'attack' | 'support' | 'hunt';

/** The slice of an `ArmyResponse` the verdict reads. */
export interface FeasibilityArmy {
  provisions: number;
  stacks: ReadonlyArray<{ unit: string; count: number }>;
  position: AxialCoord;
  movement: { path: ReadonlyArray<AxialCoord>; arrivesAt: string; isReturning: boolean } | null;
}

export interface FeasibilityEnv {
  byType: Record<string, UnitDefinitionResponse>;
  /** The world's speed factor (`WorldResponse.speedFactor`): hexes per hour are the army's pace times this. */
  worldSpeedFactor: number;
  now: number;
  /**
   * Cheapest route from `from` to `to`, both included, with its price in hex-cost units (1.0 = one grass hex), or `null` when there is
   * none. `fleet` asks for the sea table (open water only, 1.0 a hex), otherwise the land rules (`findPath`). `'pending'` while the
   * search has not finished yet (it runs in the background, see lib/map/routeQueue.ts): the verdict is then `pending`, not `unreachable`.
   */
  route(from: AxialCoord, to: AxialCoord, fleet: boolean): { path: AxialCoord[]; cost: number } | null | 'pending';
}

export type FieldOrderVerdict =
  | {
      ok: true;
      /** Hours from now until the leaving part stands on the target (a marching army first finishes its current leg). */
      outboundHours: number;
      /** Hours the way home takes from the target. */
      returnHours: number;
      travelMinutes: number;
      fleet: boolean;
      /** Outbound route: where the army will stand when the order starts (its destination), through to the target. */
      path: AxialCoord[];
    }
  | { ok: false; reason: 'noUnits' | 'unreachable' | 'noFood' | 'pending' };

/** The unit-count map of an army's stacks. */
export function stackCounts(stacks: ReadonlyArray<{ unit: string; count: number }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of stacks) if (s.count > 0) counts[s.unit] = (counts[s.unit] ?? 0) + s.count;
  return counts;
}

/**
 * The verdict for sending `units` (default: the whole army) of a field army at `target`.
 *
 * - The order starts where the army will stand: a standing army where it is, a marching one at its current destination (a march
 *   always finishes, so the hours it still has to walk count too).
 * - The way home is planned from the target to the hex the army left from (`movement.path[0]`).
 * - Food: the leaving part gets its upkeep share of the provisions and has to cover (outbound + return) hours at its own upkeep.
 *   Pace is the slowest leaving unit's, so splitting off the slow ones can change the verdict.
 *
 * A hunt walks to the nearest reachable hex around the camp when the camp's own hex is not walkable, like the server does.
 */
export function fieldOrderFeasibility(
  army: FeasibilityArmy,
  target: AxialCoord,
  mission: SendMission,
  env: FeasibilityEnv,
  units?: Record<string, number>,
): FieldOrderVerdict {
  const whole = stackCounts(army.stacks);
  const leaving = units ?? whole;
  const partUpkeep = totalUpkeepPerHour(leaving, env.byType);
  const speed = totalSpeed(leaving, env.byType) * env.worldSpeedFactor;
  if (partUpkeep <= 0 || speed <= 0) return { ok: false, reason: 'noUnits' };

  const movement = army.movement;
  const start = movement && movement.path.length > 0 ? movement.path[movement.path.length - 1]! : army.position;
  const home = movement && movement.path.length > 0 ? movement.path[0]! : null;
  if (!home) return { ok: false, reason: 'unreachable' };
  const stillMarching = !!movement && !movement.isReturning && Date.parse(movement.arrivesAt) > env.now;
  const legHours = stillMarching ? Math.max(0, (Date.parse(movement!.arrivesAt) - env.now) / 3_600_000) : 0;

  const fleet = classifyUnitSelection(leaving, env.byType) === 'fleet';
  const goals = mission === 'hunt' && !fleet ? [target, ...neighbors(target)] : [target];
  let best: { goal: AxialCoord; leg: { path: AxialCoord[]; cost: number } } | null = null;
  let anyPending = false;
  for (const goal of goals) {
    const leg = env.route(start, goal, fleet);
    if (leg === 'pending') anyPending = true;
    else if (leg && (!best || leg.cost < best.leg.cost)) best = { goal, leg };
  }
  // A goal still being searched could turn out cheaper than the best so far, so the verdict waits for all of them.
  if (anyPending) return { ok: false, reason: 'pending' };
  if (!best) return { ok: false, reason: 'unreachable' };
  const back = env.route(best.goal, home, fleet);
  if (back === 'pending') return { ok: false, reason: 'pending' };
  if (!back) return { ok: false, reason: 'unreachable' };

  const outboundHours = legHours + best.leg.cost / speed;
  const returnHours = back.cost / speed;
  const wholeUpkeep = totalUpkeepPerHour(whole, env.byType);
  const provisionsShare = army.provisions * (wholeUpkeep > 0 ? Math.min(1, partUpkeep / wholeUpkeep) : 1);
  // Provisions only ever decrease and the server checks the exact figure, so a hair of float noise must not flip the verdict.
  if (provisionsShare + 1e-9 < (outboundHours + returnHours) * partUpkeep) return { ok: false, reason: 'noFood' };

  return {
    ok: true,
    outboundHours,
    returnHours,
    travelMinutes: Math.max(1, Math.round(outboundHours * 60)),
    fleet,
    path: best.leg.path,
  };
}
