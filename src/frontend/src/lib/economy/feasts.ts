// Town Square feast numbers (economy.md §6). Mirrors
// src/backend/src/Bjarnoy.Domain/Settlers/Feasts.cs — change both together.

export const FEAST_HOURS = 12;
export const FEAST_COST_BASE = 800;
export const FEAST_COST_GROWTH = 1.25;
export const FEAST_RENOWN_BASE = 3500;
export const FEAST_RENOWN_GROWTH = 1.15;
/** Renown needed for the 2nd settlement (RenownThresholds.BaseThreshold). */
export const RENOWN_BASE_THRESHOLD = 55_000;

/** Each of wood, stone and food a level-`townSquare` feast costs, paid up front. */
export const feastCost = (townSquare: number): number => FEAST_COST_BASE * FEAST_COST_GROWTH ** (townSquare - 1);
/** Renown a finished level-`townSquare` feast grants. */
export const feastRenown = (townSquare: number): number => FEAST_RENOWN_BASE * FEAST_RENOWN_GROWTH ** (townSquare - 1);
