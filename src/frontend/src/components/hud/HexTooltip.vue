<script setup lang="ts">
// Issue #16 "better hover": "hover on tiles should have more info and
// square edges" — matches the mockup's "Crop farm LEVEL 2 / Output +72
// food/h / CLICK TO OPEN" card (the mockup's "Workers 8/8" line is gone: the backend has no workers). `info.stats` is optional —
// non-building tiles just render title/subtitle/stat as before. See
// HoverInfo's doc comment in HexMapRenderer.ts for how those numbers are
// derived; this component is the only place they're formatted/translated,
// since HexMapRenderer.ts is a plain renderer class with no i18n access.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { HoverInfo } from '../../lib/map/HexMapRenderer';
import type { MessageSchema } from '../../i18n/schema';
import { formatBuildingModifier, formatBuildingOutput } from '../../lib/map/buildingStatsText';
import { scaleOutput } from '../../lib/map/buildingEconomy';
import { useWorldStore } from '../../stores/world';
import ResourceIcon from '../ResourceIcon.vue';
import { buildingName, terrainName, wastedTerrainName, giantName, campName, beastName, endgameName } from '../../i18n/catalogueNames';

// Mirrors textures.ts's WASTED_TEXTURE_KEY (grass/forest/sand -> their
// wasted-island art family) plus the coastal case (sea bordering wasted
// land renders as blacksandcoast — see WorldModel.getTile's own `wasted`
// tagging, which only ever sets it on sea when that sea is coastal).
// Mountain has no dedicated wasted family, so it isn't listed here either.
const WASTED_TERRAIN_LABEL_KEY: Partial<Record<string, string>> = {
  grass: 'wasteland',
  forest: 'deadforest',
  sand: 'blacksand',
  sea: 'blacksandcoast',
};

/**
 * The quick upgrade line under an own building while the quick upgrade applies (MapView fills it): what a click orders, its price
 * and time, or why it is blocked; for a free account only `locked`, the premium line.
 */
export interface HexTooltipUpgrade {
  title?: string;
  cost?: { wood?: number; stone?: number; food?: number; iron?: number };
  time?: string;
  /** Why the click would be refused (the ring's Upgrade bubble hint). */
  blocked?: string;
  /** A free account: the line that says quick upgrade is premium. */
  locked?: string;
}

const world = useWorldStore();
const props = defineProps<{
  info: HoverInfo;
  /** The other accounts a guarded bridge also lets through (the viewer's guild and the guilds at peace with it; `guild.friendlyUserIds`). */
  friendOwners?: ReadonlySet<string>;
  upgrade?: HexTooltipUpgrade;
}>();

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// screenX is already anchored at the hovered tile's own right edge
// (HexMapRenderer.hoverInfoFor), so only a small fixed margin is needed
// here — the tile-width offset itself lives in world space and scales
// with zoom on its own.
// Positioned with a transform, not left/top: the tooltip jumps to a new
// spot on every hex change, and a left/top move is a layout change that
// repainted the whole page above the WebGL map each time — on a real GPU
// that showed as short white rectangles flashing beside the cursor.
// A transform only moves the tooltip's own compositor layer.
const style = computed(() => ({
  transform: `translate(${props.info.screenX + 12}px, ${props.info.screenY}px) translateY(-50%)`,
}));

const title = computed(() => {
  const subject = props.info.subject;
  if (subject.kind === 'building') return buildingName(subject.buildingType);
  if (subject.kind === 'giant') return giantName(subject.family);
  if (subject.kind === 'camp') return campName(subject.family);
  if (subject.kind === 'utgardwall') return endgameName(subject.gate ? 'utgardgate' : 'utgardwall');
  if (subject.kind === 'jotuntower') return endgameName('jotunwatchtower');
  if (subject.isRiver) return t('hud.hoverTooltip.river');
  if (subject.wasted) {
    const key = WASTED_TERRAIN_LABEL_KEY[subject.terrain];
    if (key) return wastedTerrainName(key);
  }
  return terrainName(subject.terrain);
});

const level = computed(() => {
  const subject = props.info.subject;
  return subject.kind === 'building' || subject.kind === 'camp' ? subject.level : undefined;
});

