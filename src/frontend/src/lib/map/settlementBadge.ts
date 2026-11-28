/** The localized pieces of a settlement badge's suffix (HexMapRenderer fills them from i18n; the function below stays pure). */
export interface BadgeSuffixText {
  /** "you": who the player's own settlement is credited to. */
  you: string;
  /** The beach camp's localized building name, shown in place of a level. */
  beachCamp: string;
  /** "Lv 4". */
  level: (level: number) => string;
  /** "{who} · {kind}". */
  join: (who: string, kind: string) => string;
}

/**
 * The light suffix of a settlement's name badge: "you · Lv 4" for the player's own, "Jarl-f0da · Lv 4" for a rival (its owner's name).
 * A beach camp has no Longhouse level, so it says what it is instead: "you · Beach camp".
 */
export function settlementBadgeSuffix(
  settlement: { level: number; ownerName: string },
  mine: boolean,
  isBeachCamp: boolean,
  text: BadgeSuffixText,
): string {
  const kind = isBeachCamp ? text.beachCamp : text.level(settlement.level);
  return text.join(mine ? text.you : settlement.ownerName, kind);
}
