// The time line of an army's trip, as the armies panel draws it: the legs as bar sections, where "now" sits on them, the
// events along the way and the food numbers. Pure functions of an army and the current time; the states come from
// armyDispatch.ts (`isArmyHeadingHome`, `isArmyStanding`, `isArmyWaitingToGather`), they are not decided again here.
import type { ArmyResponse, HexPoint } from '../../api/types';
import { isArmyHeadingHome, isArmyStanding, isArmyWaitingToGather } from './armyDispatch';

/** What the army is doing: the same states the row's status text tells apart. */
export type ArmyTimelineState = 'marching' | 'standing' | 'returning' | 'stranded' | 'supporting' | 'waiting' | 'camp';

/** The leg a bar section stands for. `starving` runs to the moment the food of a stranded army runs out. */
export type TimelineSectionKind = 'march' | 'spare' | 'wayHome' | 'starving' | 'supporting' | 'waiting' | 'camp';

export interface TimelineSection {
  kind: TimelineSectionKind;
  /** Share of the whole bar, 0 to 1; the sections add up to 1. */
  fraction: number;
  /** When the section begins (ISO); null for a supporting army, whose trip has no known times. */
  startsAt: string | null;
}

export type TimelineEventKind = 'left' | 'arrived' | 'now' | 'turnsHome' | 'home' | 'starves' | 'movesOn' | 'campReady';

export interface TimelineEvent {
  kind: TimelineEventKind;
  /** ISO instant of the event; for `now` the instant the time line was built for. */
  at: string;
  /** Already behind the army (or `now` itself). */
  past: boolean;
  /** `arrived`: the hex the army marches to. */
  hex?: HexPoint;
}

export interface TimelineFood {
  /** Food the army carries now (`ArmyResponse.provisions` as the last response gave it). */
  provisions: number;
  perHour: number;
  /** How long the army can stand at its destination (`turnAroundAt − max(now, arrivesAt)`, 0 at least); null once it is heading home and for armies that never turn by themselves. */
  spareMs: number | null;
  /** The trip home (`turnAroundAt` to `returnArrivesAt`); null for armies that do not have one planned. */
  wayHomeMs: number | null;
}

export interface ArmyTimeline {
  state: ArmyTimelineState;
  sections: TimelineSection[];
  /** Start of the bar (ISO), null when unknown (supporting). */
  startsAt: string | null;
  /** End of the bar (ISO), null for a bar without an end (supporting). */
  endsAt: string | null;
  /** The bar ends in a mark (a stranded army: that is where it dies). */
  endMark: boolean;
  /** Where "now" sits on the bar, 0 to 1; null when the bar has no times. */
  nowFraction: number | null;
  events: TimelineEvent[];
  food: TimelineFood;
}

type TimelineArmy = Pick<
  ArmyResponse,
  | 'atHome'
  | 'supporting'
  | 'mission'
  | 'movement'
  | 'starvesAt'
  | 'provisions'
  | 'totalUpkeepPerHour'
  | 'gatheringId'
  | 'gatherDepartsAt'
>;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Whatever state the army is in, for the status of its row (colour of the countdown, wording of the "now" event).
 * `null` for an army at home or without a trip.
 */
export function armyTimelineState(army: TimelineArmy, now: number, campReadyAt: number | null): ArmyTimelineState | null {
  if (army.atHome) return null;
  if (army.supporting) return 'supporting';
  if (!army.movement) return null;
  if (army.movement.isStranded) return 'stranded';
  if (campReadyAt !== null) return 'camp';
  if (isArmyWaitingToGather(army, now)) return 'waiting';
  if (isArmyHeadingHome(army, now)) return 'returning';
  if (isArmyStanding(army, now)) return 'standing';
  return 'marching';
}

/**
 * The time line of an army at `now` (ms epoch). `campReadyAt` is `campReadyAtMs(...)`: when the army is building its beach
 * camp (null otherwise). `null` for an army without a trip (at home) or whose trip has no length.
 */
