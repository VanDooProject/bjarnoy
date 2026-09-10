<script setup lang="ts">
// Issue #16 "better hover": "hover on tiles should have more info and
// square edges" — matches the mockup's "Crop farm LEVEL 2 / Output +72
// food/h / Workers 8/8 / CLICK TO OPEN" card. `info.stats` is optional —
// non-building tiles just render title/subtitle/stat as before. See
// HoverInfo's doc comment in HexMapRenderer.ts for how those numbers are
// derived; this component is the only place they're formatted/translated,
// since HexMapRenderer.ts is a plain renderer class with no i18n access.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';
import type { BuildingOutput, BuildingModifier } from '../../lib/map/buildingEconomy';
import type { MessageSchema } from '../../i18n/schema';
import { buildingName, terrainName, resourceName } from '../../i18n/catalogueNames';

const props = defineProps<{ info: HoverInfo }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// screenX is already anchored at the hovered tile's own right edge
// (HexMapRenderer.hoverInfoFor), so only a small fixed margin is needed
// here — the tile-width offset itself lives in world space and scales
// with zoom on its own.
const style = computed(() => ({
  left: `${props.info.screenX + 12}px`,
  top: `${props.info.screenY}px`,
}));

const title = computed(() => {
  const subject = props.info.subject;
  return subject.kind === 'building'
    ? buildingName(subject.buildingType)
    : subject.isRiver
      ? t('hud.hoverTooltip.river')
      : terrainName(subject.terrain);
});

const level = computed(() => (props.info.subject.kind === 'building' ? props.info.subject.level : undefined));

const subtitle = computed(() => {
  const owner = props.info.owner;
  if (!owner) return undefined;
  return owner.mine ? owner.settlementName : t('hud.hoverTooltip.ownedByOther', { owner: owner.ownerName, name: owner.settlementName });
});

// Only shown for a non-building tile without a level badge — matches the
// old "stat" line ("Click to build here" / "Claimed ground" / "Unclaimed").
const stat = computed(() => {
  if (props.info.subject.kind === 'building') return undefined;
  const owner = props.info.owner;
  if (!owner) return t('hud.hoverTooltip.unclaimed');
  return owner.mine ? t('hud.hoverTooltip.clickToBuildHere') : t('hud.hoverTooltip.claimedGround');
});

function formatOutput(output: BuildingOutput): string {
  switch (output.kind) {
    case 'resourceRate':
      return t('hud.hoverTooltip.outputResourceRate', { amount: output.amount, resource: resourceName(output.resource) });
    case 'populationCapacity':
      return t('hud.hoverTooltip.outputPopulationCapacity', { amount: output.amount });
    case 'storageCapacity':
      return t('hud.hoverTooltip.outputStorageCapacity', { amount: output.amount });
    case 'visionRing':
      return t('hud.hoverTooltip.outputVisionRing', { amount: output.amount });
  }
}

function formatModifier(modifier: BuildingModifier): string {
  switch (modifier.kind) {
    case 'borderAnchor':
      return t('hud.hoverTooltip.modifierBorderAnchor');
    case 'trainsLandTroops':
      return t('hud.hoverTooltip.modifierTrainsLandTroops');
    case 'trainsShips':
      return t('hud.hoverTooltip.modifierTrainsShips');
    case 'garrison':
      return t('hud.hoverTooltip.modifierGarrison');
    case 'terrainBoost':
      return t('hud.hoverTooltip.modifierTerrainBoost', { terrain: terrainName(modifier.terrain), percent: modifier.percent });
    case 'coastal':
      return modifier.percent
        ? t('hud.hoverTooltip.modifierCoastalBoost', { percent: modifier.percent })
        : t('hud.hoverTooltip.modifierCoastal');
    case 'arcane':
      return t('hud.hoverTooltip.modifierArcane');
    case 'shrineFavour':
      if (modifier.domain === 'shipAttack') {
        return t('hud.hoverTooltip.modifierShrineFavourShipAttack', { percent: modifier.percent });
      }
      if (modifier.domain === 'landAttack') {
        return t('hud.hoverTooltip.modifierShrineFavourLandAttack', { percent: modifier.percent });
      }
      return t('hud.hoverTooltip.modifierShrineFavour', {
        percent: modifier.percent,
        domain: t(modifier.domain === 'wood' ? 'hud.hoverTooltip.domainWood' : 'hud.hoverTooltip.domainFood'),
      });
  }
}

