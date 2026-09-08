// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import buildingCatalogue from '../data/building-catalogue.json';
import unitCatalogue from '../data/unit-catalogue.json';
import {
  buildingName,
  guildBoardTopicName,
  guildFeeTierName,
  guildRoleName,
  leaderboardCategoryName,
  leaderboardScopeName,
  missionName,
  resourceName,
  runeRarityName,
  runeTypeName,
  terrainName,
  unitName,
} from './catalogueNames';

// Real catalogue data is backend-generated and only lists `type` as a plain
// string per entry (per-level rows repeat it) — dedupe rather than hardcode
// the type list here, so this test tracks the actual data instead of drifting
// from it.
const buildingTypes = [...new Set(buildingCatalogue.data.map((b) => b.type))];
const unitTypes = [...new Set(unitCatalogue.data.map((u) => u.type))];

describe('catalogueNames', () => {
  it('has a translated name for every real building type', () => {
    for (const type of buildingTypes) {
      expect(buildingName(type), type).not.toBe(type);
    }
  });

  it('has a translated name for every real unit type', () => {
    for (const type of unitTypes) {
      expect(unitName(type), type).not.toBe(type);
    }
  });

  it('has a translated name for every terrain', () => {
    for (const terrain of ['sea', 'sand', 'grass', 'forest', 'mountain']) {
      expect(terrainName(terrain), terrain).not.toBe(terrain);
    }
  });

  it('has a translated name for every resource', () => {
    for (const resource of ['wood', 'stone', 'food', 'iron']) {
      expect(resourceName(resource), resource).not.toBe(resource);
    }
  });

  it('has a translated name for every mission', () => {
    for (const mission of ['move', 'attack', 'support', 'raid', 'found']) {
      expect(missionName(mission), mission).not.toBe(mission);
    }
  });

  it('has a translated name for every rune type and rarity', () => {
    for (const type of ['fehu', 'jera', 'othala']) {
      expect(runeTypeName(type), type).not.toBe(type);
    }
    for (const rarity of ['carved', 'bound', 'blooded']) {
      expect(runeRarityName(rarity), rarity).not.toBe(rarity);
    }
  });

  it('has a translated name for every guild role, fee tier and board topic', () => {
    for (const role of ['leader', 'officer', 'member']) {
      expect(guildRoleName(role), role).not.toBe(role);
    }
    for (const tier of ['copper', 'silver', 'gold']) {
      expect(guildFeeTierName(tier), tier).not.toBe(tier);
    }
    for (const kind of ['discussion', 'announcement', 'report']) {
      expect(guildBoardTopicName(kind), kind).not.toBe(kind);
    }
  });

  it('has a translated name for every leaderboard scope and category', () => {
    for (const scope of ['user', 'settlement', 'guild']) {
      expect(leaderboardScopeName(scope), scope).not.toBe(scope);
    }
    for (const category of [
      'score',
      'biggestSettlement',
      'weeklyScoreGained',
      'weeklyFightsWon',
      'weeklyFightsLost',
      'weeklyResourcesLooted',
      'biggestArmy',
    ]) {
      expect(leaderboardCategoryName(category), category).not.toBe(category);
    }
  });

  it('falls back to the raw key for an unrecognized type', () => {
    expect(buildingName('not-a-real-building')).toBe('not-a-real-building');
    expect(unitName('not-a-real-unit')).toBe('not-a-real-unit');
  });
});
