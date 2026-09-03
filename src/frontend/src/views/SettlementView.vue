<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import ResourceBar from '../components/hud/ResourceBar.vue';
import RealmPanel from '../components/hud/RealmPanel.vue';
import BuildQueuePanel from '../components/hud/BuildQueuePanel.vue';
import ExpansionPanel from '../components/hud/ExpansionPanel.vue';
import TradePanel from '../components/hud/TradePanel.vue';
import TrainingQueuePanel from '../components/hud/TrainingQueuePanel.vue';
import ArmyPanel from '../components/hud/ArmyPanel.vue';
import HexTooltip from '../components/hud/HexTooltip.vue';
import BuildingModal from '../components/hud/BuildingModal.vue';
import TrainingModal from '../components/hud/TrainingModal.vue';
import RingMenu, { type RingAction, type RingBuilding, type RingCategory } from '../components/hud/RingMenu.vue';
import FogDebugPanel from '../components/hud/FogDebugPanel.vue';
import FogPerfPanel from '../components/hud/FogPerfPanel.vue';
import { useWorldStore } from '../stores/world';
import { ApiError } from '../api/client';
import { usePlayerStore } from '../stores/player';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { DEMO_MODE } from '../config';
import { useFogDebug } from '../composables/useFogDebug';
import { parseKey, type AxialCoord } from '../lib/hex/coords';
import { buildingArt } from '../lib/map/buildingArt';
import { BOOST_TERRAIN, buildingStatsFor, buildingUpgradeCost, matchingNeighbourCount } from '../lib/map/buildingEconomy';
import { formatBuildTime, longhouseLock } from '../lib/map/ringCatalogue';
import type { Tile } from '../lib/map/types';
import type { ArmyOverlayData, ArmyOverlayMarker, HoverInfo } from '../lib/map/HexMapRenderer';
import { totalSpeed, totalUpkeepPerHour } from '../lib/units/armyDispatch';
import { reachableRange, type PathContext } from '../lib/map/hexPath';

const world = useWorldStore();
const player = usePlayerStore();
const unitCatalogue = useUnitCatalogueStore();
const buildingCatalogue = useBuildingCatalogueStore();

// ?debug=1 surfaces FogDebugPanel — same idea as window.__fogDebug (main.ts)
// but clickable, and not gated to demo mode: these are pure client-side
// rendering toggles, nothing about game state. See useFogDebug for why this
// is a shared composable rather than a local computed().
const showFogDebug = useFogDebug();
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
  void unitCatalogue.load();

  // Same test/debug-hook idea as main.ts's __demoWorld: lets an e2e test
  // convert a real hex coordinate to an exact click point via the
  // renderer's own camera math (HexMapRenderer.hexCenterScreen), instead of
  // guessing pixel offsets that only happen to land right at one particular
  // zoom/camera framing.
  if (DEMO_MODE) {
    (window as unknown as { __settlementRenderer?: () => unknown }).__settlementRenderer = () =>
      canvasRef.value?.renderer;
  }
});
onUnmounted(() => {
  world.stopHudSync();
  if (DEMO_MODE) delete (window as unknown as { __settlementRenderer?: () => unknown }).__settlementRenderer;
});

// Fog v2 (map-fog-v2.md §3): pushes a freshly fetched mask bitmap into the
// renderer — same "watch both together" reasoning the army-overlay watcher
// below uses, since the renderer may not exist yet on the tick a fetch
// resolves.
watch(
  [() => canvasRef.value?.renderer, () => world.fogMaskBitmap, () => world.worldRadius],
  ([renderer, bitmap, radius]) => {
    if (renderer && bitmap && radius !== null) renderer.setFogMask(radius, bitmap);
  },
);

