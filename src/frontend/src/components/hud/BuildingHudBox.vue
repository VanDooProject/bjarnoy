<script setup lang="ts">
// The text box docked to a building marker's dial: the rows `rowsFor` picked for the zoom tier (lib/hud/buildingHud.ts).
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { buildingName } from '../../i18n/catalogueNames';
import type { HudRequirement, HudRow } from '../../lib/hud/buildingHud';
import { formatCountdown } from '../../lib/hud/countdown';
import { formatFullNumber } from '../../lib/hud/compactNumber';
import { RESOURCE_TOKENS } from '../../lib/resources/resourceGlyphs';
import BuildingHudIcon from './BuildingHudIcon.vue';
import UnitIcon from '../UnitIcon.vue';

defineProps<{ rows: HudRow[]; tier: 'near' | 'mid' }>();

const { t, locale } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const num = (n: number) => formatFullNumber(n, locale.value);
const signed = (n: number) => `+${num(n)}`;

/** "1h 05m" / "42m": coarse, a premium player reads it as "about when". */
function eta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '–';
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m`;
  return `${Math.max(1, Math.round(seconds / 60))}m`;
}

function requirementText(req: HudRequirement): string {
  return req.kind === 'longhouse'
    ? t('hud.buildingHud.needsLonghouse', { level: req.level })
    : t('hud.buildingHud.needsBuilding', { building: buildingName(req.type), level: req.level });
}

const pct = (fraction: number) => `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(1)}%`;

</script>

<template>
  <div class="hud-rows" :class="`hud-rows--${tier}`">
    <template v-for="(row, i) in rows" :key="i">
      <template v-if="row.kind === 'upgrade'">
        <!-- Missing requirements: one chip per line, near folds from four on, mid from three on. -->
        <template v-if="row.requirements.length">
          <template v-if="tier === 'near'">
            <div v-for="(req, j) in row.requirements" :key="j" class="hud-row">
              <span class="hud-chip hud-chip--blocked"><BuildingHudIcon name="lock" />{{ requirementText(req) }}</span>
            </div>
            <div v-if="row.moreCount" class="hud-row hud-muted">{{ t('hud.buildingHud.more', { n: row.moreCount }) }}</div>
          </template>
          <div v-else class="hud-row">
            <span class="hud-chip hud-chip--blocked">
              <BuildingHudIcon name="lock" />{{ requirementText(row.requirements[0]!) }}
              <template v-if="row.moreCount">&nbsp;<span class="hud-muted">{{ t('hud.buildingHud.moreShort', { n: row.moreCount }) }}</span></template>
            </span>
          </div>
        </template>
        <div v-else class="hud-row">
          <span v-if="row.state === 'ready'" class="hud-chip hud-chip--ready"><BuildingHudIcon name="up" />{{ t('hud.buildingHud.upgrade') }}</span>
          <span v-else-if="row.state === 'short'" class="hud-chip hud-chip--short">
            <BuildingHudIcon name="up" />
            <span v-if="row.premiumHint" class="hud-premium"><BuildingHudIcon name="premium" /></span>
            <span v-else class="hud-num">{{ eta(row.affordableInSeconds) }}</span>
          </span>
          <span v-else-if="row.state === 'storage'" class="hud-chip hud-chip--blocked"><BuildingHudIcon name="lock" />{{ t('hud.buildingHud.storage') }}</span>
          <span v-else-if="row.state === 'upgrading' || row.state === 'queued'" class="hud-chip hud-chip--work">{{ `→${row.targetLevel}` }}</span>
          <span v-else-if="row.state === 'max'" class="hud-chip hud-chip--max"><BuildingHudIcon v-if="row.crown" name="crown" />{{ t('hud.buildingHud.max') }}</span>
        </div>
      </template>

      <div v-else-if="row.kind === 'production'" class="hud-row">
        <span v-for="p in row.production" :key="p.resource" class="hud-chip">
          <i class="hud-res" :style="{ background: RESOURCE_TOKENS[p.resource] }" />
          <span class="hud-num">{{ signed(p.perHour) }}</span>
        </span>
        <span class="hud-muted">{{ t('hud.buildingHud.perHour') }}</span>
      </div>

      <div v-else-if="row.kind === 'storage'" class="hud-row">
        <span class="hud-chip"><BuildingHudIcon name="store" /><span class="hud-num">{{ num(row.capacity) }}</span></span>
        <span class="hud-muted">{{ t('hud.buildingHud.each') }}</span>
      </div>

      <div v-else-if="row.kind === 'feast'" class="hud-q">
        <div class="hud-row">
          <span class="hud-chip hud-chip--max"><BuildingHudIcon name="star" />{{ t('hud.buildingHud.feast') }}</span>
          <span class="hud-num">{{ formatCountdown(row.secondsLeft) }}</span>
          <span class="hud-muted">{{ `→ ${signed(row.renownGain)}` }}</span>
        </div>
        <div class="hud-bar"><b :style="{ width: pct(row.total > 0 ? 1 - row.secondsLeft / row.total : 1) }" /></div>
      </div>

      <template v-else-if="row.kind === 'garrison'">
        <div v-for="(line, j) in [row.entries.slice(0, 2), row.entries.slice(2, 4)].filter((l) => l.length)" :key="j" class="hud-row hud-troops">
          <span v-for="g in line" :key="g.unit" class="hud-chip"><UnitIcon :unit="g.unit" /><span class="hud-num">{{ num(g.count) }}</span></span>
        </div>
      </template>

      <div v-else-if="row.kind === 'training'" class="hud-q">
        <div class="hud-row">
          <span class="hud-pips">
            <i v-for="n in row.slotsMax" :key="n" :class="{ on: n <= row.slotsUsed, cur: n === 1 && row.slotsUsed > 0 }" />
          </span>
          <template v-if="row.current">
            <span class="hud-chip"><UnitIcon :unit="row.current.unit" /><span class="hud-num">{{ row.current.count }}</span></span>
            <span class="hud-num hud-muted">{{ formatCountdown(row.current.secondsLeft) }}</span>
          </template>
        </div>
        <div v-if="row.current" class="hud-bar"><b :style="{ width: pct(row.current.progress) }" /></div>
      </div>

      <div v-else-if="row.kind === 'compact'" class="hud-row hud-compact">
        <span v-if="row.feastSecondsLeft !== undefined" class="hud-chip hud-chip--max"><BuildingHudIcon name="star" /><span class="hud-num">{{ formatCountdown(row.feastSecondsLeft) }}</span></span>
        <template v-else>
          <span v-if="row.storage !== undefined" class="hud-chip"><BuildingHudIcon name="store" /><span class="hud-num">{{ num(row.storage) }}</span></span>
          <template v-else-if="row.production">
            <span v-for="p in row.production" :key="p.resource" class="hud-chip">
              <i class="hud-res" :style="{ background: RESOURCE_TOKENS[p.resource] }" /><span class="hud-num">{{ num(p.perHour) }}</span>
            </span>
          </template>
        </template>
        <span v-if="row.garrisonTotal !== undefined" class="hud-chip"><BuildingHudIcon name="shield" /><span class="hud-num">{{ num(row.garrisonTotal) }}</span></span>
        <span v-if="row.queue" class="hud-pips">
          <i v-for="n in row.queue.slotsMax" :key="n" :class="{ on: n <= row.queue.slotsUsed, cur: n === 1 && row.queue.slotsUsed > 0 }" />
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.hud-rows {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  font-size: 11.5px;
  white-space: nowrap;
  color: var(--text);
}
.hud-rows--mid {
  gap: 3px;
}
/* The whole marker scales with the map; near only shows from HUD_TIER.nearAt up, so its text is set smaller here and reads at 1x
   from there on while three rows still fit the dial's height. */
.hud-rows--near {
  zoom: 0.8;
}
.hud-row {
  display: flex;
  align-items: center;
  gap: 5px;
}
.hud-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-weight: 600;
  font-size: 11px;
}
.hud-chip--ready { color: #5fd08a; }
.hud-chip--short { color: #f0b04a; }
.hud-chip--blocked { color: #93a3ae; }
.hud-chip--work { color: #6fb0e0; }
.hud-chip--max { color: #ffc55c; }
.hud-premium {
  display: inline-flex;
  color: #c79bff;
  opacity: 0.6;
}
.hud-muted { color: var(--muted); }
.hud-num { font-variant-numeric: tabular-nums; }
.hud-res {
  width: 11px;
  height: 12px;
  display: inline-block;
  flex: none;
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
}
.hud-troops { gap: 8px; }
.hud-compact { gap: 6px; }
.hud-compact > * + * {
  padding-left: 6px;
  border-left: 1px solid rgba(255, 255, 255, 0.12);
}
.hud-q { display: grid; gap: 3px; min-width: 104px; }
.hud-pips { display: inline-flex; gap: 2px; }
.hud-pips i {
  width: 6px;
  height: 8px;
  border-radius: 1.5px;
  background: rgba(255, 255, 255, 0.18);
}
.hud-pips i.on { background: var(--text); }
.hud-pips i.on.cur { background: #ffc55c; }
.hud-bar {
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.14);
  overflow: hidden;
}
.hud-bar > b {
  display: block;
  height: 100%;
  background: #ffc55c;
}
</style>
