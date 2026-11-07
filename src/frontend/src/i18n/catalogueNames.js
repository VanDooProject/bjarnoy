import { i18n } from './index';
function lookup(path, fallback) {
    const full = `catalogue.${path}`;
    return i18n.global.te(full) ? i18n.global.t(full) : fallback;
}
export const buildingName = (type) => lookup(`buildings.${type}`, type);
export const unitName = (type) => lookup(`units.${type}`, type);
export const terrainName = (terrain) => lookup(`terrain.${terrain}`, terrain);
/** A wasted tile's terrain name — `family` is `textures.ts`'s wasted-island `TextureKey` (e.g. `'wasteland'`), not the wire `Terrain`. */
export const wastedTerrainName = (family) => lookup(`wastedTerrain.${family}`, family);
export const giantName = (family) => lookup(`giants.${family}`, family);
export const campName = (family) => lookup(`camps.${family}`, family);
/** An endgame site's name: `utgardwall`, `utgardgate` or `jotunwatchtower`. */
export const endgameName = (site) => lookup(`endgame.${site}`, site);
export const beastName = (family, tier) => lookup(`beasts.${family}.${tier}`, tier);
export const resourceName = (resource) => lookup(`resources.${resource}`, resource);
export const missionName = (mission) => lookup(`missions.${mission}`, mission);
export const runeTypeName = (type) => lookup(`runes.types.${type}`, type);
export const runeRarityName = (rarity) => lookup(`runes.rarities.${rarity}`, rarity);
export const guildRoleName = (role) => lookup(`guild.roles.${role}`, role);
export const guildBoardTopicName = (kind) => lookup(`guild.boardTopics.${kind}`, kind);
export const leaderboardScopeName = (scope) => lookup(`leaderboard.scopes.${scope}`, scope);
export const leaderboardCategoryName = (category) => lookup(`leaderboard.categories.${category}`, category);
