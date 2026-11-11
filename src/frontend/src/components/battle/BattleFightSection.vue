<script setup lang="ts">
// One fight of a battle report: the attack and defence power and the two line tables. A land army's report is one of these, a
// fleet's two (the ship fight, then the land fight). BattleReportCard.vue is the only user.
import { useI18n } from 'vue-i18n';
import type { BattleReportAttackerLine, BattleReportDefenderLine } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';
import { unitName } from '../../i18n/catalogueNames';

export interface BattleFightData {
  attackPower: number;
  defensePower: number;
  attackerLines: BattleReportAttackerLine[];
  defenderLines: BattleReportDefenderLine[];
}

defineProps<{ fight: BattleFightData }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
</script>

<template>
  <div class="fight">
    <div class="power-row">
      <div class="power">
        <span class="power-label">{{ t('hud.battleReport.attackPower') }}</span>
        <span class="power-value">{{ Math.round(fight.attackPower) }}</span>
      </div>
      <div class="power">
        <span class="power-label">{{ t('hud.battleReport.defensePower') }}</span>
        <span class="power-value">{{ Math.round(fight.defensePower) }}</span>
      </div>
    </div>

    <div class="sides">
      <section class="side">
        <h3>{{ t('hud.battleReport.attacker') }}</h3>
        <div class="lines-scroll">
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
              <tr v-for="line in fight.attackerLines" :key="line.unit">
                <td>{{ unitName(line.unit) }}</td>
                <td>{{ line.sent }}</td>
                <td class="lost">{{ line.lost }}</td>
                <td class="survived">{{ line.survived }}</td>
              </tr>
              <tr v-if="!fight.attackerLines.length">
                <td colspan="4" class="empty">{{ t('hud.battleReport.noStacksRecorded') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="side">
        <h3>{{ t('hud.battleReport.defender') }}</h3>
        <div class="lines-scroll">
          <table class="lines">
            <thead>
              <tr>
                <th>{{ t('hud.battleReport.unit') }}</th>
                <th>{{ t('hud.battleReport.lost') }}</th>
                <th>{{ t('hud.battleReport.survived') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in fight.defenderLines" :key="line.unit">
                <td>{{ unitName(line.unit) }}</td>
                <td class="lost">{{ line.lost }}</td>
                <td class="survived">{{ line.survived }}</td>
              </tr>
              <tr v-if="!fight.defenderLines.length">
                <td colspan="3" class="empty">{{ t('hud.battleReport.noStacksRecorded') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
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
.side h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
/* Mobile-readiness audit: lets a table with more/longer columns than a
   360px-wide dialog panel can fit (e.g. German unit names) scroll
   horizontally inside its own section, instead of overflowing the panel or
   forcing the whole modal to scroll sideways. */
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
.lines .survived {
  color: #8ac48a;
}
.lines .empty {
  color: var(--muted);
  text-align: center;
}

@media (max-width: 640px) {
  .sides {
    grid-template-columns: 1fr;
  }
}
</style>
