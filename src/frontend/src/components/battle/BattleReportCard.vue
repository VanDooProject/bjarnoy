<script setup lang="ts">
// Issue #40 phase 3's outcome card, extracted out of ReportsView.vue in
// phase 7 so the premium fight simulator (SimulatorView.vue) can render its
// result with the exact same markup as a real battle report, rather than
// duplicating it — see SimulatorResponse's own comment on why its field
// shape deliberately mirrors BattleReportResponse's.
import { computed } from 'vue';
import type { BattleReportAttackerLine, BattleReportDefenderLine, BattleReportSiege, ResourceLine } from '../../api/types';
import { missionLabel, outcomeLabel, siegeSummaryLine, totalLoot } from '../../lib/units/battleReports';

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

const outcome = computed(() => outcomeLabel(props.report, props.side));
const loot = computed(() => totalLoot(props.report.lootTaken));
const siegeSummary = computed(() => (props.report.siege ? siegeSummaryLine(props.report.siege) : null));
</script>

<template>
  <div class="card" :class="outcome === 'Victory' ? 'victory' : 'defeat'">
    <div class="card-header">
      <span class="banner">{{ outcome }}</span>
      <span class="mission-pill">{{ missionLabel(report.mission) }}</span>
    </div>
    <p v-if="occurredAt" class="occurred">{{ new Date(occurredAt).toLocaleString() }}</p>

    <div class="power-row">
      <div class="power">
        <span class="power-label">Attack power</span>
        <span class="power-value">{{ Math.round(report.attackPower) }}</span>
      </div>
      <div class="power">
        <span class="power-label">Defense power</span>
        <span class="power-value">{{ Math.round(report.defensePower) }}</span>
      </div>
    </div>

    <div class="sides">
      <section class="side">
        <h3>Attacker</h3>
        <table class="lines">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Sent</th>
              <th>Lost</th>
              <th>Survived</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in report.attackerLines" :key="line.unit">
              <td>{{ line.unit }}</td>
              <td>{{ line.sent }}</td>
              <td class="lost">{{ line.lost }}</td>
              <td class="survived">{{ line.survived }}</td>
            </tr>
            <tr v-if="!report.attackerLines.length">
              <td colspan="4" class="empty">No stacks recorded.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="side">
        <h3>Defender</h3>
        <table class="lines">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Lost</th>
              <th>Survived</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in report.defenderLines" :key="line.unit">
              <td>{{ line.unit }}</td>
              <td class="lost">{{ line.lost }}</td>
              <td class="survived">{{ line.survived }}</td>
            </tr>
            <tr v-if="!report.defenderLines.length">
              <td colspan="3" class="empty">No stacks recorded.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <div v-if="loot > 0" class="loot">
      <h3>Loot taken</h3>
      <div class="loot-row">
        <span>Wood {{ Math.round(report.lootTaken.wood) }}</span>
        <span>Stone {{ Math.round(report.lootTaken.stone) }}</span>
        <span>Food {{ Math.round(report.lootTaken.food) }}</span>
        <span>Iron {{ Math.round(report.lootTaken.iron) }}</span>
      </div>
    </div>

    <div v-if="report.siege" class="siege" :class="{ razed: report.siege.settlementRazed }">
      <div v-if="report.siege.settlementRazed" class="razed-banner">Settlement razed</div>
      <h3>Siege</h3>
      <p>{{ siegeSummary }}</p>
      <p class="siege-coord">Hex ({{ report.siege.targetCoord.q }}, {{ report.siege.targetCoord.r }})</p>
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
