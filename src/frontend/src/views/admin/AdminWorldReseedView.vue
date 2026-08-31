<script setup lang="ts">
import { computed, markRaw, onMounted, ref, shallowRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import WorldMapCanvas from '../../components/map/WorldMapCanvas.vue';
import { api, ApiError } from '../../api/client';
import { WorldModel } from '../../lib/map/WorldModel';
import type { AdminWorldResponse, WorldSeedPreviewResponse } from '../../api/types';
import type { TileOrientation } from '../../lib/map/types';

// Issue #133: pick a candidate seed, look at the map it produces, and only
// then commit it. Committing regenerates the world's islands, which deletes
// every settlement in it — the backend refuses outright if any of them belong
// to a real player other than this admin, so the confirmation below guards
// against fat fingers, not against destroying someone else's game.
const route = useRoute();
const router = useRouter();

const worldId = computed(() => String(route.params.worldId ?? ''));
const world = ref<AdminWorldResponse | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

const seedInput = ref('');
const preview = ref<WorldSeedPreviewResponse | null>(null);
// Outside Vue's reactivity for the same reason stores/world.ts keeps its own
// model out of it: the renderer reads this every frame.
const previewModel = shallowRef<WorldModel | null>(null);
const previewing = ref(false);
const previewError = ref<string | null>(null);
const fullscreen = ref(false);

const confirmName = ref('');
const committing = ref(false);
const commitError = ref<string | null>(null);
const committed = ref<{ seed: number; islandCount: number; deletedSettlements: number } | null>(null);

/** A seed the backend will accept: a non-negative signed-32-bit integer. */
function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function randomizeSeed() {
  seedInput.value = String(randomSeed());
}

const parsedSeed = computed(() => {
  const value = Number(seedInput.value);
  return Number.isInteger(value) ? value : null;
});

const nameMatches = computed(
  () => world.value !== null && confirmName.value.trim() === world.value.name,
);

// Only a seed that has actually been looked at may be committed — the whole
// point of the preview is that nobody reseeds a map sight-unseen.
const canCommit = computed(
  () => preview.value !== null && parsedSeed.value === preview.value.seed && nameMatches.value,
);

onMounted(async () => {
  try {
    // There is no single-world admin GET; the list is the admin world source
    // everywhere else in this section too (see stores/adminWorld.ts).
    const worlds = await api.adminListWorlds();
    world.value = worlds.find((w) => w.id === worldId.value) ?? null;
    if (!world.value) loadError.value = 'No such world.';
  } catch {
    loadError.value = 'Could not load the world.';
  } finally {
    loading.value = false;
  }
  randomizeSeed();
});

async function runPreview() {
  if (previewing.value) return;
  const seed = parsedSeed.value;
  if (seed === null) {
    previewError.value = 'A seed must be a whole number.';
    return;
  }

  previewing.value = true;
  previewError.value = null;
  try {
    const result = await api.adminPreviewWorldSeed(worldId.value, { seed });
    preview.value = result;
    previewModel.value = markRaw(buildPreviewModel(result));
  } catch (err) {
    previewError.value = err instanceof ApiError ? err.message : 'Could not generate a preview.';
    preview.value = null;
    previewModel.value = null;
  } finally {
    previewing.value = false;
  }
}

/**
 * The throwaway `WorldModel` the preview renders from. Terrain itself is not
 * in the response and does not need to be: `worldGenerator.ts` derives it from
 * the seed exactly as the backend's `TerrainSampler` does, so only the islands
 * and rivers — which no client can derive — come over the wire. Islands have
 * no id here (nothing was persisted), so their index stands in as a label key.
 */
function buildPreviewModel(result: WorldSeedPreviewResponse): WorldModel {
  const model = new WorldModel(result.seed);
  model.setIslands(
    result.islands.map((island) => ({
      id: `preview-${island.index}`,
      name: island.name,
      q: island.q,
      r: island.r,
    })),
  );
  model.setRiverTiles(
    result.islands.flatMap((island) =>
      island.riverTiles.map((tile) => ({
        q: tile.q,
        r: tile.r,
        shape: tile.shape,
        inDirections: tile.inDirections as TileOrientation[],
        outDirection: tile.outDirection as TileOrientation | null,
      })),
    ),
  );
  return model;
}

async function commit() {
  if (!world.value || !preview.value || committing.value || !canCommit.value) return;

  // Same window.confirm() pattern as AdminWorldsView's run-state actions, but
  // behind the re-typed world name above: unlike a pause, this one cannot be
  // undone by clicking the opposite button.
  const message =
    `Reseed "${world.value.name}" to seed ${preview.value.seed}?\n\n` +
    `This deletes every settlement in the world (${world.value.playerCount} today) ` +
    'and cannot be undone.';
  if (!window.confirm(message)) return;

  committing.value = true;
  commitError.value = null;
  try {
    const result = await api.adminReseedWorld(worldId.value, {
      confirmWorldName: confirmName.value.trim(),
      seed: preview.value.seed,
    });
    world.value = result.world;
    committed.value = {
      seed: result.seed,
      islandCount: result.islandCount,
      deletedSettlements: result.deletedSettlements,
    };
    confirmName.value = '';
  } catch (err) {
    commitError.value = err instanceof ApiError ? err.message : 'Could not reseed the world.';
  } finally {
    committing.value = false;
  }
}

function back() {
  void router.push('/admin/worlds');
}
</script>

<template>
  <div class="reseed">
    <p v-if="loading">Loading…</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>

    <template v-else-if="world">
      <header class="head">
        <h1>Reseed “{{ world.name }}”</h1>
        <button class="secondary" @click="back">Back to worlds</button>
      </header>

      <p class="warning">
        Regenerating this map replaces its islands, so every settlement in the world is deleted with them
        ({{ world.playerCount }} today). Worlds holding another player's settlement are refused outright.
      </p>

      <section class="panel">
        <div class="controls">
          <label for="seed">Seed</label>
          <input id="seed" v-model="seedInput" type="number" step="1" />
          <button class="secondary" @click="randomizeSeed">Randomize</button>
          <button :disabled="previewing" @click="runPreview">
            {{ previewing ? 'Generating…' : 'Preview seed' }}
          </button>
        </div>

        <p v-if="previewError" class="error">{{ previewError }}</p>
        <p v-else-if="preview" class="summary" data-testid="preview-summary">
          Seed {{ preview.seed }}: {{ preview.islandCount }} islands, {{ preview.landTileCount }} land hexes.
          Nothing has been saved yet.
        </p>
      </section>

      <section v-if="previewModel" class="map-panel" :class="{ fullscreen }">
        <WorldMapCanvas :world-model="previewModel" player-id="admin-preview" />
        <button class="expand" @click="fullscreen = !fullscreen">
          {{ fullscreen ? 'Exit full screen' : 'Full screen' }}
        </button>
      </section>

      <section v-if="preview" class="panel danger">
        <h2>Commit this map</h2>
        <p>
          Type the world's name (<code>{{ world.name }}</code
          >) to confirm.
        </p>
        <div class="controls">
          <label for="confirm-name">World name</label>
          <input id="confirm-name" v-model="confirmName" type="text" autocomplete="off" />
          <button class="destructive" :disabled="!canCommit || committing" @click="commit">
            {{ committing ? 'Reseeding…' : 'Reseed world' }}
          </button>
        </div>
        <p v-if="commitError" class="error">{{ commitError }}</p>
        <p v-if="committed" class="done" data-testid="reseed-done">
          Reseeded to seed {{ committed.seed }}: {{ committed.islandCount }} islands,
          {{ committed.deletedSettlements }} settlement(s) deleted.
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.reseed h1 {
  margin: 0 0 16px;
}
.warning {
  color: var(--rival);
  font-size: 14px;
  max-width: 70ch;
}
.panel {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.panel h2 {
  margin: 0 0 8px;
  font-size: 16px;
}
.panel.danger {
  border-color: var(--rival);
}
.controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.controls label {
  font-size: 13px;
  color: var(--muted);
}
.summary {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--muted);
}
.done {
  font-size: 13px;
}
.error {
  color: var(--rival);
  font-size: 13px;
}
/* WorldMapCanvas's own container is absolutely positioned to its parent's
   box, so the preview needs a sized, positioned frame to fill. */
.map-panel {
  position: relative;
  height: max(420px, calc(100vh - 420px));
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 16px;
}
.map-panel.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 50;
  height: auto;
  border-radius: 0;
  margin: 0;
}
.expand {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
}
button {
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
}
button.secondary {
  background: none;
  border: 1px solid var(--panel-border);
  color: var(--text);
}
button.destructive {
  background: var(--rival);
  color: #fff;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
