/// <reference types="node" />
// Vitest setup: the atlas manifests are fetched lazily in the app, but node
// tests that look art up against the real vendored atlas (textures.test.ts,
// wastedIsland.test.ts, ...) expect it to be there synchronously — so read
// every vendored manifest from disk and register it in the store, the same
// state the app is in once `loadAtlasManifests` has run for every category.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerAtlasManifestsForTests } from '../lib/map/atlasManifests';
import type { AtlasManifest } from '../lib/map/atlas';

// vitest runs from the frontend root (see vitest.config.ts).
const dir = join(process.cwd(), 'vendor/bg_assets_hextile/atlas/');
const manifests: Record<string, AtlasManifest> = {};
try {
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.json')) manifests[file] = JSON.parse(readFileSync(join(dir, file), 'utf8')) as AtlasManifest;
  }
} catch {
  // Vendored art not checked out: nothing to register, tests that need it fail on their own.
}
registerAtlasManifestsForTests(manifests);
