<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import ResourceBar from '../components/hud/ResourceBar.vue';
import RealmPanel from '../components/hud/RealmPanel.vue';
import BuildQueuePanel from '../components/hud/BuildQueuePanel.vue';
import HexTooltip from '../components/hud/HexTooltip.vue';
import BuildingModal from '../components/hud/BuildingModal.vue';
import RingMenu, { type RingAction } from '../components/hud/RingMenu.vue';
import FogDebugPanel from '../components/hud/FogDebugPanel.vue';
import { useWorldStore } from '../stores/world';
import { usePlayerStore } from '../stores/player';
import { DEMO_MODE } from '../config';
import type { AxialCoord } from '../lib/hex/coords';
import type { Tile } from '../lib/map/types';
import type { HoverInfo } from '../lib/map/HexMapRenderer';

const world = useWorldStore();
const player = usePlayerStore();
const route = useRoute();

// ?debug=1 surfaces FogDebugPanel — same idea as window.__fogDebug (main.ts)
// but clickable, and not gated to demo mode: these are pure client-side
// rendering toggles, nothing about game state.
const showFogDebug = computed(() => route.query.debug === '1');
const canvasRef = ref<InstanceType<typeof SettlementCanvas> | null>(null);
function onFogDebugChange() {
  canvasRef.value?.renderer?.forceRebuild();
}

// Issue #16 "status box": "clicking a building in queue should center and
// highlight (some flashes) the tile" — panTo recentres the camera on it,
// and highlightCoord (already a pulsing gold outline HexMapRenderer draws
// every tick — see drawHighlight) is set for a few seconds to read as a
// flash rather than a permanent marker.
let flashTimeout: ReturnType<typeof setTimeout> | null = null;
function onQueueSelect(coord: { q: number; r: number }) {
  const renderer = canvasRef.value?.renderer;
  if (!renderer) return;
  renderer.panTo(coord);
  renderer.setHighlight(coord);
  if (flashTimeout) clearTimeout(flashTimeout);
  flashTimeout = setTimeout(() => {
    renderer.setHighlight(undefined);
    flashTimeout = null;
  }, 2200);
}

onMounted(async () => {
  // A direct load of /settlement (reload, deep link) arrives here before
  // WorldMapView ever mounts, so this view needs its own bootstrap/restore
  // instead of assuming `world.selectedSettlementId` is already set.
  if (!DEMO_MODE && player.hasFoundedSettlement && player.settlementId) {
    await world.restoreLiveSettlement(player.id, player.settlementId);
  }
  world.startHudSync();
});
onUnmounted(() => world.stopHudSync());

const hoverInfo = ref<HoverInfo | null>(null);
function onHover(info: HoverInfo | null) {
  // The renderer's pointer tracking is a window-level listener (see
  // HexMapRenderer's onPointerMove), so it keeps resolving a hex under the
  // cursor even while the ring's own DOM bubbles are what's visually on
  // top — without this guard, the tile tooltip renders over freshly opened
  // ring bubbles (e.g. hovering "Build" to drill into categories).
  if (selectedTile.value && ringScreen.value) return;
  hoverInfo.value = info;
}

// Issue #16 "ring/radial context menu on tile click": replaces the old
// click-always-opens-BuildingModal behaviour. A click now opens a
// RingMenu whose actions depend on the tile's state; "Details"/"Info" is
// what opens BuildingModal now, rather than every click doing so.
const selectedCoord = ref<AxialCoord | null>(null);
const selectedTile = ref<Tile | null>(null);
const modalBusy = ref(false);

const modalMine = computed(
  () => !!selectedTile.value && selectedTile.value.ownerId === world.selectedSettlementId,
);
const modalOwnerLabel = computed(() => {
  const tile = selectedTile.value;
  if (!tile?.ownerId) return null;
  const owner = world.model.getSettlement(tile.ownerId);
  if (!owner) return null;
  return owner.ownerId === player.id ? owner.name : `${owner.ownerName}'s ${owner.name}`;
});

// Ring menu state. `ringLevel` walks root -> build-categories -> a
// category's building list, per the issue's "build (which opens another
// ring outside with available buildings on this spot, on grass it should
// have multiple build categories/entries and real buildings in outer ring
// each)".
type RingLevel = 'root' | 'build-categories' | 'build-buildings';
const ringLevel = ref<RingLevel>('root');
const ringScreen = ref<{ x: number; y: number } | null>(null);
const ringCategory = ref<string | null>(null);

// Issue #16 "ring menu": while any ring is open, its bubbles float on top
// of the canvas, but the renderer's own pointer tracking is window-level
// (see HexMapRenderer's onPointerMove) and doesn't know a menu is up —
// lock out hover/wheel there for as long as a ring is showing.
watch(ringScreen, (screen) => {
  canvasRef.value?.renderer?.setInteractionLocked(!!screen);
});

// A mousedown on the ring's own backdrop (not a bubble) closes the ring and
// hands back the same PointerEvent so the map can start dragging from it
// immediately — otherwise the player would need a second, separate
// mousedown just to start panning after dismissing the ring.
function onRingOutsidePointerDown(e: PointerEvent) {
  closeRing();
  canvasRef.value?.renderer?.beginDragFrom(e);
}

