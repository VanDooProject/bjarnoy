const resourceLabel = (t, resource) => t(`catalogue.resources.${resource}`);
const terrainLabel = (t, terrain) => t(`catalogue.terrain.${terrain}`);
export function formatBuildingOutput(output, t) {
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
export function formatBuildingModifier(modifier, t) {
    switch (modifier.kind) {
        case 'borderAnchor':
            return t('hud.hoverTooltip.modifierBorderAnchor');
        case 'trainsLandTroops':
            return t('hud.hoverTooltip.modifierTrainsLandTroops');
        case 'trainsShips':
            return t('hud.hoverTooltip.modifierTrainsShips');
        case 'trainsCivilians':
            return t('hud.hoverTooltip.modifierTrainsCivilians');
        case 'terrainBoost':
            return t('hud.hoverTooltip.modifierTerrainBoost', { terrain: terrainLabel(t, modifier.terrain), percent: modifier.percent });
        case 'coastal':
            return modifier.percent
                ? t('hud.hoverTooltip.modifierCoastalBoost', { percent: modifier.percent })
                : t('hud.hoverTooltip.modifierCoastal');
        case 'shrineFavour':
            if (modifier.domain === 'shipAttack')
                return t('hud.hoverTooltip.modifierShrineFavourShipAttack', { percent: modifier.percent });
            if (modifier.domain === 'landAttack')
                return t('hud.hoverTooltip.modifierShrineFavourLandAttack', { percent: modifier.percent });
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
                resource: t(modifier.resource === 'wood'
                    ? 'hud.hoverTooltip.domainWood'
                    : modifier.resource === 'iron'
                        ? 'hud.hoverTooltip.domainIron'
                        : 'hud.hoverTooltip.domainFood'),
            });
        case 'palisadeWall':
            return t('hud.hoverTooltip.modifierPalisadeWall');
        case 'palisadeGate':
            return t('hud.hoverTooltip.modifierPalisadeGate');
        case 'bridge':
            return t(`hud.hoverTooltip.bridgeLevel${modifier.level}`);
    }
}
