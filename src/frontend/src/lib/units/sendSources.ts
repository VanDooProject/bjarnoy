// The one answer to "which armies can be sent at this target": the source picker (SendArmyPicker.vue) lists these rows and MapView
// reads them for the army markers it makes tappable, so the two can never disagree. A source is the home garrison or an army already
// out in the field. The ring's Send army / Attack / Support / Hunt bubbles do not read it: they only open the picker.
import type { AxialCoord } from '../hex/coords';
import type { ArmyResponse, UnitDefinitionResponse } from '../../api/types';
import { canFieldOrderArmy, garrisonCanHunt, isFieldOrderMidMarch } from './armyDispatch';
import { fieldOrderFeasibility, type FeasibilityEnv, type FieldOrderVerdict, type SendMission } from './fieldOrderFeasibility';

export type SourceBlock =
  | 'noUnits'
  | 'wrongClass'
  | 'supporting'
  | 'returning'
  | 'notOrderable'
  | 'premium'
  | 'unreachable'
  | 'noFood'
  | 'pending';

export interface SendTarget {
  mission: SendMission;
  /** The hex being sent at: the tapped tile, a settlement's hex, or the camp's. */
  coord: AxialCoord;
  /** A hunt at a camp on the sea: ships go, land units cannot. */
  campAtSea: boolean;
  /** A hunt at a sand camp: land units go, and a fleet carries them (the ships do not fight); `garrisonCanHunt` already needs a land unit. */
  campOnSand?: boolean;
}

export interface SendSource {
  /** `'home'` or the army's id. */
  id: string;
  kind: 'home' | 'field';
  ok: boolean;
  /** Why the source cannot go (set exactly when `ok` is false). */
  block?: SourceBlock;
  /** The block is the premium gate: the row shows a lock. */
  locked: boolean;
  /** A standing army can be split; a marching one moves whole. Always false for home (its own unit picker decides). */
  standing: boolean;
  army?: ArmyResponse;
  /** Minutes until the whole army stands on the target; null where unknown (home, or no route). */
  travelMinutes: number | null;
  verdict?: FieldOrderVerdict;
}

export interface SendSourceInput {
  target: SendTarget;
  garrison: ReadonlyArray<{ unit: string; count: number }>;
  armies: ReadonlyArray<ArmyResponse>;
  isPremium: boolean;
  byType: Record<string, UnitDefinitionResponse>;
  env: FeasibilityEnv;
}

/** Every source for `target`: home first, then the field armies that can go (quickest first), then those that cannot. */
export function evaluateSendSources(input: SendSourceInput): SendSource[] {
  const { target, garrison, armies, isPremium, byType, env } = input;
  const homeUnits = garrison.filter((g) => g.count > 0);
  const homeBlock: SourceBlock | undefined =
    homeUnits.length === 0 ? 'noUnits' : target.mission === 'hunt' && !garrisonCanHunt(garrison, byType, target.campAtSea) ? 'wrongClass' : undefined;
  const home: SendSource = {
    id: 'home',
    kind: 'home',
    ok: !homeBlock,
    block: homeBlock,
    locked: false,
    standing: false,
    travelMinutes: null,
  };

  const field = armies
    .filter((a) => !a.atHome)
    .map((army): SendSource => {
      const base = { id: army.id, kind: 'field' as const, army, standing: !isFieldOrderMidMarch(army, env.now) };
      const blocked = (block: SourceBlock, verdict?: FieldOrderVerdict): SendSource => ({
        ...base,
        ok: false,
        block,
        locked: block === 'premium',
        travelMinutes: verdict?.ok ? verdict.travelMinutes : null,
        verdict,
      });
      if (target.mission === 'hunt' && !garrisonCanHunt(army.stacks, byType, target.campAtSea)) return blocked('wrongClass');
      if (army.supporting) return blocked('supporting');
      if (army.movement?.isReturning) return blocked('returning');
      if (!canFieldOrderArmy(army)) return blocked('notOrderable');
      const verdict = fieldOrderFeasibility(army, target.coord, target.mission, env);
      // The premium gate wins over a route still being searched; the verdict only fills in the travel time.
      if (!base.standing && !isPremium) return blocked('premium', verdict);
      if (!verdict.ok) return blocked(verdict.reason, verdict);
      return { ...base, ok: true, locked: false, travelMinutes: verdict.travelMinutes, verdict };
    });

  field.sort(
    (a, b) =>
      Number(b.ok) - Number(a.ok) ||
      (a.travelMinutes ?? Number.POSITIVE_INFINITY) - (b.travelMinutes ?? Number.POSITIVE_INFINITY) ||
      a.id.localeCompare(b.id),
  );
  return [home, ...field];
}