interface BuildCategory {
  id: string;
  label: string;
  buildings: { type: 'hut' | 'farm' | 'tower'; label: string }[];
}
// Grass gets the full spread of categories (housing/resource/defense);
// other buildable terrain only offers one outer ring rather than the same
// multi-category spread — matches the issue calling out grass specifically.
const BUILD_CATEGORIES: Record<'grass' | 'other', BuildCategory[]> = {
  grass: [
    { id: 'housing', label: 'Housing', buildings: [{ type: 'hut', label: 'Hut' }] },
    { id: 'resource', label: 'Resource', buildings: [{ type: 'farm', label: 'Farm' }] },
    { id: 'defense', label: 'Defense', buildings: [{ type: 'tower', label: 'Watchtower' }] },
  ],
  other: [
    {
      id: 'buildings',
      label: 'Build',
      buildings: [
        { type: 'hut', label: 'Hut' },
        { type: 'farm', label: 'Farm' },
        { type: 'tower', label: 'Watchtower' },
      ],
    },
  ],
};

function categoriesFor(tile: Tile): BuildCategory[] {
  return BUILD_CATEGORIES[tile.terrain === 'grass' ? 'grass' : 'other'];
}

const isEnemyTile = computed(
  () => !!selectedTile.value?.ownerId && selectedTile.value.ownerId !== world.selectedSettlementId,
);
const isMineTile = computed(
  () => !!selectedTile.value && selectedTile.value.ownerId === world.selectedSettlementId,
);
const isUnclaimedTile = computed(() => !!selectedTile.value && !selectedTile.value.ownerId);

const ringActions = computed<RingAction[]>(() => {
  const tile = selectedTile.value;
  if (!tile) return [];

  if (ringLevel.value === 'build-categories') {
    return categoriesFor(tile).map((cat) => ({ id: cat.id, label: cat.label }));
  }
  if (ringLevel.value === 'build-buildings') {
    const category = categoriesFor(tile).find((c) => c.id === ringCategory.value);
    return (category?.buildings ?? []).map((b) => ({ id: b.type, label: b.label }));
  }

  // root level
  if (isEnemyTile.value) {
    return [
      { id: 'info', label: 'Info' },
      { id: 'attack', label: 'Attack / Raid', disabled: true, hint: 'Combat is not implemented yet' },
    ];
  }
  if (isUnclaimedTile.value) {
    const onCoast = tile.terrain === 'sand';
    return [
      { id: 'info', label: 'Info' },
      {
        id: onCoast ? 'land-here' : 'send-settlers',
        label: onCoast ? 'Land here' : 'Send settlers',
        disabled: true,
        hint: 'You have no settlers available yet',
      },
    ];
  }
  if (isMineTile.value && tile.buildingType) {
    // "Upgrade" isn't one of the dark ring bubbles here — the reference
    // shows the "Lv n / upgrade" badge above the ring *as* the upgrade
    // control, so it's wired as `ringBadge` below instead of duplicated in
    // this list.
    const actions: RingAction[] = [
      {
        id: 'raze',
        label: 'Raze',
        disabled: tile.buildingType === 'longhouse' || !DEMO_MODE,
        hint: tile.buildingType === 'longhouse' ? "Can't raze the longhouse" : 'Not wired to the backend yet',
      },
      { id: 'details', label: 'Details' },
    ];
    // Building-specific actions (train/research): none of today's building
    // types (hut/farm/tower/longhouse) expose one yet, so nothing is added
    // here — the branch exists so a future barracks/academy building type
    // has somewhere to plug in without restructuring the ring.
    return actions;
  }
  if (isMineTile.value) {
    return [
      { id: 'details', label: 'Details' },
      { id: 'build', label: 'Build', disabled: tile.terrain === 'sea', hint: 'Open water' },
    ];
  }
  return [{ id: 'details', label: 'Details' }];
});

const ringBadge = computed(() => {
  const tile = selectedTile.value;
  if (ringLevel.value !== 'root' || !isMineTile.value || !tile?.buildingType) return undefined;
  return { id: 'upgrade', label: `Lv ${tile.buildingLevel ?? 1}`, sublabel: 'upgrade' };
});

function onHexClick(coord: AxialCoord, tile: Tile, screen: { x: number; y: number }) {
  hoverInfo.value = null;
  selectedCoord.value = coord;
  selectedTile.value = tile;
  ringScreen.value = screen;
  ringLevel.value = 'root';
  ringCategory.value = null;
}

function closeRing() {
  selectedCoord.value = null;
  selectedTile.value = null;
  ringScreen.value = null;
  ringLevel.value = 'root';
  ringCategory.value = null;
}