// Issue #40 phase 2: pushes armies/route/draft-waypoints into the renderer's
// own overlay layer (HexMapRenderer.setArmyOverlay) whenever any of them
// change, or as soon as the renderer itself becomes available — watching
// both together (rather than assuming the renderer is already mounted the
// first time this fires) covers the ordering race between the canvas
// mounting and this store data arriving.
const armyOverlayData = computed<ArmyOverlayData>(() => {
  const armies: ArmyOverlayMarker[] = world.armies.map((a) => ({
    id: a.id,
    position: a.position,
    selected: a.id === world.selectedArmyId,
    returning: !!a.movement?.isReturning,
    // Issue #94: hand the renderer the whole frozen leg, not a position —
    // it interpolates along it every frame (see HexMapRenderer's
    // `resolveArmyPoint`). An `atHome`/`supporting` army has no movement at
    // all and keeps sitting on its authoritative hex. `movement.path` is
    // always the *active* leg, outbound or return (the backend rebuilds
    // Movement on turn-around — see Movement.cs's own remarks), so there's
    // no leg-picking to do here.
    movement: a.movement
      ? {
          path: a.movement.path.map((p) => ({ q: p.q, r: p.r })),
          cumulativeHours: a.movement.cumulativeHours ?? [],
          departedAtMs: Date.parse(a.movement.departedAt),
          arrivesAtMs: Date.parse(a.movement.arrivesAt),
        }
      : undefined,
  }));
  const selected = world.armies.find((a) => a.id === world.selectedArmyId);
  const route = selected?.movement
    ? selected.movement.isReturning
      ? selected.movement.returnPath
      : selected.movement.path
    : [];
  const draftWaypoints = world.dispatchDraft?.route ?? [];
  return { armies, route, draftWaypoints, targets: overlayTargets(selected) };
});

// Issue #93 "attack/raid target indicator": the settlement an attack/support
// is aimed at, marked on its own hex. Two sources, deliberately both: the
// dispatch being composed right now (the player picked it from a text list
// and otherwise gets no confirmation of *where* it is), and the selected
// in-transit army's target (so a march already under way still shows what
// it's marching at). A settlement the local WorldModel doesn't know yet
// (`refreshWorldSettlements` hasn't registered it) simply isn't marked.
function overlayTargets(selectedArmy: (typeof world.armies)[number] | undefined) {
  const targets: NonNullable<ArmyOverlayData['targets']> = [];
  const add = (settlementId: string | null | undefined, mission: string) => {
    if (!settlementId || (mission !== 'attack' && mission !== 'support' && mission !== 'raid')) return;
    const settlement = world.model.getSettlement(settlementId);
    if (!settlement) return;
    // Raids are attacks as far as the map is concerned — the marker says
    // "someone is coming for this place", not which flavour of order it is.
    const kind = mission === 'support' ? 'support' : 'attack';
    if (targets.some((t) => t.coord.q === settlement.q && t.coord.r === settlement.r && t.kind === kind)) return;
    targets.push({ coord: { q: settlement.q, r: settlement.r }, kind });
  };
  const draft = world.dispatchDraft;
  if (draft) add(draft.targetSettlementId, draft.mission);
  if (selectedArmy && !selectedArmy.movement?.isReturning) {
    add(selectedArmy.targetSettlementId, selectedArmy.mission);
  }
  return targets;
}
watch(
  [() => canvasRef.value?.renderer, armyOverlayData],
  ([renderer, data]) => {
    renderer?.setArmyOverlay(data ?? null);
  },
  { immediate: true },
);

// Issue #159 part B: the reachable-range tint while composing a dispatch.
// Origin and home are both the settlement's own hex — a field order from a
// standing army (where they'd differ) is #156 phase 1, not built yet.
// Rounded to the nearest tenth of an hour so a sub-pixel provisions-slider
// twitch doesn't force a fresh flood-fill every frame.
const rangeOverlayHexes = computed<AxialCoord[] | null>(() => {
  const draft = world.dispatchDraft;
  if (!draft || draft.mission !== 'move') return null;
  if (!world.selectedSettlementId) return null;

  const home = world.model.getSettlement(world.selectedSettlementId);
  if (!home) return null;

  const speed = totalSpeed(draft.unitCounts, unitCatalogue.byType);
  const upkeep = totalUpkeepPerHour(draft.unitCounts, unitCatalogue.byType);
  if (speed <= 0 || upkeep <= 0 || draft.provisions <= 0) return null;

  const hoursOfFood = draft.provisions / upkeep;
  const ctx: PathContext = {
    terrainAt: (c) => world.model.getTile(c.q, c.r).terrain,
    isRiver: (c) => world.model.getRiverTile(c.q, c.r) !== undefined,
    rules: { land: world.movementRules.land, riverCrossingCost: world.movementRules.riverCrossingCost },
    hexesPerHour: speed * world.worldSpeedFactor,
  };
  const origin = { q: home.q, r: home.r };
  const range = reachableRange(origin, origin, hoursOfFood, ctx);
  return [...range.keys()].map(parseKey);
});