export function buildArmyTimeline(army: TimelineArmy, now: number, campReadyAt: number | null): ArmyTimeline | null {
  const state = armyTimelineState(army, now, campReadyAt);
  if (state === null) return null;
  const food: TimelineFood = {
    provisions: army.provisions,
    perHour: army.totalUpkeepPerHour,
    spareMs: null,
    wayHomeMs: null,
  };
  const movement = army.movement;

  if (state === 'supporting' || !movement) {
    // A supporting army stands in its host's garrison: no leg to draw times for, an open-ended bar.
    return {
      state,
      sections: [{ kind: 'supporting', fraction: 1, startsAt: null }],
      startsAt: null,
      endsAt: null,
      endMark: false,
      nowFraction: null,
      events: [],
      food,
    };
  }

  const departed = Date.parse(movement.departedAt);
  const arrives = Date.parse(movement.arrivesAt);
  const turnAround = Date.parse(movement.turnAroundAt);
  const returnArrives = Date.parse(movement.returnArrivesAt);

  // Each leg after the march: its kind, and the instant it ends at.
  let legs: { kind: TimelineSectionKind; end: number }[];
  let endMark = false;
  let lastEvent: { kind: TimelineEventKind; at: number } | null = null;
  switch (state) {
    case 'stranded': {
      const starves = army.starvesAt ? Date.parse(army.starvesAt) : arrives;
      legs = [{ kind: 'starving', end: Math.max(starves, arrives) }];
      endMark = true;
      if (army.starvesAt) lastEvent = { kind: 'starves', at: starves };
      break;
    }
    case 'waiting': {
      const departs = Date.parse(army.gatherDepartsAt!);
      legs = [{ kind: 'waiting', end: departs }];
      lastEvent = { kind: 'movesOn', at: departs };
      break;
    }
    case 'camp':
      legs = [{ kind: 'camp', end: campReadyAt! }];
      lastEvent = { kind: 'campReady', at: campReadyAt! };
      break;
    default:
      legs = [
        { kind: 'spare', end: turnAround },
        { kind: 'wayHome', end: returnArrives },
      ];
  }

  const end = legs[legs.length - 1].end;
  const total = end - departed;
  if (!(total > 0)) return null;

  const sections: TimelineSection[] = [];
  const edges: { kind: TimelineSectionKind; start: number; end: number }[] = [{ kind: 'march', start: departed, end: arrives }];
  let cursor = arrives;
  for (const leg of legs) {
    edges.push({ kind: leg.kind, start: cursor, end: leg.end });
    cursor = Math.max(cursor, leg.end);
  }
  for (const edge of edges) {
    const length = edge.end - edge.start;
    if (length > 0) sections.push({ kind: edge.kind, fraction: length / total, startsAt: iso(edge.start) });
  }

  const nowFraction = Math.min(1, Math.max(0, (now - departed) / total));

  const events = buildEvents(state, movement.path[movement.path.length - 1], now, {
    departed,
    arrives,
    turnAround,
    returnArrives,
    last: lastEvent,
  });

  if (state === 'standing' || state === 'marching') {
    food.spareMs = Math.max(0, turnAround - Math.max(now, arrives));
  }
  if (state === 'standing' || state === 'marching' || state === 'returning') {
    food.wayHomeMs = Math.max(0, returnArrives - turnAround);
  }

  return {
    state,
    sections,
    startsAt: movement.departedAt,
    endsAt: iso(end),
    endMark,
    nowFraction,
    events,
    food,
  };
}

function buildEvents(
  state: ArmyTimelineState,
  destination: HexPoint | undefined,
  now: number,
  at: {
    departed: number;
    arrives: number;
    turnAround: number;
    returnArrives: number;
    last: { kind: TimelineEventKind; at: number } | null;
  },
): TimelineEvent[] {
  if (state === 'supporting') return [];
  const events: TimelineEvent[] = [
    { kind: 'left', at: iso(at.departed), past: at.departed <= now },
    { kind: 'arrived', at: iso(at.arrives), past: at.arrives <= now, hex: destination },
  ];
  if (at.last) {
    events.push({ kind: at.last.kind, at: iso(at.last.at), past: at.last.at <= now });
    if (state === 'camp') events.push({ kind: 'home', at: iso(at.returnArrives), past: at.returnArrives <= now });
  } else if (state !== 'stranded') {
    events.push({ kind: 'turnsHome', at: iso(at.turnAround), past: at.turnAround <= now });
    events.push({ kind: 'home', at: iso(at.returnArrives), past: at.returnArrives <= now });
  }
  // "now" sits between the events behind the army and those ahead; the order of the times is the order of the list.
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const firstAhead = events.findIndex((e) => !e.past);
  events.splice(firstAhead === -1 ? events.length : firstAhead, 0, { kind: 'now', at: iso(now), past: true });
  return events;
}
