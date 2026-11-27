<script setup lang="ts">
// One fight of a battle report: the attack and defence power, the volley power of each side when ranged units struck first, and the two line tables. A land army's report is one of these, a
// fleet's two (the ship fight, then the land fight). BattleReportCard.vue is the only user.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BattleReportAttackerLine, BattleReportDefenderLine } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';
import { unitName } from '../../i18n/catalogueNames';

export interface BattleFightData {
  attackPower: number;
  defensePower: number;
  /** The ranged attack each side threw in the volley before the main fight; absent (a ship fight) or 0 without ranged units. */
  attackerVolleyPower?: number;
  defenderVolleyPower?: number;
  attackerLines: BattleReportAttackerLine[];
  defenderLines: BattleReportDefenderLine[];
}

const props = defineProps<{ fight: BattleFightData }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// A fight without ranged units has no volley: its tables keep the single "Lost" column.
const hasVolley = computed(() => (props.fight.attackerVolleyPower ?? 0) > 0 || (props.fight.defenderVolleyPower ?? 0) > 0);
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
      <template v-if="hasVolley">
        <div class="power" data-testid="attacker-volley-power">
          <span class="power-label">{{ t('hud.battleReport.attacker') }} · {{ t('hud.battleReport.volleyPower') }}</span>
          <span class="power-value">{{ Math.round(fight.attackerVolleyPower ?? 0) }}</span>
        </div>
        <div class="power" data-testid="defender-volley-power">
          <span class="power-label">{{ t('hud.battleReport.defender') }} · {{ t('hud.battleReport.volleyPower') }}</span>
          <span class="power-value">{{ Math.round(fight.defenderVolleyPower ?? 0) }}</span>
        </div>
      </template>
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
                <template v-if="hasVolley">
                  <th>{{ t('hud.battleReport.lostVolley') }}</th>
                  <th>{{ t('hud.battleReport.lostFight') }}</th>
                </template>
                <th v-else>{{ t('hud.battleReport.lost') }}</th>
                <th>{{ t('hud.battleReport.survived') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in fight.attackerLines" :key="line.unit">
                <td>{{ unitName(line.unit) }}</td>
                <td>{{ line.sent }}</td>
                <template v-if="hasVolley">
                  <td class="lost" data-testid="lost-volley">{{ line.volleyLost }}</td>
                  <td class="lost" data-testid="lost-fight">{{ line.lost - line.volleyLost }}</td>
                </template>
                <td v-else class="lost">{{ line.lost }}</td>
                <td class="survived">{{ line.survived }}</td>
              </tr>
              <tr v-if="!fight.attackerLines.length">
                <td :colspan="hasVolley ? 5 : 4" class="empty">{{ t('hud.battleReport.noStacksRecorded') }}</td>
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
                <template v-if="hasVolley">
                  <th>{{ t('hud.battleReport.lostVolley') }}</th>
                  <th>{{ t('hud.battleReport.lostFight') }}</th>
                </template>
                <th v-else>{{ t('hud.battleReport.lost') }}</th>
                <th>{{ t('hud.battleReport.survived') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in fight.defenderLines" :key="line.unit">
                <td>{{ unitName(line.unit) }}</td>
                <template v-if="hasVolley">
                  <td class="lost" data-testid="lost-volley">{{ line.volleyLost }}</td>
                  <td class="lost" data-testid="lost-fight">{{ line.lost - line.volleyLost }}</td>
                </template>
                <td v-else class="lost">{{ line.lost }}</td>
                <td class="survived">{{ line.survived }}</td>
              </tr>
              <tr v-if="!fight.defenderLines.length">
                <td :colspan="hasVolley ? 4 : 3" class="empty">{{ t('hud.battleReport.noStacksRecorded') }}</td>
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
  flex-wrap: wrap;
  gap: 12px 24px;
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