watch(
  [() => canvasRef.value?.renderer, rangeOverlayHexes],
  ([renderer, hexes]) => {
    renderer?.setRangeOverlay(hexes ?? null);
  },
  { immediate: true },
);

// Live mode: `refreshLiveSettlement` (the poll loop, and the immediate
// re-fetch after queueBuildLive/cancelBuildLive/upgrade) writes completed
// levels and new/removed foundation stubs straight into `world.model`'s
// tiles, but the renderer only ever redraws sprites on a real camera pan/
// zoom (`cameraMovedEnough`) — nothing tied a data refresh to a redraw, so
// a building that finished (or one just queued, which should show its
// level-0 foundation immediately) kept showing its old texture until the
// player happened to pan far enough by coincidence. `world.hud.buildings`
// is reassigned to a fresh array on every `refreshLiveSettlement` call
// (whether or not anything actually changed), so watching it is a cheap,
// reliable "the settlement snapshot moved" signal to force a redraw on.
watch(
  [() => canvasRef.value?.renderer, () => world.hud.buildings],
  ([renderer]) => {
    renderer?.forceRebuild();
  },
);

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
// Why the last build/upgrade attempt was rejected — surfaced in BuildingModal
// rather than only `console.error`'d, and cleared whenever a fresh attempt
// starts or a different tile is selected.
const actionError = ref<string | null>(null);
// Issue #40 phase 1: a separate modal from BuildingModal (train has no
// per-hex build/upgrade action, it lists the whole unit roster at once) —
// see the ring's 'train' action below.
const trainModalOpen = ref(false);

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

// Ring menu state. The 2a ring owns its own depth (root actions -> build
// categories -> a category's buildings), so this only tracks *where* it is
// open — the concentric ringStack/radius/angle-stagger machinery the
// previous ring needed is gone with it.
const ringScreen = ref<{ x: number; y: number } | null>(null);

// The ring must stay clear of the HUD panels, which means knowing how big the
// stage actually is. A ResizeObserver on the stage element rather than
// window.innerWidth/Height: the window fires no resize when a surrounding
// element changes size (an embedded or split view), which would freeze the
// bounds at whatever they were on mount.
const stageRef = ref<HTMLElement | null>(null);
const stage = ref({ w: window.innerWidth, h: window.innerHeight });
let stageObserver: ResizeObserver | null = null;
onMounted(() => {
  buildingCatalogue.load();
  if (!stageRef.value) return;
  stageObserver = new ResizeObserver(() => {
    const rect = stageRef.value?.getBoundingClientRect();
    if (rect) stage.value = { w: rect.width, h: rect.height };
  });
  stageObserver.observe(stageRef.value);
});
onUnmounted(() => stageObserver?.disconnect());

// Every number below is traceable to a panel's own scoped style, so the ring
// treats a panel as an edge rather than opening underneath it:
//   BuildQueuePanel .status-card  left:16  top:76    width:240  -> left 268
//   ExpansionPanel  .status-card  left:16  top:340   width:240  (same column)
//   RealmPanel      .realm-panel  left:16  bottom:16 min-w:220  (same column)
//   TradePanel                    right:16 top:118   width:320  -> right -348
//   TrainingQueuePanel            right:16 top:76    width:240
//   ArmyPanel       .status-card  right:16 bottom:16 width:260
//   TopBar .hud-bar height 64, plus a 12px gap                  -> top 76
// These are worst-case constants: every panel is treated as present.
const ringBounds = computed(() => ({
  left: 268,
  top: 76,
  right: Math.max(420, stage.value.w - 348),
  bottom: stage.value.h - 16,
}));
// The card gets its own, roomier area on purpose. What `ringBounds` leaves
// over once every panel is reserved is about 308x404 at 1280x720 — too small
// to hold the 200x222 card anywhere clear of the ring, so the card would end
// up on top of the menu. A card briefly overlapping a panel is much less
// harmful than one covering the menu.
const ringCardBounds = computed(() => ({
  left: 16,
  top: 76,
  right: stage.value.w - 16,
  bottom: stage.value.h - 16,
}));

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

