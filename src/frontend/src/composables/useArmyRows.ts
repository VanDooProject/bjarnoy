// Shared army-row derivation behind ArmyPanel.vue's list and QueueDrawer's
// Armies section (issue: mobile army dispatch) — same composition/status/
// ETA/recall/field-order rules in both places, rather than the mobile
// drawer reimplementing ArmyPanel's logic a second time. Pulled out of
// ArmyPanel.vue's own `armyRows` computed without changing its output.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../stores/world';
import { useAuthStore } from '../stores/auth';
import { missionName, unitName } from '../i18n/catalogueNames';
import {
  armyStatusLabel,
  campReadyAtMs,
  canFieldOrderArmy,
  formatEta,
  isArmyHeadingHome,
  isArmyStanding,
  isArmyWaitingToGather,
  isFieldOrderMidMarch,
} from '../lib/units/armyDispatch';
import { buildArmyTimeline, type ArmyTimeline } from '../lib/units/armyTimeline';
import type { MessageSchema } from '../i18n/schema';
import type { ArmyResponse } from '../api/types';

/** Colour of the row's countdown: the leg the army is on. */
export type ArmyRowTone = 'march' | 'return' | 'support' | 'stranded' | 'default';

export interface ArmyRow {
  id: string;
  composition: string;
  /** The unit stacks behind `composition`, for the unit chips. */
  stacks: { unit: string; count: number }[];
  status: string;
  /** Colour of the countdown. */
  tone: ArmyRowTone;
  /** The legs, "now" tick, events and food numbers of the trip; null for an army without a trip. */
  timeline: ArmyTimeline | null;
  eta: string | null;
  /** Raw instant (ms epoch) behind `eta`, for sorting — null exactly when `eta` is. */
  etaMs: number | null;
  /** Time fraction along the active leg (departedAt→arrivesAt, or turnAroundAt→returnArrivesAt while returning); null for a supporting army, which has no active leg. */
  progress: number | null;
  canRecall: boolean;
  canFieldOrder: boolean;
  fieldOrderLocked: boolean;
  fieldOrderLabel: string;
  selected: boolean;
  mission: string | null;
  /** The army has no home (its beach camp was destroyed): listed under "Without home" in every realm, never recalled. */
  withoutHome: boolean;
}

