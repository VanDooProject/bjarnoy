<script setup lang="ts">
// Issue #206's field-battle report card — the army-vs-army sibling of
// BattleReportCard.vue, reusing that card's exact visual shape (issue #206's
// own ask) minus the siege section: a field battle has no building to
// damage. Unlike a settlement attack, both sides here are symmetric (side A
// / side B, not attacker/defender), so each renders with the same
// sent-less "unit / lost / survived" table and the viewer's own side is
// called out with a "(you)" tag rather than a fixed attacker/defender label.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FieldBattleReportLine, ResourceLine } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';
import { resourceName, unitName } from '../../i18n/catalogueNames';
import {
  type FieldBattleSide,
  fieldBattleOutcomeLabel,
  groupFieldBattleLinesByUnit,
  isFieldBattleVictoryFor,
  totalFieldBattleLoot,
} from '../../lib/units/fieldBattleReports';

/**
 * Everything the card needs to render — the subset of `FieldBattleReportResponse`
 * shared with any future non-persisted variant (mirrors how
 * `BattleReportCardData` shares its shape with `SimulatorResponse`).
 */
export interface FieldBattleReportCardData {
  winner: string;
  sideAPower: number;
  sideBPower: number;
  sideAWasDefending: boolean;
  sideBWasDefending: boolean;
  lootTaken: ResourceLine;
  lines: FieldBattleReportLine[];
}

const props = defineProps<{
  report: FieldBattleReportCardData;
  /** Which side to score Won/Lost/Tied from, and to mark "(you)" in the two side headers. */
  side: FieldBattleSide;
  occurredAt: string;
}>();

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const outcomeVariant = computed(() =>
  props.report.winner === 'tie' ? 'tie' : isFieldBattleVictoryFor(props.report, props.side) ? 'victory' : 'defeat',
);
const outcome = computed(() => fieldBattleOutcomeLabel(props.report, props.side));
const loot = computed(() => totalFieldBattleLoot(props.report.lootTaken));
const wonLoot = computed(() => props.report.winner === props.side && loot.value > 0);

const sideARows = computed(() => groupFieldBattleLinesByUnit(props.report.lines, 'sidea'));
const sideBRows = computed(() => groupFieldBattleLinesByUnit(props.report.lines, 'sideb'));
function rowsFor(side: FieldBattleSide) {
  return side === 'sidea' ? sideARows.value : sideBRows.value;
}

function wasDefending(side: FieldBattleSide): boolean {
  return side === 'sidea' ? props.report.sideAWasDefending : props.report.sideBWasDefending;
}
function powerOf(side: FieldBattleSide): number {
  return side === 'sidea' ? props.report.sideAPower : props.report.sideBPower;
}
</script>

<template>
  <div class="card" :class="outcomeVariant">
    <div class="card-header">
      <span class="banner">{{ outcome }}</span>
      <span class="mission-pill">{{ t('hud.fieldBattleReport.title') }}</span>
    </div>
    <p class="occurred">{{ d(new Date(occurredAt), 'long') }}</p>

    <div class="sides">
      <section v-for="s in (['sidea', 'sideb'] as const)" :key="s" class="side">
        <h3>
          {{ t(`hud.fieldBattleReport.${s === 'sidea' ? 'sideA' : 'sideB'}`) }}
          <span v-if="s === side" class="you-tag">{{ t('hud.fieldBattleReport.you') }}</span>
          <span v-if="wasDefending(s)" class="defending-tag">{{ t('hud.fieldBattleReport.defending') }}</span>
        </h3>
        <p class="power">{{ t('hud.fieldBattleReport.power') }}: {{ Math.round(powerOf(s)) }}</p>
        <table class="lines">
          <thead>
            <tr>
              <th>{{ t('hud.battleReport.unit') }}</th>
              <th>{{ t('hud.battleReport.lost') }}</th>
              <th>{{ t('hud.battleReport.survived') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rowsFor(s)" :key="row.unit">
              <td>{{ unitName(row.unit) }}</td>
              <td class="lost">{{ row.lost }}</td>
              <td class="survived">{{ row.survived }}</td>
            </tr>
            <tr v-if="!rowsFor(s).length">
              <td colspan="3" class="empty">{{ t('hud.battleReport.noStacksRecorded') }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <div v-if="wonLoot" class="loot">
      <h3>{{ t('hud.battleReport.lootTaken') }}</h3>
      <div class="loot-row">
        <span>{{ resourceName('wood') }} {{ Math.round(report.lootTaken.wood) }}</span>
        <span>{{ resourceName('stone') }} {{ Math.round(report.lootTaken.stone) }}</span>
        <span>{{ resourceName('food') }} {{ Math.round(report.lootTaken.food) }}</span>
        <span>{{ resourceName('iron') }} {{ Math.round(report.lootTaken.iron) }}</span>
      </div>
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
.card.tie {
  border-left-color: var(--muted);
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
.card.tie .banner {
  color: var(--muted);
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
.sides {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}
.side h3,
.loot h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.you-tag,
.defending-tag {
  font-size: 10px;
  padding: 1px 6px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  text-transform: none;
  letter-spacing: 0;
}
.you-tag {
  color: var(--gold);
  border-color: var(--gold);
}
.power {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text);
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

@media (max-width: 640px) {
  .sides {
    grid-template-columns: 1fr;
  }
}
</style>
