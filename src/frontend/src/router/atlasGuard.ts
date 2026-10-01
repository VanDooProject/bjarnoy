// Docs pages look their art up synchronously (findAtlasFrame & co.), mostly
// inside computeds and templates that re-run on `atlasManifestVersion`, so
// they can render right away and fill the art in as the manifests arrive.
// Nothing on those pages loads the map's atlas categories, though, so the
// manifests have to be fetched from here.
//
// `atlas.ts` is imported lazily: it pulls Pixi in, which must stay out of the
// entry chunk.

const loadAtlas = () => import('../lib/map/atlas');

/** Starts fetching every manifest, in priority order, without holding the navigation back. A failure only degrades the art to its PNG fallbacks. */
export function startAtlasManifestLoad(
  preload: () => Promise<void> = () => loadAtlas().then((m) => m.preloadAtlasManifests()),
): true {
  preload().catch((err) => console.warn('Atlas manifests failed to load; art on this page may be missing', err));
  return true;
}

/**
 * For the docs pages that build their initial state from the showcase art at
 * setup (which camps get a card and the rotation each starts on, a bog
 * building's top level): waits for the showcase manifests only, then starts
 * the rest without waiting. A failure still lets the navigation through.
 */
export async function awaitShowcaseManifests(
  preloadShowcase: () => Promise<void> = () => loadAtlas().then((m) => m.preloadShowcaseManifests()),
  startRest: () => true = () => startAtlasManifestLoad(),
): Promise<true> {
  try {
    await preloadShowcase();
  } catch (err) {
    console.warn('Showcase manifests failed to load; art on this page may be missing', err);
  }
  return startRest();
}
