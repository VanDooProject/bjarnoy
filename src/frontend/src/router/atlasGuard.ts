// Docs pages compute their art synchronously at setup (and some memoise it),
// so unlike the in-game views — which re-run on `atlasManifestVersion` — they
// need the atlas manifests to be in before the route renders. A failure only
// degrades those pages to their PNG fallbacks, so navigation is never blocked.
//
// `atlas.ts` is imported lazily: it pulls Pixi in, which must stay out of the
// entry chunk.
export async function awaitAtlasManifests(
  preload: () => Promise<void> = () => import('../lib/map/atlas').then((m) => m.preloadAtlasManifests()),
): Promise<true> {
  try {
    await preload();
  } catch (err) {
    console.warn('Atlas manifests failed to load; art on this page may be missing', err);
  }
  return true;
}
