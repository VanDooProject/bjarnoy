<script setup lang="ts">
// Issue #40 phase 3's outcome card, extracted out of ReportsView.vue in
// phase 7 so the premium fight simulator (SimulatorView.vue) can render its
// result with the exact same markup as a real battle report, rather than
// duplicating it — see SimulatorResponse's own comment on why its field
// shape deliberately mirrors BattleReportResponse's.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  ArmyUnitStackResponse,
  BattleReportAttackerLine,
  BattleReportDefenderLine,
  BattleReportShipFight,
  BattleReportSiege,
  ResourceLine,
} from '../../api/types';
import BattleFightSection from './BattleFightSection.vue';
import type { MessageSchema } from '../../i18n/schema';
import { resourceName, unitName } from '../../i18n/catalogueNames';
import { isVictoryFor, missionLabel, outcomeLabel, siegeSummaryLine, totalLoot } from '../../lib/units/battleReports';

/**
 * Everything the card needs to render — deliberately just the fields
 * `BattleReportResponse` and `SimulatorResponse` share, so either can be
 * passed straight through as `report` with no adapting.
 */
export interface BattleReportCardData {
  mission: string;
  winner: string;
  attackPower: number;
  defensePower: number;
  /** The ranged attack each side threw in the land fight's volley; 0 without ranged units. */
  attackerVolleyPower?: number;
  defenderVolleyPower?: number;
  lootTaken: ResourceLine;
  attackerLines: BattleReportAttackerLine[];
  defenderLines: BattleReportDefenderLine[];
  siege: BattleReportSiege | null;
  /** A fleet's fight at sea; absent or null for a land army, a target without ships and older reports. */
  shipFight?: BattleReportShipFight | null;
  /** The passengers the surviving ships could not carry. */
  drowned?: ArmyUnitStackResponse[];
  fireShipsBurned?: number;
  fireSiege?: BattleReportSiege | null;
}

const props = defineProps<{
  report: BattleReportCardData;
  /** Which side to score Victory/Defeat from. A simulated fight has no "viewer", so callers pick — the simulator always uses 'attacker'. */
  side: 'attacker' | 'defender';
  /** Omit for a simulated fight, which has no occurrence instant. */
  occurredAt?: string | null;
}>();

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const victory = computed(() => isVictoryFor(props.report, props.side));
const outcome = computed(() => outcomeLabel(props.report, props.side));
const loot = computed(() => totalLoot(props.report.lootTaken));
const siegeSummary = computed(() => (props.report.siege ? siegeSummaryLine(props.report.siege) : null));
const fireSiegeSummary = computed(() => (props.report.fireSiege ? siegeSummaryLine(props.report.fireSiege) : null));
const drowned = computed(() => props.report.drowned ?? []);
const fireShipsBurned = computed(() => props.report.fireShipsBurned ?? 0);
// A fleet's report names its fights; a land army's one fight needs no heading (and an older report reads exactly as before).
const isFleet = computed(() => !!props.report.shipFight || drowned.value.length > 0 || fireShipsBurned.value > 0 || !!props.report.fireSiege);
const hasLandFight = computed(() => !isFleet.value || props.report.attackerLines.length > 0 || props.report.defenderLines.length > 0);
</script>