const outputText = computed(() => (props.info.stats?.output ? formatOutput(props.info.stats.output) : undefined));
const modifierText = computed(() => (props.info.stats?.modifier ? formatModifier(props.info.stats.modifier) : undefined));
const workersText = computed(() =>
  props.info.stats?.workers ? t('hud.hoverTooltip.workersValue', { cap: props.info.stats.workers.cap }) : undefined,
);
</script>

<template>
  <div class="hex-tooltip panel" :style="style">
    <div class="title-row">
      <span class="title">{{ title }}</span>
      <span v-if="level" class="level">{{ t('hud.hoverTooltip.level', { level }) }}</span>
    </div>
    <div v-if="subtitle" class="subtitle">{{ subtitle }}</div>
    <div class="separator" />
    <div v-if="stat && !level" class="stat">{{ stat }}</div>
    <dl v-if="outputText || modifierText || workersText" class="stats">
      <template v-if="outputText">
        <dt>{{ t('hud.hoverTooltip.output') }}</dt>
        <dd>{{ outputText }}</dd>
      </template>
      <template v-if="modifierText">
        <dt>{{ t('hud.hoverTooltip.modifier') }}</dt>
        <dd>{{ modifierText }}</dd>
      </template>
      <template v-if="workersText">
        <dt>{{ t('hud.hoverTooltip.workers') }}</dt>
        <dd>{{ workersText }}</dd>
      </template>
    </dl>
    <div v-if="info.premiumLocked" class="premium-gate">
      <span class="lock">{{ t('hud.hoverTooltip.lockIcon') }}</span>
      <i18n-t keypath="hud.hoverTooltip.premiumGate" tag="span">
        <template #premium><strong>{{ t('hud.hoverTooltip.premium') }}</strong></template>
      </i18n-t>
    </div>
    <div v-if="info.openable" class="cta">{{ t('hud.hoverTooltip.clickToOpen') }}</div>
  </div>
</template>

<style scoped>
.hex-tooltip {
  position: absolute;
  transform: translate(0, -50%);
  z-index: 20;
  padding: 10px 14px;
  min-width: 170px;
  pointer-events: none;
  /* Issue #16: square, not rounded — .panel's own border-radius is
     overridden here rather than there, since other .panel HUD chrome
     (RealmPanel, BuildQueuePanel, etc.) is unaffected by this change. */
  border-radius: 0;
}
.title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.title {
  font-weight: 600;
  font-size: 15px;
  color: var(--text);
}
.level {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--gold);
}
.subtitle {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}
.separator {
  margin-top: 8px;
  border-top: 1px solid var(--panel-border);
}
.stat {
  margin-top: 6px;
  font-size: 13px;
  color: var(--gold);
}
.stats {
  margin: 8px 0 0;
  display: grid;
  grid-template-columns: auto auto;
  column-gap: 10px;
  row-gap: 2px;
  font-size: 12px;
}
.stats dt {
  color: var(--muted);
}
.stats dd {
  margin: 0;
  color: var(--text);
  font-weight: 500;
  text-align: right;
}
.cta {
  margin-top: 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--muted-2, var(--muted));
  border-top: 1px solid var(--panel-border);
  padding-top: 6px;
}
.premium-gate {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted);
}
.premium-gate strong {
  color: var(--gold);
  font-weight: 600;
}
.premium-gate .lock {
  font-size: 11px;
}
</style>
