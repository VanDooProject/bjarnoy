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

// Ring menu state. Each open level (root -> build-categories -> a
// category's building list) is its own entry on `ringStack`, rendered as a
// separate, wider RingMenu — concentric rings moving outward — rather than
// one ring replacing another, per the issue's "build (which opens another
// ring outside with available buildings on this spot, on grass it should
// have multiple build categories/entries and real buildings in outer ring
// each)".
type RingLevel = 'root' | 'build-categories' | 'build-buildings';
interface OpenRing {
  level: RingLevel;
  category?: string;
  // The angle (degrees) of the specific parent bubble that was hovered/
  // clicked to open this ring — set only when this ring ends up with a
  // single action. A lone bubble has no "spread evenly around the circle"
  // to do, so instead of defaulting to due north it lines up on the same
  // ray as whatever was just hovered, keeping the mouse travel short.
  originAngle?: number;
}
const ringScreen = ref<{ x: number; y: number } | null>(null);
const ringStack = ref<OpenRing[]>([]);
// Matches RingMenu's own default RADIUS — kept in sync there too. The root
// ring only ever has 1-2 actions (see actionsForRing), so shrinking this
// further doesn't risk crowding bubbles into each other the way an outer
// 3-action ring would.
const RING_BASE_RADIUS = 52;
// Bigger than the previous pass (RingMenu's own default is 72px at scale
// 1) — smaller bubbles were wrapping labels like "Watchtower" into an
// awkward mid-word break. The radius/gap values here are pulled in tighter
// to compensate, so the bigger bubbles don't just make the whole thing
// bigger again.
const RING_BUBBLE_SIZES = [72, 62, 54];
// Gap between the outer edge of one ring's bubbles and the inner edge of
// the next, rather than a flat centre-to-centre step — a flat step ignores
// how much smaller the outer bubbles are, and ends up wasting space the
// further out you go.
const RING_GAP = 6;

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
  // suppressClick: this same gesture already closed the ring — a stationary
  // release shouldn't also be treated as a map click that opens a new one
  // (issue #16: "click somewhere else on the map should close the ring
  // first", not close-and-immediately-reopen).
  canvasRef.value?.renderer?.beginDragFrom(e, { suppressClick: true });
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

