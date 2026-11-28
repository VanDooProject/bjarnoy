// SVG path data (24×24 viewBox, drawn as strokes) shared by every place that shows the same icon, so the HUD column and the
// reports list cannot drift apart.

/** Two crossed swords: armies in the HUD column, battles (sieges included) in the reports list. */
export const CROSSED_SWORDS_PATHS = [
  'M5 5 17.5 17.5M5 5V8.5M5 5H8.5',
  'M19 5 6.5 17.5M19 5V8.5M19 5H15.5',
  'M15.5 15.5 18.5 18.5M8.5 15.5 5.5 18.5',
] as const;

/** Two swords over a wave: a fight at sea. */
export const FIELD_BATTLE_PATHS = [
  'M6 4 15.5 13.5M6 4V7M6 4H9',
  'M18 4 8.5 13.5M18 4V7M18 4H15',
  'M3 19.5c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0',
] as const;

/** A paw: a wildlife camp. The four toes are the circles in `CAMP_TOES`. */
export const CAMP_PAW_PATH =
  'M12 12.5c-2.6 0-5 2.6-5 5 0 1.6 1.3 2.5 2.7 2.5 1 0 1.5-.5 2.3-.5s1.3.5 2.3.5c1.4 0 2.7-.9 2.7-2.5 0-2.4-2.4-5-5-5Z';
export const CAMP_TOES = [
  { cx: 6, cy: 10 },
  { cx: 9.5, cy: 6.2 },
  { cx: 14.5, cy: 6.2 },
  { cx: 18, cy: 10 },
] as const;
export const CAMP_TOE_RADIUS = 1.7;

/** A banner on a pole: an army. */
export const ARMY_PATHS = ['M6 21V3.5', 'M6 4.5h11.5L15 8l2.5 3.5H6'] as const;

/** A pair of scales: a trade. */
export const TRADE_PATHS = ['M12 4v15.5M8 20h8M5 7h14', 'M5 7 2.5 12.5a2.6 2.6 0 0 0 5 0Z', 'M19 7l-2.5 5.5a2.6 2.6 0 0 0 5 0Z'] as const;

/** An envelope with a dot: the Reports panel itself. */
export const LETTER_PATHS = ['M4 6.5h16v11.5H4Z', 'M4 7l8 6 8-6'] as const;
export const LETTER_DOT = { cx: 17.5, cy: 17.5, r: 2.6 } as const;

/** A map pin (drawn at stroke width 2.2): a report's location link. */
export const PIN_PATH = 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z';
export const PIN_DOT = { cx: 12, cy: 10, r: 2.3 } as const;
