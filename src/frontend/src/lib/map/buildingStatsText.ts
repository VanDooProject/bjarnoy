// The one place that turns a building's structured stats (BuildingOutput /
// BuildingModifier from buildingEconomy.ts) into display text. The hover
// tooltip, the building modal, MapView's ring/preview cards and the tech tree
// all call these, so a changed rule is worded once. The translate function is
// a parameter so plain-TS callers (techtree/nodes.ts) can use it as well as
// components; all wording lives in the `hud.hoverTooltip.*` i18n keys.
import type { BuildingModifier, BuildingOutput } from './buildingEconomy';

/** Translate a message key; `named` fills `{placeholders}`. */
export type StatsTranslate = (key: string, named?: Record<string, unknown>) => string;

const resourceLabel = (t: StatsTranslate, resource: string) => t(`catalogue.resources.${resource}`);
const terrainLabel = (t: StatsTranslate, terrain: string) => t(`catalogue.terrain.${terrain}`);

export function formatBuildingOutput(output: BuildingOutput, t: StatsTranslate): string {
  switch (output.kind) {
    case 'resourceRate':
      return t('hud.hoverTooltip.outputResourceRate', { amount: output.amount, resource: resourceLabel(t, output.resource) });
    case 'populationCapacity':
      return t('hud.hoverTooltip.outputPopulationCapacity', { amount: output.amount });
    case 'storageCapacity':
      return t('hud.hoverTooltip.outputStorageCapacity', { amount: output.amount });
    case 'visionRing':
      return t('hud.hoverTooltip.outputVisionRing', { amount: output.amount, explored: output.explored });
  }
}

export function formatBuildingModifier(modifier: BuildingModifier, t: StatsTranslate): string {
  switch (modifier.kind) {
    case 'borderAnchor':
      return t('hud.hoverTooltip.modifierBorderAnchor');
    case 'trainsLandTroops':
      return t('hud.hoverTooltip.modifierTrainsLandTroops');
    case 'trainsShips':
      return t('hud.hoverTooltip.modifierTrainsShips');
    case 'trainsCivilianCrews':
      return t('hud.hoverTooltip.modifierTrainsCivilianCrews');
    case 'terrainBoost':
      return t('hud.hoverTooltip.modifierTerrainBoost', { terrain: terrainLabel(t, modifier.terrain), percent: modifier.percent });
    case 'coastal':
      return modifier.percent
        ? t('hud.hoverTooltip.modifierCoastalBoost', { percent: modifier.percent })
        : t('hud.hoverTooltip.modifierCoastal');
    case 'shrineFavour':
      if (modifier.domain === 'shipAttack') return t('hud.hoverTooltip.modifierShrineFavourShipAttack', { percent: modifier.percent });
      if (modifier.domain === 'landAttack') return t('hud.hoverTooltip.modifierShrineFavourLandAttack', { percent: modifier.percent });
      return t('hud.hoverTooltip.modifierShrineFavour', {
        percent: modifier.percent,
        domain: t(modifier.domain === 'wood' ? 'hud.hoverTooltip.domainWood' : 'hud.hoverTooltip.domainFood'),
      });
    case 'odinFavour':
      return t('hud.hoverTooltip.modifierOdinFavour', { percent: modifier.buildTimePercent, rings: modifier.visionRings });
    case 'radiusBoost':
      return t(modifier.range === 1 ? 'hud.hoverTooltip.modifierRadiusBoostOneRing' : 'hud.hoverTooltip.modifierRadiusBoost', {
        percent: modifier.percent,
        range: modifier.range,
        resource: t(
          modifier.resource === 'wood'
            ? 'hud.hoverTooltip.domainWood'
            : modifier.resource === 'iron'
              ? 'hud.hoverTooltip.domainIron'
              : 'hud.hoverTooltip.domainFood',
        ),
      });
    case 'palisadeWall':
      return t('hud.hoverTooltip.modifierPalisadeWall');
    case 'palisadeGate':
      return t('hud.hoverTooltip.modifierPalisadeGate');
    case 'bridge':
      return t(`hud.hoverTooltip.bridgeLevel${modifier.level}`);
  }
}
