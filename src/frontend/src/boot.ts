// The one entry module: light on purpose, so the landing intro paints before the main app
// (pinia, router, vue-i18n, Pixi) is downloaded. Everything else lives in main.ts.
import { buildIdFromEntryUrl, setOwnBuildId } from './lib/buildId';
import { startLandingIntro } from './intro/startLandingIntro';

// In production this module is the entry chunk, `/assets/index-<hash>.js`: the build id the API sends as X-App-Build.
setOwnBuildId(buildIdFromEntryUrl(import.meta.url));
startLandingIntro();
void import('./main');