const subtitle = computed(() => {
  const owner = props.info.owner;
  if (!owner) return undefined;
  return owner.mine ? owner.settlementName : t('hud.hoverTooltip.ownedByOther', { owner: owner.ownerName, name: owner.settlementName });
});

// Only shown for a non-building tile without a level badge — matches the
// old "stat" line ("Click to build here" / "Claimed ground" / "Unclaimed").
const stat = computed(() => {
  const subject = props.info.subject;
  if (subject.kind === 'building') return undefined;
  // A wildlife camp: not buildable, so no "click to build" line — say how strong it is.
  if (subject.kind === 'camp') return subject.strong ? t('hud.hoverTooltip.campStrong') : t('hud.hoverTooltip.campWeak');
  // An endgame site is not buildable either: say what state it is in.
  if (subject.kind === 'utgardwall') return t(`hud.hoverTooltip.wallLevel${Math.min(Math.max(subject.level, 0), 2)}`);
  if (subject.kind === 'jotuntower') return t(`hud.hoverTooltip.towerLevel${Math.min(Math.max(subject.level, 0), 2)}`);
  const owner = props.info.owner;
  if (!owner) return t('hud.hoverTooltip.unclaimed');
  return owner.mine ? t('hud.hoverTooltip.clickToBuildHere') : t('hud.hoverTooltip.claimedGround');
});

// A wildlife camp's live state: garrison per tier with the beasts' names, then whether it is empty,
// calm until some time, or aggressive, and how often it was cleared. Absent in demo mode.
const campLines = computed(() => {
  const subject = props.info.subject;
  if (subject.kind !== 'camp' || !subject.live) return [];
  const live = subject.live;
  const lines = (['young', 'adult', 'alpha'] as const)
    .filter((tier) => live.fullGarrison[tier] > 0)
    .map((tier) => `${beastName(subject.family, tier)} ${live.garrison[tier]} / ${live.fullGarrison[tier]}`);
  const calm = live.calmUntil && Date.parse(live.calmUntil) > Date.now() ? live.calmUntil : null;
  if (live.empty) lines.push(t('hud.hoverTooltip.campEmpty'));
  else if (calm) lines.push(t('hud.hoverTooltip.campCalmUntil', { time: d(new Date(calm), 'long') }));
  else if (subject.strong && live.aggressive) lines.push(t('hud.hoverTooltip.campAggressive'));
  if (live.clears > 0) lines.push(t('hud.hoverTooltip.campClears', { count: live.clears }, live.clears));
  return lines;
});

// A bridge shows what its level does to a crossing army, to everyone (its stats are otherwise the owner's alone), and for the guarded
// one whether the viewer's armies may cross. Words only, no path costs (the "slower/quicker" convention of the walls docs).
const bridgeLevel = computed(() => {
  const subject = props.info.subject;
  return subject.kind === 'building' && subject.buildingType === 'bridge' ? Math.min(Math.max(subject.level, 0), 4) : undefined;
});
const bridgeText = computed(() => (bridgeLevel.value === undefined ? undefined : t(`hud.hoverTooltip.bridgeLevel${bridgeLevel.value}`)));
const bridgeAccessText = computed(() => {
  if (bridgeLevel.value !== 4) return undefined;
  const owner = props.info.owner;
  if (owner?.mine) return t('hud.hoverTooltip.bridgeAccessOwner');
  if (owner?.ownerId && props.friendOwners?.has(owner.ownerId)) return t('hud.hoverTooltip.bridgeAccessFriend');
  return t('hud.hoverTooltip.bridgeAccessClosed');
});

const RESOURCE_KEYS = ['wood', 'stone', 'food', 'iron'] as const;
const upgradeCost = computed(() =>
  RESOURCE_KEYS.filter((key) => !!props.upgrade?.cost?.[key]).map((key) => ({
    key,
    // Upgrade costs scale by a fractional factor; show what the player has to have, rounded up (like the ring's card).
    amount: Math.ceil(props.upgrade!.cost![key]!),
    short: props.upgrade!.cost![key]! > world.hud.available[key],
  })),
);

