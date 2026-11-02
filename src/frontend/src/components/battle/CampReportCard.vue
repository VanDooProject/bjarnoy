<script setup lang="ts">
// A wildlife camp fight report — hunt, ambush or tower attack (`CampReportResponse`). Same visual
// shape as BattleReportCard / FieldBattleReportCard: banner, the player's units (sent / lost) next
// to the camp's beasts per tier (before / lost, named after the camp's family), loot, and whether
// the camp was cleared / the tower burned.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CampReportResponse } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';
import { beastName, campName, resourceName, unitName } from '../../i18n/catalogueNames';
import { isCampReportVictory, totalCampLoot } from '../../lib/units/campReports';

const props = defineProps<{ report: CampReportResponse }>();

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const victory = computed(() => isCampReportVictory(props.report));
const camp = computed(() => campName(props.report.camp.family));
const title = computed(() => t(`hud.campReport.title.${props.report.kind}`, { camp: camp.value }));
const hasLoot = computed(() => totalCampLoot(props.report.loot) > 0);
</script>

<template>
  <div class="card" :class="victory ? 'victory' : 'defeat'" data-testid="camp-report-card">
    <div class="card-header">
      <span class="banner">{{ victory ? t('hud.campReport.won') : t('hud.campReport.lost') }}</span>
      <span class="mission-pill">{{ t(`hud.campReport.kind.${report.kind}`) }}</span>
    </div>
    <h2 class="title" data-testid="camp-report-title">{{ title }}</h2>
    <p class="occurred">
      {{ d(new Date(report.occurredAt), 'long') }} ·
      {{ t('hud.campReport.campLevel', { level: report.camp.effectiveLevel, q: report.camp.q, r: report.camp.r }) }}
    </p>
    <p class="powers">
      {{ t('hud.campReport.armyPower') }}: {{ Math.round(report.armyPower) }} ·
      {{ t('hud.campReport.campPower') }}: {{ Math.round(report.campPower) }}
    </p>

    <div class="sides">
      <section class="side" data-testid="camp-report-units">
        <h3>{{ t('hud.campReport.yourUnits') }}</h3>
        <div class="lines-scroll">
          <table class="lines">
            <thead>
              <tr>
                <th>{{ t('hud.battleReport.unit') }}</th>
                <th>{{ t('hud.battleReport.sent') }}</th>
                <th>{{ t('hud.battleReport.lost') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in report.units" :key="row.type">
                <td>{{ unitName(row.type) }}</td>
                <td>{{ row.sent }}</td>
                <td class="lost">{{ row.lost }}</td>
              </tr>
              <tr v-if="!report.units.length">
                <td colspan="3" class="empty">{{ t('hud.battleReport.noStacksRecorded') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="side" data-testid="camp-report-beasts">
        <h3>{{ t('hud.campReport.beasts') }}</h3>
        <div class="lines-scroll">
          <table class="lines">
            <thead>
              <tr>
                <th>{{ t('hud.campReport.beast') }}</th>
                <th>{{ t('hud.campReport.before') }}</th>
                <th>{{ t('hud.battleReport.lost') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in report.beasts" :key="row.tier" :data-tier="row.tier">
                <td>{{ beastName(report.camp.family, row.tier) }}</td>
                <td>{{ row.before }}</td>
                <td class="lost">{{ row.lost }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <p v-if="report.campCleared" class="note cleared" data-testid="camp-report-cleared">
      {{ t('hud.campReport.cleared', { camp }) }}
    </p>
    <p v-if="report.kind === 'tower'" class="note" :class="report.towerBurned ? 'burned' : 'held'" data-testid="camp-report-tower">
      {{
        report.towerBurned
          ? t('hud.campReport.towerBurned', { q: report.tower?.q ?? 0, r: report.tower?.r ?? 0 })
          : t('hud.campReport.towerHeld', { q: report.tower?.q ?? 0, r: report.tower?.r ?? 0 })
      }}
    </p>

    <div v-if="hasLoot" class="loot" data-testid="camp-report-loot">
      <h3>{{ t('hud.battleReport.lootTaken') }}</h3>
      <div class="loot-row">
        <span v-for="kind in (['wood', 'stone', 'food', 'iron'] as const)" :key="kind" v-show="report.loot[kind] > 0">
          {{ resourceName(kind) }} {{ Math.round(report.loot[kind]) }}
        </span>
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
.title {
  margin: 8px 0 0;
  font-size: 16px;
}
.occurred {
  margin: 4px 0 8px;
  font-size: 12px;
  color: var(--muted);
}
.powers {
  margin: 0 0 16px;
  font-size: 13px;
}
.sides {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 16px;
}
.side h3,
.loot h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.lines-scroll {
  overflow-x: auto;
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
.lines .empty {
  color: var(--muted);
  text-align: center;
}
.note {
  margin: 0 0 12px;
  font-size: 13px;
}
.note.cleared,
.note.held {
  color: var(--gold);
}
.note.burned {
  color: #e08a8a;
}
.loot-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
}
@media (max-width: 640px) {
  .sides {
    grid-template-columns: 1fr;
  }
}
</style>
