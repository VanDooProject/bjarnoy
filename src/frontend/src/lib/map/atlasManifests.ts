// The lazily fetched half of atlas.ts: the atlas pages' JSON manifests.
//
// The manifests are ~10 MB of raw JSON, so they are NOT bundled any more —
// the glob below only resolves each file to an emitted asset URL. A manifest
// is fetched (`loadAtlasManifests`) the first time something needs its
// category and then lives in `MANIFESTS` for good; `atlasManifestVersion` is
// bumped after every batch lands so Vue computeds/templates that did a
// synchronous lookup (`findAtlasFrame`/`findAtlasClip` — see atlas.ts) while
// the category was still missing re-run once it is there.
//
// Kept in its own module, free of any Pixi import, so the vitest setup file
// can register the on-disk manifests before a test file's `vi.mock('pixi.js')`
// gets a say about how atlas.ts itself loads.
import { shallowRef } from 'vue';
import type { AtlasManifest } from './atlas';

const ATLAS_JSON_URLS = import.meta.glob('../../../vendor/bg_assets_hextile/atlas/*.json', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const PAGE_NAME_RE = /\/([a-z0-9-]+)-(\d+)\.json$/;

/** Every manifest fetched so far, keyed by its glob path (same keys as `ATLAS_JSON_URLS`). */
export const MANIFESTS: Record<string, AtlasManifest> = {};

/** Bumped after every batch of manifests is stored — read it inside a computed to depend on "more atlas data arrived". */
export const atlasManifestVersion = shallowRef(0);

export interface DiscoveredPage {
  category: string;
  page: number;
  /** The manifest's glob path — the key into `MANIFESTS` and `ATLAS_WEBP`'s sibling (`.webp`) key. */
  path: string;
  jsonUrl: string;
}

const discovered: DiscoveredPage[] = [];
for (const [path, jsonUrl] of Object.entries(ATLAS_JSON_URLS)) {
  const match = PAGE_NAME_RE.exec(path);
  if (match) discovered.push({ category: match[1], page: Number(match[2]), path, jsonUrl });
}
discovered.sort((a, b) => (a.category === b.category ? a.page - b.page : a.category < b.category ? -1 : 1));

/** Every page of `category` known from the glob (loaded or not), ascending page number. */
export function discoveredPages(category: string): DiscoveredPage[] {
  return discovered.filter((p) => p.category === category);
}

/** Every category that has at least one page, sorted by name. */
export function discoveredCategories(): string[] {
  return [...new Set(discovered.map((p) => p.category))];
}

const manifestLoads = new Map<string, Promise<void>>();

/**
 * Fetches every page manifest of `category` in parallel and stores them,
 * bumping `atlasManifestVersion` once the whole batch is in. Cached per
 * category (a rejected load is evicted so a retry fetches again); a category
 * with nothing left to fetch resolves immediately.
 */
export function loadAtlasManifests(category: string): Promise<void> {
  const cached = manifestLoads.get(category);
  if (cached) return cached;

  const missing = discoveredPages(category).filter((p) => !(p.path in MANIFESTS));
  if (missing.length === 0) return Promise.resolve();

  const promise = Promise.all(
    missing.map(async (p) => {
      const res = await fetch(p.jsonUrl);
      if (!res.ok) throw new Error(`atlas: failed to fetch manifest "${p.jsonUrl}" (${res.status})`);
      return [p.path, (await res.json()) as AtlasManifest] as const;
    }),
  ).then((entries) => {
    for (const [path, manifest] of entries) MANIFESTS[path] = manifest;
    atlasManifestVersion.value++;
  });

  manifestLoads.set(category, promise);
  promise.catch(() => {
    if (manifestLoads.get(category) === promise) manifestLoads.delete(category);
  });
  return promise;
}

function pathForFile(fileName: string): string | undefined {
  return discovered.find((p) => p.path.endsWith(`/${fileName}`))?.path;
}

/**
 * Test hook (vitest setup + tests): stores manifests keyed by file name
 * (`terrain-0.json`) as if they had been fetched. Unknown file names are
 * ignored — they would have no URL to be discovered from.
 */
export function registerAtlasManifestsForTests(byFileName: Record<string, AtlasManifest>): void {
  for (const [fileName, manifest] of Object.entries(byFileName)) {
    const path = pathForFile(fileName);
    if (path) MANIFESTS[path] = manifest;
  }
  atlasManifestVersion.value++;
}

/** Test hook: drops a category's stored manifests (and its fetch memo) and returns them, keyed by file name, so a test can restore them afterwards. */
export function unregisterAtlasManifestsForTests(category: string): Record<string, AtlasManifest> {
  const removed: Record<string, AtlasManifest> = {};
  for (const p of discoveredPages(category)) {
    const manifest = MANIFESTS[p.path];
    if (!manifest) continue;
    removed[p.path.slice(p.path.lastIndexOf('/') + 1)] = manifest;
    delete MANIFESTS[p.path];
  }
  manifestLoads.delete(category);
  atlasManifestVersion.value++;
  return removed;
}
