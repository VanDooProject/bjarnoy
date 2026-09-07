import common from './locales/en/common.json';
import catalogue from './locales/en/catalogue.json';

// English is the source of truth for keys: every other locale is typed
// against its shape, so a missing/misspelled key is a `vue-tsc -b` error.
// New namespace files get merged in here as their extraction PR lands.
export interface MessageSchema {
  common: typeof common;
  catalogue: typeof catalogue;
}
