import common from './locales/en/common.json';
import catalogue from './locales/en/catalogue.json';
import landing from './locales/en/landing.json';
import onboarding from './locales/en/onboarding.json';
import demoModeBadge from './locales/en/demoModeBadge.json';
import login from './locales/en/login.json';
import register from './locales/en/register.json';
import accountRestrictedBanner from './locales/en/accountRestrictedBanner.json';
import hud from './locales/en/hud.json';
import apiErrors from './locales/en/apiErrors.json';
import guild from './locales/en/guild.json';
import messages from './locales/en/messages.json';
import profile from './locales/en/profile.json';
import leaderboard from './locales/en/leaderboard.json';
import reports from './locales/en/reports.json';

// English is the source of truth for keys: every other locale is typed
// against its shape, so a missing/misspelled key is a `vue-tsc -b` error.
// New namespace files get merged in here as their extraction PR lands.
export interface MessageSchema {
  common: typeof common;
  catalogue: typeof catalogue;
  landing: typeof landing;
  onboarding: typeof onboarding;
  demoModeBadge: typeof demoModeBadge;
  login: typeof login;
  register: typeof register;
  accountRestrictedBanner: typeof accountRestrictedBanner;
  hud: typeof hud;
  apiErrors: typeof apiErrors;
  guild: typeof guild;
  messages: typeof messages;
  profile: typeof profile;
  leaderboard: typeof leaderboard;
  reports: typeof reports;
}
