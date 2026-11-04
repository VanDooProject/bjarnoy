import { createApp, h, nextTick } from 'vue';
import { detectDeviceLocale } from '../i18n/locale';
import { readPersistedSettlementId } from '../lib/persistedPlayer';
import { motionPreferences } from '../lib/perf/motionPreferences';
import LandingIntro from './LandingIntro.vue';
import { BEATS } from './beats/registry';
import { introSignal } from './introSignal';
import { parseLoopAnchor } from './loopAnchor';
import type { BeatId } from './beats/types';

/**
 * Whether the landing intro plays: only on the landing page, `#no-intro` never (specs and players opt out),
 * `#intro` and `#loop` (see loopAnchor.ts) always, otherwise only on a device that has not founded a settlement yet.
 */
export function shouldStartLandingIntro(pathname: string, hash: string, persistedSettlementId: string | null): boolean {
  if (pathname !== '/') return false;
  if (hash === '#no-intro') return false;
  if (hash === '#intro' || parseLoopAnchor(hash, BEATS) !== null) return true;
  return persistedSettlementId === null;
}

/** Called by boot.ts before the main app loads; mounts the intro on its own root next to `#app`. */
export function startLandingIntro(): void {
  const { pathname, hash, search } = window.location;
  const start = shouldStartLandingIntro(pathname, hash, readPersistedSettlementId());
  // The flags are for this entry only; the router must not see them.
  const loopBeats = parseLoopAnchor(hash, BEATS);
  if (hash === '#intro' || hash === '#no-intro' || loopBeats !== null) history.replaceState(history.state, '', pathname + search);
  if (!start) return;

  mountLandingIntro({ loopBeats });
}

/** Mounts the intro on its own root next to `#app` and unmounts it again on `done` or Esc. */
export function mountLandingIntro(options: { loopBeats?: BeatId[] | null } = {}): void {
  const loopBeats = options.loopBeats ?? null;
  const host = document.createElement('div');
  host.id = 'landing-intro';
  document.body.appendChild(host);
  // After the flush that emitted `done`/`close`: unmounting the app from inside its own render/watch flush
  // re-runs the root's render effect on a torn-down tree.
  const unmount = () =>
    void nextTick(() => {
      app.unmount();
      host.remove();
    });
  const app = createApp({
    render: () =>
      h(LandingIntro, {
        mode: loopBeats ? 'loop' : 'landing',
        loopBeats: loopBeats ?? undefined,
        locale: detectDeviceLocale(),
        reducedMotion: !motionPreferences.hudEnabled,
        loaded: introSignal.tilesLoaded,
        onDone: unmount,
        onClose: unmount,
      }),
  });
  app.mount(host);
}
