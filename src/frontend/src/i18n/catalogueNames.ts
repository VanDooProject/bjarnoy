import { i18n } from './index';

function lookup(path: string, fallback: string): string {
  const full = `catalogue.${path}`;
  return i18n.global.te(full) ? (i18n.global.t(full) as string) : fallback;
}

export const buildingName = (type: string) => lookup(`buildings.${type}`, type);
export const unitName = (type: string) => lookup(`units.${type}`, type);
export const terrainName = (terrain: string) => lookup(`terrain.${terrain}`, terrain);
export const resourceName = (resource: string) => lookup(`resources.${resource}`, resource);
export const missionName = (mission: string) => lookup(`missions.${mission}`, mission);
export const runeTypeName = (type: string) => lookup(`runes.types.${type}`, type);
export const runeRarityName = (rarity: string) => lookup(`runes.rarities.${rarity}`, rarity);
export const guildRoleName = (role: string) => lookup(`guild.roles.${role}`, role);
export const guildFeeTierName = (tier: string) => lookup(`guild.feeTiers.${tier}`, tier);
export const guildBoardTopicName = (kind: string) => lookup(`guild.boardTopics.${kind}`, kind);
export const leaderboardScopeName = (scope: string) => lookup(`leaderboard.scopes.${scope}`, scope);
export const leaderboardCategoryName = (category: string) => lookup(`leaderboard.categories.${category}`, category);
