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
  canFieldOrderArmy,
  formatEta,
  isFieldOrderMidMarch,
} from '../lib/units/armyDispatch';
import type { MessageSchema } from '../i18n/schema';
import type { ArmyResponse } from '../api/types';

export interface ArmyRow {
  id: string;
  composition: string;
  status: string;
  eta: string | null;
  /** Raw arrival instant (ms epoch) behind `eta`, for sorting — null exactly when `eta` is. */
  etaMs: number | null;
  /** Time fraction along the active leg (departedAt→arrivesAt, or turnAroundAt→returnArrivesAt while returning); null for a supporting army, which has no active leg. */
  progress: number | null;
  canRecall: boolean;
  canFieldOrder: boolean;
  fieldOrderLocked: boolean;
  fieldOrderLabel: string;
  selected: boolean;
  mission: string | null;
}

function armyProgressFraction(army: ArmyResponse, now: number): number | null {
  const movement = army.movement;
  if (!movement) return null;
  const start = Date.parse(movement.isReturning ? movement.turnAroundAt : movement.departedAt);
  const end = Date.parse(movement.isReturning ? movement.returnArrivesAt : movement.arrivesAt);
  if (!(end > start)) return null;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export function useArmyRows() {
  const world = useWorldStore();
  const auth = useAuthStore();
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

  return computed<ArmyRow[]>(() => {
    void world.hud.tick; // reactive dependency so ETA countdowns tick every second
    const now = Date.now();
    return world.armies.map((army) => {
      const composition = army.stacks
        .filter((s) => s.count > 0)
        .map((s) => `${s.count}× ${unitName(s.unit)}`)
        .join(', ');
      const targetName = army.targetSettlementId
        ? world.model.getSettlement(army.targetSettlementId)?.name ?? null
        : null;
      const status = armyStatusLabel(army, army.supporting ? targetName : null);
      const etaIso = army.movement
        ? army.movement.isReturning
          ? army.movement.returnArrivesAt
          : army.movement.arrivesAt
        : null;
      const eta = etaIso ? formatEta(etaIso, now) : null;
      const etaMs = etaIso ? Date.parse(etaIso) : null;
      const canRecall = !army.atHome && (army.supporting || (army.movement !== null && !army.movement.isReturning));
      // Issue #156 phase 1: "Move on" once standing, "Append goal" while still
      // travelling — see isFieldOrderMidMarch's own doc comment.
      const midMarch = isFieldOrderMidMarch(army, now);
      return {
        id: army.id,
        composition: composition || '—',
        status,
        eta,
        etaMs,
        progress: armyProgressFraction(army, now),
        canRecall,
        canFieldOrder: canFieldOrderArmy(army),
        fieldOrderLocked: midMarch && !auth.isPremium,
        fieldOrderLabel: midMarch ? t('hud.armyPanel.appendGoal') : t('hud.armyPanel.moveOn'),
        selected: army.id === world.selectedArmyId,
        mission: army.mission !== 'move' ? missionName(army.mission) : null,
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