function armyProgressFraction(army: ArmyResponse, now: number): number | null {
  const movement = army.movement;
  if (!movement) return null;
  const homeLeg = isArmyHeadingHome(army, now);
  const start = Date.parse(homeLeg ? movement.turnAroundAt : movement.departedAt);
  const end = Date.parse(homeLeg ? movement.returnArrivesAt : movement.arrivesAt);
  if (!(end > start)) return null;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

function armyRowTone(timeline: ArmyTimeline | null): ArmyRowTone {
  switch (timeline?.state) {
    case 'marching':
      return 'march';
    case 'returning':
      return 'return';
    case 'supporting':
      return 'support';
    case 'stranded':
      return 'stranded';
    default:
      return 'default';
  }
}

export function useArmyRows() {
  const world = useWorldStore();
  const auth = useAuthStore();
  const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

  return computed<ArmyRow[]>(() => {
    void world.hud.tick; // reactive dependency so ETA countdowns tick every second
    const now = Date.now();
    /** "<phrase> 2h 40m"; a countdown that has run out reads "Arriving" on its own. */
    const countdown = (key: Parameters<typeof t>[0], targetIso: string): string =>
      Date.parse(targetIso) - now > 0 ? t(key, { eta: formatEta(targetIso, now) }) : formatEta(targetIso, now);
    return world.armies.map((army) => {
      const composition = army.stacks
        .filter((s) => s.count > 0)
        .map((s) => `${s.count}× ${unitName(s.unit)}`)
        .join(', ');
      const targetName = army.targetSettlementId
        ? world.model.getSettlement(army.targetSettlementId)?.name ?? null
        : null;
      // A camp army standing on its site is building the camp: its countdown runs to the camp being ready, not to its arrival.
      const campReadyAt = campReadyAtMs(army, now, world.worldSpeedFactor);
      const status = campReadyAt !== null
        ? t('hud.armyStatus.buildingCamp', { time: d(new Date(campReadyAt), 'time') })
        : armyStatusLabel(army, now, army.supporting ? targetName : null);
      // A standing army has arrived: its countdown runs to the moment it heads home, not to its arrival.
      const headingHome = isArmyHeadingHome(army, now);
      const standing = campReadyAt === null && isArmyStanding(army, now);
      // A group waiting at the meeting hex counts down to the gathering leaving, not to its own arrival or turn-around.
      const waiting = campReadyAt === null && isArmyWaitingToGather(army, now);
      const etaIso = campReadyAt !== null
        ? new Date(campReadyAt).toISOString()
        : army.movement
          ? waiting
            ? army.gatherDepartsAt!
            : headingHome
            ? army.movement.returnArrivesAt
            : standing
              ? army.movement.turnAroundAt
              : army.movement.arrivesAt
          : null;
      // An army that cannot get home has no arrival to count down to, only the moment its food runs out.
      const eta = army.starvesAt
        ? countdown('hud.armyStatus.starvesIn', army.starvesAt)
        : etaIso
          ? campReadyAt !== null
            ? countdown('hud.armyStatus.campReadyIn', etaIso)
            : waiting
              ? countdown('hud.armyStatus.movesOnIn', etaIso)
              : headingHome
                ? countdown('hud.armyStatus.homeIn', etaIso)
                : standing
                  ? countdown('hud.armyStatus.headsHomeIn', etaIso)
                  : countdown('hud.armyStatus.arrivesIn', etaIso)
          : null;
      const etaMs = army.starvesAt ? Date.parse(army.starvesAt) : etaIso ? Date.parse(etaIso) : null;
      // Nor any way home to recall it on, nor a home at all.
      const withoutHome = army.settlementId === null;
      const canRecall =
        !withoutHome &&
        !army.atHome &&
        (army.supporting || (army.movement !== null && !headingHome && !army.movement.isStranded));
      // Issue #156 phase 1: "Move on" once standing, "Append goal" while still
      // travelling — see isFieldOrderMidMarch's own doc comment.
      const midMarch = isFieldOrderMidMarch(army, now);
      const timeline = buildArmyTimeline(army, now, campReadyAt);
      return {
        id: army.id,
        composition: composition || '—',
        stacks: army.stacks.filter((s) => s.count > 0).map((s) => ({ unit: s.unit, count: s.count })),
        status,
        tone: armyRowTone(timeline),
        timeline,
        eta,
        etaMs,
        progress: armyProgressFraction(army, now),
        canRecall,
        canFieldOrder: canFieldOrderArmy(army),
        fieldOrderLocked: midMarch && !auth.isPremium,
        fieldOrderLabel: midMarch ? t('hud.armyPanel.appendGoal') : t('hud.armyPanel.moveOn'),
        selected: army.id === world.selectedArmyId,
        mission: army.mission !== 'move' ? missionName(army.mission) : null,
        withoutHome,
      };
    });
  });
}

/**
 * Sort order for QueueDrawer's Armies section: soonest ETA first (a
 * returning army's own ETA interleaves with outbound ones the same way), a
 * supporting army (no ETA) last, ties broken by id so the order stays
 * stable frame to frame rather than reshuffling on every tick.
 */
export function sortArmyRowsByEta(rows: ArmyRow[]): ArmyRow[] {
  return [...rows].sort((a, b) => {
    if (a.etaMs === null && b.etaMs === null) return a.id.localeCompare(b.id);
    if (a.etaMs === null) return 1;
    if (b.etaMs === null) return -1;
    if (a.etaMs !== b.etaMs) return a.etaMs - b.etaMs;
    return a.id.localeCompare(b.id);
  });
}

export interface ArmyRowGroup {
  key: 'home' | 'withoutHome';
  /** The group's heading; null for the realm's own armies, which need none. */
  heading: string | null;
  rows: ArmyRow[];
}

/**
 * The rows split into the realm's own armies and the player's armies without a home (in the order given), empty groups left
 * out: both army lists (ArmyPanel, QueueDrawer) show the second group under its own "Without home" heading.
 */
export function groupArmyRowsByHome(rows: ArmyRow[], withoutHomeHeading: string): ArmyRowGroup[] {
  const groups: ArmyRowGroup[] = [
    { key: 'home', heading: null, rows: rows.filter((r) => !r.withoutHome) },
    { key: 'withoutHome', heading: withoutHomeHeading, rows: rows.filter((r) => r.withoutHome) },
  ];
  return groups.filter((g) => g.rows.length > 0);
}
