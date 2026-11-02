/**
 * After a deploy an open tab still runs the old bundle and its lazy route
 * chunks (`/assets/MapView-<hash>.js`) are gone. The way out is a full page
 * load into the new build; this module owns that decision.
 */

const RELOAD_KEY = 'bjarnoy.updateReload';
/** The same target is not hard-loaded twice within this window (reload loop guard). */
const RELOAD_LOOP_WINDOW_MS = 10_000;

let updatePending = false;

export function markUpdatePending(): void {
  updatePending = true;
}

export function isUpdatePending(): boolean {
  return updatePending;
}

/** Test hook: back to "no update seen". */
export function resetAppUpdate(): void {
  updatePending = false;
}

/**
 * True for a failed dynamic `import()` of a route chunk. The message differs
 * per engine: Chrome "Failed to fetch dynamically imported module", Firefox
 * "error loading dynamically imported module", Safari "Importing a module
 * script failed".
 */
export function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return /dynamically imported module|importing a module script failed/i.test(message);
}

function readLastReload(): { target: string; at: number } | null {
  try {
    const raw = globalThis.sessionStorage.getItem(RELOAD_KEY);
    return raw ? (JSON.parse(raw) as { target: string; at: number }) : null;
  } catch {
    return null;
  }
}

function writeLastReload(target: string, at: number): void {
  try {
    globalThis.sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ target, at }));
  } catch {
    // sessionStorage unavailable: the guard is best effort
  }
}

/**
 * Full page load of `target` (a path or URL). Returns false without loading
 * when the same target was already hard-loaded moments ago, so a chunk that is
 * missing in the new build too cannot cause a reload loop.
 */
export function hardLoad(target: string, now: number = Date.now()): boolean {
  const loc = globalThis.location;
  const url = new URL(target, loc.href).href;
  const last = readLastReload();
  if (last && last.target === url && now - last.at < RELOAD_LOOP_WINDOW_MS) {
    console.error(`[appUpdate] not reloading ${url} again, it was just loaded`);
    return false;
  }
  writeLastReload(url, now);
  // assign() to the current URL (hash included) would only be a fragment navigation
  if (url === loc.href) loc.reload();
  else loc.assign(url);
  return true;
}

/** A lazy chunk failed to load: the deployed build changed under this tab. */
export function handleChunkLoadError(err: unknown, target: string): boolean {
  if (!isChunkLoadError(err)) return false;
  markUpdatePending();
  return hardLoad(target);
}

/** Router and `vite:preloadError` wiring; installed once from main.ts. */
export function installChunkErrorHandling(router: {
  onError: (handler: (err: unknown, to: { fullPath: string }) => void) => unknown;
}): void {
  router.onError((err, to) => {
    handleChunkLoadError(err, to.fullPath);
  });
  globalThis.addEventListener('vite:preloadError', () => {
    markUpdatePending();
    hardLoad(globalThis.location.href);
  });
}
