// Docs pages look their art up synchronously (findAtlasFrame & co.) inside
// computeds and templates, which re-run on `atlasManifestVersion` — so they
// can render right away and fill the art in as the manifests arrive. But
// nothing on those pages loads the map's atlas categories, so the manifests
// would never be fetched: this starts that fetch, in priority order, without
// holding the navigation back. A failure only degrades the art to its PNG
// fallbacks.
//
// `atlas.ts` is imported lazily: it pulls Pixi in, which must stay out of the
// entry chunk.
export function startAtlasManifestLoad(
  preload: () => Promise<void> = () => import('../lib/map/atlas').then((m) => m.preloadAtlasManifests()),
): true {
  preload().catch((err) => console.warn('Atlas manifests failed to load; art on this page may be missing', err));
  return true;
}
