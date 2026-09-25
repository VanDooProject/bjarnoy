// Mobile HUD bar rework, phase 3 (owner's decision): the pill row must
// never wrap or scroll on a phone, but a full "4,965/12,000" reads far wider
// than a phone pill has room for once every pill (stock + rate + cap, plus
// population) is showing real numbers at once. Rather than truncate/ellipsis
// individual pills (which would read inconsistently — some short, some
// full), ResourceBar measures the whole row and, only if the full-notation
// row doesn't fit, switches every pill to this short "k"/"M" notation
// together, so the bar always reads as one consistent style.
//
// Pure formatting only — no DOM/Vue here, so this is plain-unit-testable and
// ResourceBar.vue's own fit-measurement logic can stay separate from it.

/** Truncates (toward zero, on the already-non-negative magnitude) to `decimals` places without floating-point rounding surprises. */
function truncateToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor(value * factor + 1e-9) / factor;
}

/**
 * Full notation: a locale-grouped integer (e.g. en "3,000", de "3.000"),
 * with a plain "-" for negative values (a rate can be negative — net
 * consumption outpacing production). This is the HUD's default; short
 * notation only kicks in when the full row doesn't fit (see ResourceBar.vue).
 */
export function formatFullNumber(value: number, locale: string): string {
  const sign = value < 0 ? '-' : '';
  return sign + new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.trunc(Math.abs(value)));
}

/**
 * Short notation, used only once the full row is measured to not fit its
 * available width:
 *  - < 1,000: unchanged (same as `formatFullNumber`)
 *  - 1,000-9,999: one decimal, e.g. "3.6k" (a trailing ".0" is dropped by
 *    `Intl.NumberFormat` itself, so 3,000 -> "3k")
 *  - 10,000-999,999: no decimal, e.g. "12k", "999k"
 *  - >= 1,000,000: one decimal + "M", e.g. "1.2M"
 * Negative values (rates) are formatted on the absolute value and the sign
 * re-applied, so -3,600 -> "-3.6k". The "k"/"M" suffixes are not localized
 * (owner's call — only the decimal separator follows the locale).
 */
export function formatCompactNumber(value: number, locale: string): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  if (abs < 1_000) return sign + formatFullNumber(abs, locale);

  if (abs < 1_000_000) {
    const decimals = abs < 10_000 ? 1 : 0;
    const scaled = truncateToDecimals(abs / 1_000, decimals);
    return `${sign}${new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(scaled)}k`;
  }

  const scaled = truncateToDecimals(abs / 1_000_000, 1);
  return `${sign}${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(scaled)}M`;
}

/** Picks full or short notation by the `short` flag — the one call site ResourceBar.vue actually needs. */
export function formatHudNumber(value: number, locale: string, short: boolean): string {
  return short ? formatCompactNumber(value, locale) : formatFullNumber(value, locale);
}