// Issue #16 "build (which opens another ring outside with available
// buildings on this spot)": drilling into the build-category/build-building
// rings happens on hover, not click — only these two transitions (the root
// "build" action, and picking a category) advance the ring; every other
// action (info/details/upgrade/raze/attack/the final building choice) still
// needs an actual click, since those either mutate state or are terminal.
function onRingHover(id: string) {
  if (ringLevel.value === 'root' && id === 'build') {
    ringLevel.value = 'build-categories';
    return;
  }
  if (ringLevel.value === 'build-categories') {
    const category = categoriesFor(selectedTile.value!).find((c) => c.id === id);
    if (category) {
      ringCategory.value = id;
      ringLevel.value = 'build-buildings';
    }
  }
}

async function onRingSelect(id: string) {
  if (ringLevel.value === 'build-categories') {
    ringCategory.value = id;
    ringLevel.value = 'build-buildings';
    return;
  }
  if (ringLevel.value === 'build-buildings') {
    await buildType(id as 'hut' | 'farm' | 'tower');
    closeRing();
    return;
  }
  switch (id) {
    case 'details':
    case 'info':
      // Falls through to BuildingModal below, ring stays "open" only long
      // enough for the modal to take over the same selectedTile.
      ringScreen.value = null;
      return;
    case 'build':
      ringLevel.value = 'build-categories';
      return;
    case 'upgrade':
      await upgrade();
      closeRing();
      return;
    case 'raze':
      if (world.selectedSettlementId && selectedCoord.value) {
        world.model.razeBuilding(world.selectedSettlementId, selectedCoord.value);
      }
      closeRing();
      return;
    default:
      return;
  }
}

function closeModal() {
  closeRing();
  modalBusy.value = false;
}

// Demo mode places the chosen building instantly; live mode queues a real
// farm against the backend regardless of which type the ring's build-ring
// picked (there is no "hut"/"tower" in the backend's catalogue yet — see
// BuildingType.cs) and waits for the build order to complete.
async function buildType(type: 'hut' | 'farm' | 'tower') {
  if (!world.selectedSettlementId || !selectedCoord.value) return;
  if (DEMO_MODE) {
    world.model.placeBuilding(world.selectedSettlementId, selectedCoord.value, type);
    return;
  }
  modalBusy.value = true;
  try {
    await world.queueBuildLive('farm', selectedCoord.value);
  } catch (err) {
    console.error('Failed to queue building against the backend', err);
  } finally {
    modalBusy.value = false;
  }
}

// BuildingModal's own "Build here" button (opened via the ring's
// Details/Info action on an empty tile) has no category/type picker of its
// own, so it keeps the previous default of a hut.
async function build() {
  await buildType('hut');
  closeModal();
}

async function upgrade() {
  if (!world.selectedSettlementId || !selectedCoord.value || !selectedTile.value?.buildingType) return;
  if (DEMO_MODE) {
    const tile = world.model.getTile(selectedCoord.value.q, selectedCoord.value.r);
    tile.buildingLevel = (selectedTile.value.buildingLevel ?? 1) + 1;
    closeModal();
    return;
  }
  modalBusy.value = true;
  try {
    await world.queueBuildLive(selectedTile.value.buildingType, selectedCoord.value);
    closeModal();
  } catch (err) {
    console.error('Failed to queue upgrade against the backend', err);
    modalBusy.value = false;
  }
}
</script>

<template>
  <div class="settlement">
    <SettlementCanvas
      v-if="world.selectedSettlementId"
      ref="canvasRef"
      :world-model="world.model"
      :player-id="player.id"
      :settlement-id="world.selectedSettlementId"
      @hex-click="onHexClick"
      @hover="onHover"
    />
    <FogDebugPanel v-if="showFogDebug" @change="onFogDebugChange" />
    <!-- The white unexplored-fog fill (HexMapRenderer's FOG_UNEXPLORED) is
         much lighter than the old backdrop this HUD chrome was designed
         against, and can sit right behind the top bar depending on where
         the camera starts — this scrim (matching Viking Realm.dc.html's own
         top-bar gradient) keeps the logo/resources/nav readable regardless
         of what's under them. -->
    <div class="hud-scrim" />
    <TopBar>
      <ResourceBar />
      <HudNav />
    </TopBar>
    <RealmPanel />
    <BuildQueuePanel @select="onQueueSelect" />
    <HexTooltip v-if="hoverInfo" :info="hoverInfo" />
    <RingMenu
      v-if="selectedTile && ringScreen"
      :x="ringScreen.x"
      :y="ringScreen.y"
      :actions="ringActions"
      :badge-action="ringBadge"
      @select="onRingSelect"
      @hover="onRingHover"
      @close="closeRing"
      @outside-pointer-down="onRingOutsidePointerDown"
    />
    <BuildingModal
      v-if="selectedTile && !ringScreen"
      :tile="selectedTile"
      :mine="modalMine"
      :owner-label="modalOwnerLabel"
      :busy="modalBusy"
      @close="closeModal"
      @build="build"
      @upgrade="upgrade"
    />
  </div>
</template>

<style scoped>
.settlement {
  position: relative;
  width: 100vw;
  height: 100vh;
}
.hud-scrim {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 110px;
  z-index: 5;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(7, 15, 20, 0.7) 0%, rgba(7, 15, 20, 0.32) 70%, rgba(7, 15, 20, 0) 100%);
}
</style>