function actionsForRing(tile: Tile, ring: OpenRing): RingAction[] {
  if (ring.level === 'build-categories') {
    return categoriesFor(tile).map((cat) => ({ id: cat.id, label: cat.label }));
  }
  if (ring.level === 'build-buildings') {
    const category = categoriesFor(tile).find((c) => c.id === ring.category);
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
}

const ringsToRender = computed(() => {
  const tile = selectedTile.value;
  if (!tile) return [];

  // Ring 0's actual on-screen radius is bigger than RING_BASE_RADIUS when
  // it's carrying the "upgrade" badge (see RingMenu's own effectiveRadius)
  // — later rings' gap math needs to start from that real edge, not the
  // bare base radius, or ring 1 would crowd the badge.
  const ring0Effective = RING_BASE_RADIUS + (ringBadge.value ? 20 : 0);
  let radius = ring0Effective;
  let angleOffset = 0;

  return ringStack.value.map((ring, i) => {
    const actions = actionsForRing(tile, ring);
    const bubbleSize = RING_BUBBLE_SIZES[Math.min(i, RING_BUBBLE_SIZES.length - 1)];
    if (i > 0) {
      const prevBubbleSize = RING_BUBBLE_SIZES[Math.min(i - 1, RING_BUBBLE_SIZES.length - 1)];
      radius += prevBubbleSize / 2 + RING_GAP + bubbleSize / 2;
    }
    // A ring with exactly one action has nothing to "spread evenly" — snap
    // it onto the same ray as whichever parent bubble was hovered/clicked
    // to open it (see `originAngle`/`nextRingFrom`) rather than defaulting
    // to due north, so the pointer barely has to move to reach it.
    const thisAngleOffset =
      actions.length === 1 && ring.originAngle !== undefined ? ring.originAngle + 90 : angleOffset;
    const entry = {
      ring,
      actions,
      radius: i === 0 ? RING_BASE_RADIUS : radius,
      angleOffset: thisAngleOffset,
      bubbleScale: bubbleSize / RING_BUBBLE_SIZES[0],
      depth: i,
    };
    // Stagger the next ring by half of *this* ring's own angular spacing,
    // so its bubbles land in the gaps between this ring's bubbles instead
    // of lining up radially with them (a "bullseye" look otherwise).
    angleOffset += 180 / Math.max(1, actions.length);
    return entry;
  });
});

// Mirrors RingMenu's own positioning formula (minus radius) so a parent
// bubble's on-screen angle can be computed here, without RingMenu having to
// report it back up. Keep in sync with RingMenu.vue's `positioned` computed.
function angleForIndex(n: number, index: number, hasBadge: boolean, ringAngleOffset: number): number {
  const angleStep = 360 / Math.max(1, n);
  const rotationOffset = (n === 4 ? 45 : hasBadge ? -90 + angleStep / 2 : -90) + ringAngleOffset;
  return angleStep * index + rotationOffset;
}

// Builds the next ring to push onto the stack, carrying the hovered/
// clicked parent bubble's angle along so a single-action child ring (see
// `originAngle` above) can align to it instead of defaulting to north.
function nextRingFrom(i: number, id: string, level: RingLevel, category?: string): OpenRing {
  const parent = ringsToRender.value[i];
  const idx = parent.actions.findIndex((a) => a.id === id);
  const hasBadge = i === 0 && !!ringBadge.value;
  const originAngle = idx >= 0 ? angleForIndex(parent.actions.length, idx, hasBadge, parent.angleOffset) : undefined;
  return { level, category, originAngle };
}

// The badge belongs to the root ring, which is always the innermost ring
// (index 0) for as long as any ring is open — it doesn't get replaced when
// drilling into build-categories/build-buildings, so this doesn't need to
// track which ring is currently "on top".
const ringOpen = computed(() => !!(selectedTile.value && ringScreen.value));

const ringBadge = computed(() => {
  const tile = selectedTile.value;
  if (!isMineTile.value || !tile?.buildingType) return undefined;
  return { id: 'upgrade', label: `Lv ${tile.buildingLevel ?? 1}`, sublabel: 'upgrade' };
});

function onHexClick(coord: AxialCoord, tile: Tile, screen: { x: number; y: number }) {
  hoverInfo.value = null;
  selectedCoord.value = coord;
  selectedTile.value = tile;
  ringScreen.value = screen;
  ringStack.value = [{ level: 'root' }];
}

function closeRing() {
  selectedCoord.value = null;
  selectedTile.value = null;
  ringScreen.value = null;
  ringStack.value = [];
}

// Issue #16 "build (which opens another ring outside with available
// buildings on this spot)": drilling into the build-category/build-building
// rings happens on hover, not click — only these two transitions (the root
// "build" action, and picking a category) advance the ring; every other
// action (info/details/upgrade/raze/attack/the final building choice) still
// needs an actual click, since those either mutate state or are terminal.
// Hovering pushes a new, wider ring onto the stack (concentric rings moving
// outward) rather than replacing the current one — but only from the
// outermost/most-recently-opened ring: hovering an inner ring's bubble
// again (it's still visible and clickable) shouldn't push a duplicate.
function onRingHover(i: number, id: string) {
  if (i !== ringStack.value.length - 1) return;
  const top = ringStack.value[i];
  if (top.level === 'root' && id === 'build') {
    ringStack.value = [...ringStack.value, nextRingFrom(i, id, 'build-categories')];
    return;
  }
  if (top.level === 'build-categories') {
    const category = categoriesFor(selectedTile.value!).find((c) => c.id === id);
    if (category) {
      ringStack.value = [...ringStack.value, nextRingFrom(i, id, 'build-buildings', id)];
    }
  }
}

async function onRingSelect(i: number, id: string) {
  const ring = ringStack.value[i];
  if (ring.level === 'build-categories') {
    ringStack.value = [...ringStack.value.slice(0, i + 1), nextRingFrom(i, id, 'build-buildings', id)];
    return;
  }
  if (ring.level === 'build-buildings') {
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
      ringStack.value = [...ringStack.value.slice(0, i + 1), nextRingFrom(i, id, 'build-categories')];
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
      <ResourceBar :ring-open="ringOpen" />
      <HudNav />
    </TopBar>
    <RealmPanel :ring-open="ringOpen" />
    <BuildQueuePanel @select="onQueueSelect" />
    <HexTooltip v-if="hoverInfo" :info="hoverInfo" />
    <template v-if="selectedTile && ringScreen">
      <RingMenu
        v-for="(entry, i) in ringsToRender"
        :key="`${entry.ring.level}-${i}`"
        :x="ringScreen.x"
        :y="ringScreen.y"
        :radius="entry.radius"
        :backdrop="i === 0"
        :angle-offset="entry.angleOffset"
        :bubble-scale="entry.bubbleScale"
        :depth="entry.depth"
        :actions="entry.actions"
        :badge-action="i === 0 ? ringBadge : undefined"
        @select="(id: string) => onRingSelect(i, id)"
        @hover="(id: string) => onRingHover(i, id)"
        @close="closeRing"
        @outside-pointer-down="onRingOutsidePointerDown"
      />
    </template>
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
