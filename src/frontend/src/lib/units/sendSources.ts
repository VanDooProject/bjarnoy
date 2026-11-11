// The one answer to "which armies can be sent at this target": the source picker (SendArmyPicker.vue) lists these rows and MapView
// reads them for the army markers it makes tappable, so the two can never disagree. A source is the home garrison of one of the
// player's realms or an army of one of them already out in the field. The ring's Send army / Attack / Hunt bubbles do not read it: they
// only open the picker.
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
  /** An attack's target settlement. */
  targetSettlementId?: string | null;
  /** The player's realm that owns the tapped hex: a plain move for its own sources, a support for the player's other realms. */
  ownRealmId?: string | null;
  /** With `ownRealmId`: the garrison spot of that realm a source of another realm joins (the tapped spot, else its centre). */
  supportSpot?: AxialCoord | null;
}

/** What one source does at the target: the same hex is a move for the realm that owns it and a support for the player's other realms. */
export interface SourceMission {
  mission: SendMission;
  /** The hex the army walks to: the support spot for a support, else the target hex. */
  coord: AxialCoord;
  targetSettlementId: string | null;
  targetBuildingCoord: AxialCoord | null;
}

export function missionFor(target: SendTarget, realmId: string): SourceMission {
  if (target.mission === 'move' && target.ownRealmId && target.supportSpot && realmId !== target.ownRealmId) {
    return { mission: 'support', coord: target.supportSpot, targetSettlementId: target.ownRealmId, targetBuildingCoord: target.supportSpot };
  }
  return {
    mission: target.mission,
    coord: target.coord,
    targetSettlementId: target.mission === 'attack' ? (target.targetSettlementId ?? null) : null,
    targetBuildingCoord: null,
  };
}

/** A realm's home row id; a field army's row id is the army's own id. */
export function homeSourceId(realmId: string): string {
  return `home:${realmId}`;
}
export function isHomeSourceId(id: string): boolean {
  return id.startsWith('home:');
}

/** One of the player's realms with what it can send: its home garrison and the armies it has out in the field. */
export interface SendRealm {
  /** The realm's id (its oldest member): the settlement the garrison dispatches from. */
  realmId: string;
  name: string;
  /** The realm that is open in the client: its rows come first. */
  current: boolean;
  garrison: ReadonlyArray<{ unit: string; count: number }>;
  armies: ReadonlyArray<ArmyResponse>;
}

export interface SendSource {
  /** `home:<realmId>` or the army's id. */
  id: string;
  kind: 'home' | 'field';
  realmId: string;
  realmName: string;
  /** The realm is the one open in the client. */
  current: boolean;
  /** What this source does at the target (a move for the owning realm, a support for the others). */
  mission: SendMission;
  /** The target settlement of that mission (attack, support), null otherwise. */
  targetSettlementId: string | null;
  /** The garrison spot a support joins, null otherwise. */
  targetBuildingCoord: AxialCoord | null;
  /** The hex this source walks to. */
  targetCoord: AxialCoord;
  ok: boolean;
  /** Why the source cannot go (set exactly when `ok` is false). */
  block?: SourceBlock;
  /** The block is the premium gate: the row shows a lock. */
  locked: boolean;
  /** A standing army can be split; a marching one moves whole. Always false for home (its own unit picker decides). */
  standing: boolean;
  army?: ArmyResponse;
  /** Units in the garrison (home) or in the army (field). */
  unitCount: number;
  /** Minutes until the whole army stands on the target; null where unknown (home, or no route). */
  travelMinutes: number | null;
  verdict?: FieldOrderVerdict;
}

export interface SendSourceInput {
  target: SendTarget;
  realms: ReadonlyArray<SendRealm>;
  isPremium: boolean;
  byType: Record<string, UnitDefinitionResponse>;
  env: FeasibilityEnv;
}

function countUnits(stacks: ReadonlyArray<{ count: number }>): number {
  return stacks.reduce((sum, s) => sum + Math.max(0, s.count), 0);
}

function sourcesOfRealm(realm: SendRealm, input: SendSourceInput): { home: SendSource; field: SendSource[] } {
  const { target, isPremium, byType, env } = input;
  const garrison = realm.garrison;
  const where = missionFor(target, realm.realmId);
  const common = {
    realmId: realm.realmId,
    realmName: realm.name,
    current: realm.current,
    mission: where.mission,
    targetSettlementId: where.targetSettlementId,
    targetBuildingCoord: where.targetBuildingCoord,
    targetCoord: where.coord,
  };
  const homeUnits = garrison.filter((g) => g.count > 0);
  const homeBlock: SourceBlock | undefined =
    homeUnits.length === 0 ? 'noUnits' : target.mission === 'hunt' && !garrisonCanHunt(garrison, byType, target.campAtSea) ? 'wrongClass' : undefined;
  const home: SendSource = {
    ...common,
    id: homeSourceId(realm.realmId),
    kind: 'home',
    ok: !homeBlock,
    block: homeBlock,
    locked: false,
    standing: false,
    unitCount: countUnits(garrison),
    travelMinutes: null,
  };

  const field = realm.armies
    .filter((a) => !a.atHome)
    .map((army): SendSource => {
      const base = { ...common, id: army.id, kind: 'field' as const, army, unitCount: countUnits(army.stacks), standing: !isFieldOrderMidMarch(army, env.now) };
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
      const verdict = fieldOrderFeasibility(army, where.coord, where.mission, env);
      // The premium gate wins over a route still being searched; the verdict only fills in the travel time.
      if (!base.standing && !isPremium) return blocked('premium', verdict);
      if (!verdict.ok) return blocked(verdict.reason, verdict);
      return { ...base, ok: true, locked: false, travelMinutes: verdict.travelMinutes, verdict };
    });
  return { home, field };
}

function byGoing(a: SendSource, b: SendSource): number {
  return (
    Number(b.ok) - Number(a.ok) ||
    (a.travelMinutes ?? Number.POSITIVE_INFINITY) - (b.travelMinutes ?? Number.POSITIVE_INFINITY) ||
    a.realmName.localeCompare(b.realmName) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Every source for `target`. The open realm's rows come first: its home, then its field armies that can go (quickest first), then
 * those that cannot. Then the player's other realms' rows (homes and armies alike): the ones that can go by travel time, then the rest.
 */
export function evaluateSendSources(input: SendSourceInput): SendSource[] {
  const current: SendSource[] = [];
  const others: SendSource[] = [];
  for (const realm of input.realms) {
    const { home, field } = sourcesOfRealm(realm, input);
    if (realm.current) {
      field.sort(byGoing);
      current.push(home, ...field);
    } else {
      others.push(home, ...field);
    }
  }
  others.sort(byGoing);
  return [...current, ...others];
}