<template>
  <div class="card" :class="victory ? 'victory' : 'defeat'">
    <div class="card-header">
      <span class="banner">{{ outcome }}</span>
      <span class="mission-pill">{{ missionLabel(report.mission) }}</span>
    </div>
    <p v-if="occurredAt" class="occurred">{{ d(new Date(occurredAt), 'long') }}</p>

    <section v-if="report.shipFight" class="fight-block" data-testid="ship-fight">
      <h2>{{ t('hud.battleReport.shipFight') }}</h2>
      <BattleFightSection :fight="report.shipFight" />
    </section>

    <section class="fight-block" data-testid="land-fight">
      <h2 v-if="isFleet">{{ t('hud.battleReport.landFight') }}</h2>
      <BattleFightSection v-if="hasLandFight" :fight="report" />
      <p v-else class="no-fight">{{ t('hud.battleReport.noLandFight') }}</p>
    </section>

    <div v-if="drowned.length" class="drowned" data-testid="drowned">
      <h3>{{ t('hud.battleReport.drowned') }}</h3>
      <div class="loot-row">
        <span v-for="stack in drowned" :key="stack.unit">{{ unitName(stack.unit) }} {{ stack.count }}</span>
      </div>
    </div>

    <div v-if="loot > 0" class="loot">
      <h3>{{ t('hud.battleReport.lootTaken') }}</h3>
      <div class="loot-row">
        <span>{{ resourceName('wood') }} {{ Math.round(report.lootTaken.wood) }}</span>
        <span>{{ resourceName('stone') }} {{ Math.round(report.lootTaken.stone) }}</span>
        <span>{{ resourceName('food') }} {{ Math.round(report.lootTaken.food) }}</span>
        <span>{{ resourceName('iron') }} {{ Math.round(report.lootTaken.iron) }}</span>
      </div>
    </div>

    <div v-if="fireShipsBurned > 0 || report.fireSiege" class="siege" data-testid="fire-damage">
      <h3>{{ t('hud.battleReport.fireShips') }}</h3>
      <p v-if="fireShipsBurned > 0">{{ t('hud.battleReport.fireShipsBurned', { n: fireShipsBurned }) }}</p>
      <p v-if="fireSiegeSummary">{{ fireSiegeSummary }}</p>
      <p v-if="report.fireSiege" class="siege-coord">
        {{ t('hud.battleReport.hexCoord', { q: report.fireSiege.targetCoord.q, r: report.fireSiege.targetCoord.r }) }}
      </p>
    </div>

    <div v-if="report.siege" class="siege" :class="{ razed: report.siege.settlementRazed }">
      <div v-if="report.siege.settlementRazed" class="razed-banner">{{ t('hud.battleReport.settlementRazed') }}</div>
      <h3>{{ t('hud.battleReport.siege') }}</h3>
      <p>{{ siegeSummary }}</p>
      <p class="siege-coord">{{ t('hud.battleReport.hexCoord', { q: report.siege.targetCoord.q, r: report.siege.targetCoord.r }) }}</p>
    </div>
  </div>
</template>

<style scoped>
.card {
  margin-top: 20px;
  padding: 20px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-left: 4px solid var(--panel-border);
}
.card.victory {
  border-left-color: var(--gold);
}
.card.defeat {
  border-left-color: #e08a8a;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.banner {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.card.victory .banner {
  color: var(--gold);
}
.card.defeat .banner {
  color: #e08a8a;
}
.mission-pill {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  color: var(--muted);
}
.occurred {
  margin: 4px 0 16px;
  font-size: 12px;
  color: var(--muted);
}
.fight-block h2 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text);
}
.fight-block {
  margin-bottom: 4px;
}
.no-fight {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--muted);
}
.loot h3,
.siege h3,
.drowned h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.drowned {
  margin-bottom: 20px;
}
.loot-row {
  display: flex;
  gap: 16px;
  font-size: 13px;
}
.siege {
  padding-top: 4px;
}
.siege p {
  font-size: 13px;
  margin: 0;
}
.siege-coord {
  margin-top: 2px !important;
  color: var(--muted);
  font-size: 12px !important;
}
/* Reuses the outcome-banner visual language from `.card`/`.banner`
   (win/loss, phase 3) for the one other "the state of this settlement just
   changed" moment a report can carry: its Longhouse was destroyed. */
.razed-banner {
  display: inline-block;
  margin-bottom: 8px;
  padding: 4px 10px;
  background: rgba(224, 138, 138, 0.12);
  border: 1px solid #e08a8a;
  border-radius: 4px;
  color: #e08a8a;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
