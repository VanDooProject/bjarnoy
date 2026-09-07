<script setup lang="ts">
// Issue #40 phase 3's outcome card, extracted out of ReportsView.vue in
// phase 7 so the premium fight simulator (SimulatorView.vue) can render its
// result with the exact same markup as a real battle report, rather than
// duplicating it — see SimulatorResponse's own comment on why its field
// shape deliberately mirrors BattleReportResponse's.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BattleReportAttackerLine, BattleReportDefenderLine, BattleReportSiege, ResourceLine } from '../../api/types';
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
  lootTaken: ResourceLine;
  attackerLines: BattleReportAttackerLine[];
  defenderLines: BattleReportDefenderLine[];
  siege: BattleReportSiege | null;
}

const props = defineProps<{
  report: BattleReportCardData;
  /** Which side to score Victory/Defeat from. A simulated fight has no "viewer", so callers pick — the simulator always uses 'attacker'. */
  side: 'attacker' | 'defender';
  /** Omit for a simulated fight, which has no occurrence instant. */
  occurredAt?: string | null;
}>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const victory = computed(() => isVictoryFor(props.report, props.side));
const outcome = computed(() => outcomeLabel(props.report, props.side));
const loot = computed(() => totalLoot(props.report.lootTaken));
const siegeSummary = computed(() => (props.report.siege ? siegeSummaryLine(props.report.siege) : null));
</script>

<template>
  <div class="card" :class="victory ? 'victory' : 'defeat'">
    <div class="card-header">
      <span class="banner">{{ outcome }}</span>
      <span class="mission-pill">{{ missionLabel(report.mission) }}</span>
    </div>
    <p v-if="occurredAt" class="occurred">{{ new Date(occurredAt).toLocaleString() }}</p>

    <div class="power-row">
      <div class="power">
        <span class="power-label">{{ t('hud.battleReport.attackPower') }}</span>
        <span class="power-value">{{ Math.round(report.attackPower) }}</span>
      </div>
      <div class="power">
        <span class="power-label">{{ t('hud.battleReport.defensePower') }}</span>
        <span class="power-value">{{ Math.round(report.defensePower) }}</span>
      </div>
    </div>

    <div class="sides">
      <section class="side">
        <h3>{{ t('hud.battleReport.attacker') }}</h3>
        <table class="lines">
          <thead>
            <tr>
              <th>{{ t('hud.battleReport.unit') }}</th>
              <th>{{ t('hud.battleReport.sent') }}</th>
              <th>{{ t('hud.battleReport.lost') }}</th>
              <th>{{ t('hud.battleReport.survived') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in report.attackerLines" :key="line.unit">
              <td>{{ unitName(line.unit) }}</td>
              <td>{{ line.sent }}</td>
              <td class="lost">{{ line.lost }}</td>
              <td class="survived">{{ line.survived }}</td>
            </tr>
            <tr v-if="!report.attackerLines.length">
              <td colspan="4" class="empty">{{ t('hud.battleReport.noStacksRecorded') }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="side">
        <h3>{{ t('hud.battleReport.defender') }}</h3>
        <table class="lines">
          <thead>
            <tr>
              <th>{{ t('hud.battleReport.unit') }}</th>
              <th>{{ t('hud.battleReport.lost') }}</th>
              <th>{{ t('hud.battleReport.survived') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in report.defenderLines" :key="line.unit">
              <td>{{ unitName(line.unit) }}</td>
              <td class="lost">{{ line.lost }}</td>
              <td class="survived">{{ line.survived }}</td>
            </tr>
            <tr v-if="!report.defenderLines.length">
              <td colspan="3" class="empty">{{ t('hud.battleReport.noStacksRecorded') }}</td>
            </tr>
          </tbody>
        </table>
      </section>
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
.power-row {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
}
.power {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.power-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.power-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}
.sides {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}
.side h3,
.loot h3,
.siege h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.lines {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.lines th {
  text-align: left;
  padding: 4px 6px;
  border-bottom: 1px solid var(--panel-border);
  color: var(--muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
}
.lines td {
  padding: 4px 6px;
  border-bottom: 1px solid var(--panel-border);
}
.lines .lost {
  color: #e08a8a;
}
.lines .survived {
  color: #8ac48a;
}
.lines .empty {
  color: var(--muted);
  text-align: center;
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

@media (max-width: 640px) {
  .sides {
    grid-template-columns: 1fr;
  }
}
</style>
