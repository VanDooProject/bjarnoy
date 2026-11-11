<script setup lang="ts">
// An army report — an army that is stuck behind a wall, or that starved because it could not get home
// (`ArmyReportResponse`). Same visual shape as CampReportCard: banner, what happened and where, then the
// troops (lost for a starved army, in the army for a stuck one).
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ArmyReportResponse } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';
import { unitName } from '../../i18n/catalogueNames';
import { armyReportHex } from '../../lib/units/armyReports';

const props = defineProps<{ report: ArmyReportResponse }>();

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const starved = computed(() => props.report.kind === 'starved');
const text = computed(() => t(`reports.army.${props.report.kind}`, { hex: armyReportHex(props.report) }));
</script>

<template>
  <div class="card" :class="starved ? 'defeat' : 'stuck'" data-testid="army-report-card">
    <div class="card-header">
      <span class="banner">{{ t(`reports.army.kind.${report.kind}`) }}</span>
    </div>
    <p class="occurred">{{ d(new Date(report.occurredAt), 'long') }}</p>
    <p class="text" data-testid="army-report-text">{{ text }}</p>

    <section class="side" data-testid="army-report-units">
      <h3>{{ starved ? t('reports.army.lost') : t('reports.army.inArmy') }}</h3>
      <div class="lines-scroll">
        <table class="lines">
          <tbody>
            <tr v-for="row in report.units" :key="row.type">
              <td>{{ unitName(row.type) }}</td>
              <td :class="{ lost: starved }">{{ row.count }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
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
.card.stuck {
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
.card.stuck .banner {
  color: var(--gold);
}
.card.defeat .banner {
  color: #e08a8a;
}
.occurred {
  margin: 4px 0 8px;
  font-size: 12px;
  color: var(--muted);
}
.text {
  margin: 0 0 16px;
  font-size: 14px;
}
.side h3 {
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
.lines td {
  padding: 4px 6px;
  border-bottom: 1px solid var(--panel-border);
}
.lines .lost {
  color: #e08a8a;
}
</style>
