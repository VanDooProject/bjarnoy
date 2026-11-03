import { createApp, h } from 'vue';
import { detectDeviceLocale } from '../i18n/locale';
import { readPersistedSettlementId } from '../lib/persistedPlayer';
import { motionPreferences } from '../lib/perf/motionPreferences';
import LandingIntro from './LandingIntro.vue';
import { introSignal } from './introSignal';

/**
 * Whether the landing intro plays: only on the landing page, `#no-intro` never (specs and players opt out),
 * `#intro` always, otherwise only on a device that has not founded a settlement yet.
 */
export function shouldStartLandingIntro(pathname: string, hash: string, persistedSettlementId: string | null): boolean {
  if (pathname !== '/') return false;
  if (hash === '#no-intro') return false;
  if (hash === '#intro') return true;
  return persistedSettlementId === null;
}

/** Called by boot.ts before the main app loads; mounts the intro on its own root next to `#app`. */
export function startLandingIntro(): void {
  const { pathname, hash, search } = window.location;
  const start = shouldStartLandingIntro(pathname, hash, readPersistedSettlementId());
  // The flags are for this entry only; the router must not see them.
  if (hash === '#intro' || hash === '#no-intro') history.replaceState(history.state, '', pathname + search);
  if (!start) return;

  const host = document.createElement('div');
  host.id = 'landing-intro';
  document.body.appendChild(host);
  const app = createApp({
    render: () =>
      h(LandingIntro, {
        mode: 'landing',
        locale: detectDeviceLocale(),
        reducedMotion: !motionPreferences.hudEnabled,
        loaded: introSignal.tilesLoaded,
        onDone: () => {
          app.unmount();
          host.remove();
        },
      }),
  });
  app.mount(host);
}
