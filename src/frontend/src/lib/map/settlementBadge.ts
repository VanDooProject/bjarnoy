/**
 * The light suffix of a settlement's name badge on the settlement map: "Lv 4" (with "you · " for the player's own). A beach camp has no
 * Longhouse level, so it says what it is instead: "you · Beach camp". `beachCampName` is the camp's localized building name.
 */
export function settlementBadgeSuffix(settlement: { level: number }, mine: boolean, isBeachCamp: boolean, beachCampName: string): string {
  const kind = isBeachCamp ? beachCampName : `Lv ${settlement.level}`;
  return mine ? `you · ${kind}` : kind;
}
