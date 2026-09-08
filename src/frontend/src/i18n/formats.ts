import type { IntlDateTimeFormats, IntlNumberFormats } from 'vue-i18n';

// Shared date/number presentation used via `d()`/`n()` so formatting follows
// the chosen app locale instead of the browser's `navigator.language`.
export const datetimeFormats: IntlDateTimeFormats = {
  en: {
    short: { year: 'numeric', month: 'short', day: 'numeric' },
    long: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    dateLong: { year: 'numeric', month: 'long', day: 'numeric' },
  },
  de: {
    short: { year: 'numeric', month: '2-digit', day: '2-digit' },
    long: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' },
    dateLong: { year: 'numeric', month: 'long', day: 'numeric' },
  },
};

export const numberFormats: IntlNumberFormats = {
  en: {
    integer: { maximumFractionDigits: 0 },
    compact: { notation: 'compact', maximumFractionDigits: 1 },
  },
  de: {
    integer: { maximumFractionDigits: 0 },
    compact: { notation: 'compact', maximumFractionDigits: 1 },
  },
};
