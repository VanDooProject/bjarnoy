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
import simulator from './locales/en/simulator.json';
import docs from './locales/en/docs.json';
import adminActivityChart from './locales/en/adminActivityChart.json';
import adminActivity from './locales/en/adminActivity.json';
import adminLayout from './locales/en/adminLayout.json';
import adminReports from './locales/en/adminReports.json';
import adminSettlements from './locales/en/adminSettlements.json';
import adminUsers from './locales/en/adminUsers.json';
import adminWorldReseed from './locales/en/adminWorldReseed.json';
import adminWorlds from './locales/en/adminWorlds.json';
import armyEditor from './locales/en/armyEditor.json';
import garrisonForm from './locales/en/garrisonForm.json';
import grantResourcesForm from './locales/en/grantResourcesForm.json';
import settlementLayoutEditor from './locales/en/settlementLayoutEditor.json';

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
  simulator: typeof simulator;
  docs: typeof docs;
  // Admin surface (en-only — German is deliberately deferred here; see
  // fallbackLocale in index.ts and the skip clause in src/test/i18n.ts).
  adminActivityChart: typeof adminActivityChart;
  adminActivity: typeof adminActivity;
  adminLayout: typeof adminLayout;
  adminReports: typeof adminReports;
  adminSettlements: typeof adminSettlements;
  adminUsers: typeof adminUsers;
  adminWorldReseed: typeof adminWorldReseed;
  adminWorlds: typeof adminWorlds;
  armyEditor: typeof armyEditor;
  garrisonForm: typeof garrisonForm;
  grantResourcesForm: typeof grantResourcesForm;
  settlementLayoutEditor: typeof settlementLayoutEditor;
}
