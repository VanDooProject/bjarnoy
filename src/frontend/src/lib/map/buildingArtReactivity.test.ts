import { describe, expect, it } from 'vitest';
import { computed } from 'vue';
import { buildingArt, terrainArt } from './buildingArt';
import { registerAtlasManifestsForTests, unregisterAtlasManifestsForTests } from './atlasManifests';

// Docs pages render before the (lazily fetched) atlas manifests arrive and
// rely on this: an art lookup inside a computed falls back to the PNG while
// the showcase manifests are missing and switches to the atlas frame once
// they land, with no remount.
describe('art lookups follow the lazily loaded manifests', () => {
  it('a computed over terrainArt/buildingArt switches from the PNG fallback to atlas art', () => {
    const removed = unregisterAtlasManifestsForTests('showcase');
    try {
      const grass = computed(() => terrainArt('grass').kind);
      const barracks = computed(() => buildingArt('barracks', 3)?.kind);
      expect(grass.value).toBe('png');
      expect(barracks.value).toBe('png');

      registerAtlasManifestsForTests(removed);
      expect(grass.value).toBe('atlas');
      expect(barracks.value).toBe('atlas');
    } finally {
      registerAtlasManifestsForTests(removed);
    }
  });
});