type BuildableType =
  | 'hut'
  | 'farm'
  | 'tower'
  | 'fishinghut'
  | 'magictower'
  | 'pumpkinfarm'
  | 'shrineofthor'
  | 'shrineoffreyja'
  | 'lumberjack'
  | 'quarry';

interface BuildCategory {
  id: string;
  label: string;
  buildings: { type: BuildableType; label: string }[];
}
// Mirrors BuildingCatalogue.cs's per-type AllowedTerrain: Farm/PumpkinFarm/
// MagicTower are Grass-only, Lumberjack is Forest-only, Quarry is
// Mountain-only, Tower is SandOrGrass, and a shrine is buildable on any land
// hex. Offering a building the backend's own AllowedTerrain would reject is
// what "messed up categories" on a shore (sand) tile meant — sand used to
// fall into the same flat bucket as forest/mountain and offer Farm/
// Lumberjack/Quarry, none of which the backend would ever accept there.
// FishingHut isn't a land-terrain building at all (RequiresCoastalWater, on
// a Sea hex) so it belongs in none of these — Build is disabled outright on
// sea tiles below, so there is currently no ring path to it.
const SHRINE_CATEGORY: BuildCategory = {
  id: 'religion',
  label: 'Shrines',
  buildings: [
    { type: 'shrineofthor', label: 'Shrine of Thor' },
    { type: 'shrineoffreyja', label: 'Shrine of Freyja' },
  ],
};
const BUILD_CATEGORIES: Record<'grass' | 'sand' | 'forest' | 'mountain', BuildCategory[]> = {
  grass: [
    { id: 'housing', label: 'Housing', buildings: [{ type: 'hut', label: 'Hut' }] },
    {
      id: 'resource',
      label: 'Resource',
      buildings: [
        { type: 'farm', label: 'Farm' },
        { type: 'pumpkinfarm', label: 'Pumpkin Farm' },
      ],
    },
    {
      id: 'defense',
      label: 'Defense',
      buildings: [
        { type: 'tower', label: 'Watchtower' },
        { type: 'magictower', label: 'Magic Tower' },
      ],
    },
    SHRINE_CATEGORY,
  ],
  sand: [
    { id: 'defense', label: 'Defense', buildings: [{ type: 'tower', label: 'Watchtower' }] },
    SHRINE_CATEGORY,
  ],
  forest: [
    { id: 'resource', label: 'Resource', buildings: [{ type: 'lumberjack', label: 'Lumberjack' }] },
    SHRINE_CATEGORY,
  ],
  mountain: [
    { id: 'resource', label: 'Resource', buildings: [{ type: 'quarry', label: 'Quarry' }] },
    SHRINE_CATEGORY,
  ],
};

function categoriesFor(tile: Tile): BuildCategory[] {
  if (tile.terrain === 'sea') return [];
  return BUILD_CATEGORIES[tile.terrain];
}

const isEnemyTile = computed(
  () => !!selectedTile.value?.ownerId && selectedTile.value.ownerId !== world.selectedSettlementId,
);
const isMineTile = computed(
  () => !!selectedTile.value && selectedTile.value.ownerId === world.selectedSettlementId,
);
const isUnclaimedTile = computed(() => !!selectedTile.value && !selectedTile.value.ownerId);

// Category tints, carried into each category's own buildings so a building
// bubble reads as belonging to the category it fanned out of.
const CATEGORY_COLORS: Record<string, string> = {
  housing: 'var(--gold)',
  resource: 'var(--food)',
  defense: 'var(--iron)',
  religion: 'var(--shrine)',
};