const outputText = computed(() =>
  props.info.stats?.output ? formatBuildingOutput(scaleOutput(props.info.stats.output, world.worldSpeedFactor), t) : undefined,
);
const modifierText = computed(() =>
  props.info.stats?.modifier && props.info.stats.modifier.kind !== 'bridge' ? formatBuildingModifier(props.info.stats.modifier, t) : undefined,
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
    <div v-if="stat" class="stat">{{ stat }}</div>
    <ul v-if="campLines.length" class="camp-lines" data-testid="camp-lines">
      <li v-for="line in campLines" :key="line">{{ line }}</li>
    </ul>
    <dl v-if="outputText || modifierText || bridgeText" class="stats">
      <template v-if="outputText">
        <dt>{{ t('hud.hoverTooltip.output') }}</dt>
        <dd>{{ outputText }}</dd>
      </template>
      <template v-if="modifierText">
        <dt>{{ t('hud.hoverTooltip.modifier') }}</dt>
        <dd>{{ modifierText }}</dd>
      </template>
      <template v-if="bridgeText">
        <dt>{{ t('hud.hoverTooltip.crossing') }}</dt>
        <dd data-testid="bridge-crossing">{{ bridgeText }}</dd>
      </template>
      <template v-if="bridgeAccessText">
        <dt />
        <dd data-testid="bridge-access">{{ bridgeAccessText }}</dd>
      </template>
    </dl>
    <div v-if="info.premiumLocked" class="premium-gate">
      <span class="lock">{{ t('hud.hoverTooltip.lockIcon') }}</span>
      <i18n-t keypath="hud.hoverTooltip.premiumGate" tag="span">
        <template #premium><strong>{{ t('hud.hoverTooltip.premium') }}</strong></template>
      </i18n-t>
    </div>
    <div v-if="upgrade" class="quick-upgrade" :class="{ locked: !!upgrade.locked, blocked: !!upgrade.blocked }" data-testid="tooltip-upgrade">
      <template v-if="upgrade.locked">
        <svg class="quick-upgrade__icon" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="5.5" width="7" height="5" rx="1" /><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" /></svg>
        <span>{{ upgrade.locked }}</span>
      </template>
      <template v-else>
        <div class="quick-upgrade__title">
          <svg class="quick-upgrade__icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5 6 3l3.5 3.5M2.5 10 6 6.5 9.5 10" /></svg>
          <span>{{ upgrade.title }}</span>
        </div>
        <div v-if="upgrade.blocked" class="quick-upgrade__blocked" data-testid="tooltip-upgrade-blocked">{{ upgrade.blocked }}</div>
        <div v-if="upgradeCost.length || upgrade.time" class="quick-upgrade__rows">
          <span v-for="chip in upgradeCost" :key="chip.key" class="quick-upgrade__chip">
            <ResourceIcon :kind="chip.key" :size="12" />
            <b :class="{ short: chip.short }">{{ chip.amount }}</b>
          </span>
          <span v-if="upgrade.time" class="quick-upgrade__time">{{ upgrade.time }}</span>
        </div>
      </template>
    </div>
    <div v-if="info.openable" class="cta">{{ t('hud.hoverTooltip.clickToOpen') }}</div>
  </div>
</template>

<style scoped>
.hex-tooltip {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
  z-index: 20;
  padding: 10px 14px;
  min-width: 170px;
  pointer-events: none;
  /* Issue #16: square, not rounded — .panel's own border-radius is
     overridden here rather than there, since other .panel HUD chrome
     (BuildQueuePanel, etc.) is unaffected by this change. */
  border-radius: 0;
  /* .panel's 80px-blur shadow is sized for big modals; on a card that is
     re-rastered on every hex change it is a large, expensive paint. */
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.55);
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
.camp-lines {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  font-size: 12px;
  color: var(--muted);
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
.quick-upgrade {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--gold);
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: var(--gold);
}
.quick-upgrade.locked {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  color: var(--muted);
}
.quick-upgrade__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.quick-upgrade__icon {
  flex: none;
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.quick-upgrade__blocked {
  color: var(--muted);
}
.quick-upgrade__rows {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  color: var(--text);
}
.quick-upgrade__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.quick-upgrade__chip .short {
  color: #e2705f;
}
.quick-upgrade__time {
  color: var(--muted);
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