const rootActions = computed<RingAction[]>(() => {
  const tile = selectedTile.value;
  if (!tile) return [];

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
    // The previous ring floated "Lv n / upgrade" as a gold badge above the
    // orbit, joined to it by a guide line. 2a has no badge — every action is
    // a bubble on the inner lane — so upgrade becomes an ordinary bubble and
    // the level it used to carry moves onto the hub (see ringCoordLabel),
    // which is where the tile's own facts live now.
    //
    // Unlike a build bubble (which shows an affordable-or-not cost card once
    // hovered — root actions carry no cost/card), Upgrade needs to say up
    // front whether it's even possible: same disabled+hint pattern already
    // used for Raze/Train/Attack above, not a new affordance.
    const nextLevel = (tile.buildingLevel ?? 1) + 1;
    const upgradeDefinition = buildingCatalogue.byType[tile.buildingType]?.find((d) => d.level === nextLevel);
    const upgradeCost = upgradeDefinition?.cost ?? buildingUpgradeCost(tile.buildingType, nextLevel);
    const stock = world.hud.resources;
    const shortOf = (['wood', 'stone', 'food', 'iron'] as const).filter((key) => upgradeCost[key] > stock[key]);
    const actions: RingAction[] = [
      {
        id: 'upgrade',
        label: 'Upgrade',
        color: 'var(--gold)',
        disabled: shortOf.length > 0,
        hint: shortOf.length ? `Not enough ${shortOf.join(', ')}` : undefined,
      },
      { id: 'details', label: 'Details' },
      {
        id: 'raze',
        label: 'Raze',
        disabled: tile.buildingType === 'longhouse' || !DEMO_MODE,
        hint: tile.buildingType === 'longhouse' ? "Can't raze the longhouse" : 'Not wired to the backend yet',
      },
    ];
    // Issue #40 phase 1: "build units in longhouse" — training is queued
    // against the settlement from its longhouse, so that one building type
    // gets an extra action here.
    if (tile.buildingType === 'longhouse') {
      actions.push({ id: 'train', label: 'Train units' });
    }
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

function tileAt(q: number, r: number): Tile {
  return world.model.getTile(q, r);
}

// Cost, build time and the longhouse gate all come from the building
// catalogue store, which serves the backend's own numbers (GET
// /api/v1/buildings, or its bundled snapshot in demo mode) — so the card
// can't drift from BuildingCatalogue.cs. "hut" is demo-only and has no
// catalogue entry, hence the client-side cost fallback and no time/lock.
function ringBuildingFor(type: BuildableType, label: string, coord: AxialCoord): RingBuilding {
  const definition = buildingCatalogue.byType[type]?.find((d) => d.level === 1);
  const boostTerrain = BOOST_TERRAIN[type];
  const matching = boostTerrain ? matchingNeighbourCount(coord, boostTerrain, tileAt) : 0;
  const stats = buildingStatsFor(type, 1, matching);
  return {
    id: type,
    label,
    cost: definition?.cost ?? buildingUpgradeCost(type, 1),
    time: definition ? formatBuildTime(definition.buildSeconds) : undefined,
    gives: stats.output ?? stats.modifier,
    lock: longhouseLock(definition?.requiredLonghouseLevel, world.hud.level),
    art: buildingArt(type, 1),
  };
}

const ringCategories = computed<RingCategory[]>(() => {
  const tile = selectedTile.value;
  const coord = selectedCoord.value;
  if (!tile || !coord) return [];
  return categoriesFor(tile).map((category) => ({
    id: category.id,
    label: category.label,
    color: CATEGORY_COLORS[category.id] ?? 'var(--gold)',
    buildings: category.buildings.map((b) => ringBuildingFor(b.type, b.label, coord)),
  }));
});

const TERRAIN_LABELS: Record<string, string> = {
  sea: 'Open water',
  sand: 'Shore',
  grass: 'Grassland',
  forest: 'Forest',
  mountain: 'Mountain',
};
const BUILDING_LABELS: Record<string, string> = {
  hut: 'Hut',
  farm: 'Farm',
  tower: 'Watchtower',
  longhouse: 'Longhouse',
  fishinghut: 'Fishing Hut',
  magictower: 'Magic Tower',
  pumpkinfarm: 'Pumpkin Farm',
  shrineofthor: 'Shrine of Thor',
  shrineoffreyja: 'Shrine of Freyja',
  lumberjack: 'Lumberjack',
  quarry: 'Quarry',
};

// The hub names what was clicked: the building standing on the hex if there
// is one, otherwise the bare terrain.
const ringTerrainLabel = computed(() => {
  const tile = selectedTile.value;
  if (!tile) return '';
  return (tile.buildingType ? BUILDING_LABELS[tile.buildingType] : undefined) ?? TERRAIN_LABELS[tile.terrain] ?? '';
});
const ringCoordLabel = computed(() => {
  const coord = selectedCoord.value;
  if (!coord) return '';
  const hex = `HEX ${coord.q}, ${coord.r}`;
  const level = selectedTile.value?.buildingType ? selectedTile.value.buildingLevel ?? 1 : null;
  return level === null ? hex : `LV ${level} · ${hex}`;
});

const ringOpen = computed(() => !!(selectedTile.value && ringScreen.value));

function onHexClick(coord: AxialCoord, tile: Tile, screen: { x: number; y: number }) {
  // Issue #40 phase 2: while a dispatch is being composed (ArmyPanel's
  // "Dispatch army" flow), a click plots the next waypoint instead of
  // opening the usual ring menu — the two interaction modes are mutually
  // exclusive on this same canvas, per the design doc.
  if (world.dispatchDraft) {
    world.addWaypoint(coord);
    return;
  }
  hoverInfo.value = null;
  selectedCoord.value = coord;
  selectedTile.value = tile;
  ringScreen.value = screen;
  actionError.value = null;
}

// Issue #93 "drag to move a placed waypoint": the renderer resolved the hex
// the pin was dragged onto (snapping happens there, against the same
// isoPixelToAxial a click uses); this just writes it into the draft.
function onWaypointMove(index: number, coord: AxialCoord) {
  world.moveWaypoint(index, coord);
}

function closeRing() {
  selectedCoord.value = null;
  selectedTile.value = null;
  ringScreen.value = null;
  actionError.value = null;
}

// The ring owns its own drill-down now (hover a category, its buildings fan
// out beside it), so only a committed choice reaches here: a building id from
// the outer lane, or one of the root actions.
async function onRingSelect(id: string) {
  const tile = selectedTile.value;
  if (tile && categoriesFor(tile).some((c) => c.buildings.some((b) => b.type === id))) {
    await buildType(id as BuildableType);
    // A rejection needs somewhere to show — fall back to BuildingModal (same
    // tile, ring dismissed) instead of closing everything and losing it.
    if (actionError.value) ringScreen.value = null;
    else closeRing();
    return;
  }
  switch (id) {
    case 'details':
    case 'info':
      // Falls through to BuildingModal below; the ring stays "open" only long
      // enough for the modal to take over the same selectedTile.
      ringScreen.value = null;
      return;
    case 'upgrade':
      // upgrade() already closes on success (both branches); on failure it
      // deliberately leaves selectedTile/ringScreen alone so this can drop
      // through to BuildingModal instead, where the error renders.
      await upgrade();
      if (actionError.value) ringScreen.value = null;
      return;
    case 'train':
      // Same hand-off pattern as 'details'/'info', to TrainingModal.
      ringScreen.value = null;
      trainModalOpen.value = true;
      return;
    case 'raze':
      if (world.selectedSettlementId && selectedCoord.value) {
        world.model.razeBuilding(world.selectedSettlementId, selectedCoord.value);
        canvasRef.value?.renderer?.forceRebuild();
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

function closeTrainModal() {
  closeRing();
  trainModalOpen.value = false;
}

// ApiError.problem.detail carries the backend's own human-readable
// rejection reason (BuildRejection etc, ArmyEndpoints.Problem convention) —
// mirrors world.ts's dispatchArmy/TrainingModal's own error-surfacing.
function describeActionError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? (err.problem?.detail ?? err.message) : fallback;
}

// Demo mode places the chosen building instantly; live mode queues that
// same type against the backend's real catalogue (BuildingCatalogue.cs) —
// "hut" is demo-only (BuildingModal's default when there's no picker; the
// backend has no matching catalogue entry) and is expected to be rejected
// server-side if ever picked in live mode, same as any other invalid
// placement (wrong terrain, insufficient longhouse level, ...).
async function buildType(type: BuildableType) {
  if (!world.selectedSettlementId || !selectedCoord.value) return;
  actionError.value = null;
  if (DEMO_MODE) {
    world.model.placeBuilding(world.selectedSettlementId, selectedCoord.value, type);
    canvasRef.value?.renderer?.forceRebuild();
    return;
  }
  modalBusy.value = true;
  try {
    await world.queueBuildLive(type, selectedCoord.value);
  } catch (err) {
    actionError.value = describeActionError(err, 'Could not build here.');
  } finally {
    modalBusy.value = false;
  }
}

// BuildingModal's own "Build here" button (opened via the ring's
// Details/Info action on an empty tile) has no category/type picker of its
// own, so it keeps the previous default of a hut.
async function build() {
  await buildType('hut');
  if (actionError.value) return;
  closeModal();
}

async function upgrade() {
  if (!world.selectedSettlementId || !selectedCoord.value || !selectedTile.value?.buildingType) return;
  actionError.value = null;
  if (DEMO_MODE) {
    const tile = world.model.getTile(selectedCoord.value.q, selectedCoord.value.r);
    tile.buildingLevel = (selectedTile.value.buildingLevel ?? 1) + 1;
    canvasRef.value?.renderer?.forceRebuild();
    closeModal();
    return;
  }
  modalBusy.value = true;
  try {
    await world.queueBuildLive(selectedTile.value.buildingType, selectedCoord.value);
    closeModal();
  } catch (err) {
    actionError.value = describeActionError(err, 'Could not upgrade this building.');
    modalBusy.value = false;
  }
}
</script>

<template>
  <div ref="stageRef" class="settlement">
    <SettlementCanvas
      v-if="world.selectedSettlementId"
      ref="canvasRef"
      :world-model="world.model"
      :player-id="player.id"
      :settlement-id="world.selectedSettlementId"
      @hex-click="onHexClick"
      @hover="onHover"
      @waypoint-move="onWaypointMove"
    />
    <div v-if="showFogDebug" class="fog-debug-stack">
      <FogDebugPanel @change="onFogDebugChange" />
      <FogPerfPanel />
    </div>
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
    <ExpansionPanel />
    <TradePanel />
    <TrainingQueuePanel />
    <ArmyPanel />
    <HexTooltip v-if="hoverInfo" :info="hoverInfo" />
    <RingMenu
      v-if="selectedTile && ringScreen"
      :x="ringScreen.x"
      :y="ringScreen.y"
      :actions="rootActions"
      :categories="ringCategories"
      :terrain-label="ringTerrainLabel"
      :coord-label="ringCoordLabel"
      :bounds="ringBounds"
      :card-bounds="ringCardBounds"
      :stock="world.hud.resources"
      @select="onRingSelect"
      @close="closeRing"
      @outside-pointer-down="onRingOutsidePointerDown"
    />
    <BuildingModal
      v-if="selectedTile && !ringScreen && !trainModalOpen"
      :tile="selectedTile"
      :mine="modalMine"
      :owner-label="modalOwnerLabel"
      :busy="modalBusy"
      :error="actionError"
      @close="closeModal"
      @build="build"
      @upgrade="upgrade"
    />
    <TrainingModal
      v-if="selectedTile && trainModalOpen"
      @close="closeTrainModal"
      @trained="closeTrainModal"
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
.fog-debug-stack {
  position: absolute;
  /* Clears TopBar (top:16px) and ResourceBar (top:66px, right:16px). */
  top: 120px;
  right: 16px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
