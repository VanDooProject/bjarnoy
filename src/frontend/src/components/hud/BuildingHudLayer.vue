<script setup lang="ts">
// The building HUD: over every own building of the settlement view a marker (a hex dial with the level or the upgrade
// countdown, and, near and mid, a box docked to it). Every construction dial the renderer holds that no building marker shows
// (a new build, every dial while building info is off) is a dial-only marker: the same placement, hover, tap and occlusion code,
// just the dial. The canvas draws no construction dial at all. What a marker shows is lib/hud/buildingHud.ts; this layer feeds it from
// the stores, keeps the markers on their buildings frame by frame (CSS transforms written straight to the elements, like
// composables/useMapAnchor.ts, no Vue re-render per frame) and owns the H key (the toggle button itself is BuildingInfoToggle). A marker is sized
// like the Pixi progress dial (`dialScale`): it scales with the map, grows to its default-zoom size on hover / tap.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { buildingName } from '../../i18n/catalogueNames';
import { useAuthStore } from '../../stores/auth';
import { useBuildingCatalogueStore } from '../../stores/buildingCatalogue';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { useWorldStore } from '../../stores/world';
import { builtBuildingLevels, ownBuildings } from '../../composables/useBuildRing';
import { useIsMobile } from '../../composables/useIsMobile';
import {
  boxChangeFor,
  dialGoneAfterMs,
  dialShownAfterMs,
  useBuildingHudMotion,
  waveDelays,
  type MarkerParts,
} from '../../composables/useBuildingHudMotion';
import type { AxialCoord } from '../../lib/hex/coords';
import {
  ageViewModel,
  hudMarkerKeys,
  buildingHudViewModel,
  hasHudMarker,
  rowsFor,
  rowsSignature,
  stackOrder,
  tierFor,
  type BuildingHudViewModel,
  type HudRow,
  type HudTier,
} from '../../lib/hud/buildingHud';
import { formatCountdownShort } from '../../lib/hud/countdown';
import { boostContextAt, type BuildingKind } from '../../lib/map/buildingEconomy';
import {
  DIAL_TAP_REVEAL_MS,
  dialHoverStep,
  dialPhase,
  dialProgress,
  dialRadiusPx,
  dialRemainingSeconds,
  dialScale,
  nextTapReveal,
  pickTappedDial,
  type ConstructionDial,
} from '../../lib/map/constructionDial';
import { circleIntersectsRect, markerFadeStep, type OcclusionCircle } from '../../lib/map/markerOcclusion';
import { animationPreference } from '../../lib/perf/animationPreference';
import BuildingHudBox from './BuildingHudBox.vue';
import BuildingHudDial from './BuildingHudDial.vue';
import BuildingInfoToggle from './BuildingInfoToggle.vue';

/** The slice of HexMapRenderer the layer reads — kept narrow so tests (and other hosts) can hand it a stand-in. */
export interface BuildingHudRenderer {
  /** Screen point of the progress dial's centre over a building: lifted off the hex's centre. The marker's dial sits right there. */
  dialScreenPoint(coord: AxialCoord): { x: number; y: number };
  /** `camera.zoom / SETTLEMENT_DEFAULT_ZOOM`: what the progress dial sizes itself by (`dialScale`). */
  readonly dialMapScale: number;
  /** The renderer's own "may this key drive the map" guard (no Ctrl/Meta/Alt, not typing, not covered or locked). */
  keyDrivesMap(e: KeyboardEvent): boolean;
  /** The mouse over the map in canvas px (null: touch, or over a panel) and the hex under it: what a marker hovers by. */
  readonly mousePoint: { x: number; y: number } | null;
  readonly hoveredHexKey: string | null;
  /** Touch taps on the map, which still reach the map itself: a tap on a marker's dial reveals it. */
  setTapObserver(fn: ((screen: { x: number; y: number }) => void) | null): void;
  /** Called once per rendered map frame after the camera moved: the markers are placed from it, in the frame the canvas presents. */
  setFrameObserver(fn: (() => void) | null): void;
  /** The open ring menu's footprint (canvas px); markers beneath it fade out like the progress dials do. */
  readonly markerOcclusionCircle: OcclusionCircle | null;
  /** The construction dials the renderer holds: the queue's, plus finishing and refused ones. Replaced on every change. */
  readonly constructionDialList: readonly ConstructionDial[];
}

const props = withDefaults(
  defineProps<{
    renderer: BuildingHudRenderer | null | undefined;
    /** Markers over the own buildings and the switch for them; false = only the dial-only markers of the construction dials. */
    buildingMarkers?: boolean;
  }>(),
  { buildingMarkers: true },
);

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const world = useWorldStore();
const auth = useAuthStore();
const catalogue = useBuildingCatalogueStore();
const prefs = useHudPrefsStore();
const isMobile = useIsMobile();
const motion = useBuildingHudMotion();

/** The markers are in the DOM: from the moment they are switched on until their hide animation has ended. */
const rendered = ref(props.buildingMarkers && prefs.buildingInfo);

/** Every marker's current tier (they differ while one is hovered); the placement loop writes it only when it changes. */
const tiers = ref<Record<string, HudTier>>({});
const tierOf = (key: string): HudTier => tiers.value[key] ?? 'mid';

/** Bumped when the renderer's dial list changes (a refusal, a finish, a new order): the markers read their order dial from it. */
const dialsVersion = ref(0);

/** The dial is drawn at the progress dial's default-zoom size; the marker is scaled to the live size factor `zs`. */
const DIAL_RADIUS = dialRadiusPx(1);

interface Marker {
  key: string;
  coord: AxialCoord;
  type: string;
  name: string;
  level: number;
  vm: BuildingHudViewModel;
}

/**
 * What the building list looks like, as one string: in the demo the local model is not reactive (a placed building shows up with
 * the next `hud.tick`), so this is how the heavy view models notice a change without being rebuilt every second.
 */
const buildingsKey = computed(() => {
  void world.hud.tick;
  return ownBuildings(world)
    .map((b) => `${b.q},${b.r},${b.type},${b.level}`)
    .join(';');
});

/**
 * Every marker's view model, built from what changes only when something changed: the polled stock, queue, catalogue, the
 * building list and the renderer's dial list. The countdowns inside it stay as fetched; `markers` below ages them each second.
 */
const baseMarkers = computed<Marker[]>(() => {
  void dialsVersion.value;
  void buildingsKey.value;
  if (!rendered.value || !props.buildingMarkers || !world.selectedSettlementId) return [];
  const hud = world.hud;
  const feast = hud.feast
    ? {
        secondsLeft: hud.feast.endsInSeconds,
        totalSeconds: (Date.parse(hud.feast.endsAtGameTime) - Date.parse(hud.feast.startedAtGameTime)) / 1000,
        renownGain: hud.feast.renownGain,
      }
    : null;
  const builtLevels = builtBuildingLevels(world);
  const tileAt = (q: number, r: number) => world.model.getTile(q, r);
  const orderDials = new Map<string, ConstructionDial>();
  for (const d of props.renderer?.constructionDialList ?? []) orderDials.set(`${d.coord.q},${d.coord.r}`, d);
  const now = Date.now();

  return ownBuildings(world)
    .filter(hasHudMarker)
    .map((b) => {
      const coord = { q: b.q, r: b.r };
      const boost = boostContextAt(b.type as BuildingKind, { ...coord, bog: tileAt(b.q, b.r).bog }, tileAt);
      const vm = buildingHudViewModel({
        coord,
        type: b.type,
        level: b.level,
        definitions: catalogue.byType[b.type],
        queue: hud.queue,
        longhouseLevel: hud.level,
        builtLevels,
        available: hud.available,
        storageCap: hud.storageCap,
        rates: hud.rates,
        construction: hud.construction,
        worldSpeedFactor: world.worldSpeedFactor,
        matchingNeighbours: boost.matchingNeighbours,
        onLake: boost.onLake,
        feast,
        garrison: hud.garrison,
        trainingQueue: hud.trainingQueue,
        orderDial: orderDials.get(`${b.q},${b.r}`) ?? null,
        nowMs: now,
      });
      return { key: `${b.q},${b.r}`, coord, type: b.type, name: buildingName(b.type), level: b.level, vm };
    });
});

/** The markers with their countdowns aged to now: only the ones that tick get a new object, so the rest stay as they were. */
const markers = computed<Marker[]>(() => {
  void world.hud.tick; // the countdowns tick every second
  const now = Date.now();
  const since = {
    queue: (now - world.hud.queueFetchedAt) / 1000,
    training: (now - world.hud.trainingQueueFetchedAt) / 1000,
    feast: (now - world.hud.feastFetchedAt) / 1000,
  };
  return baseMarkers.value.map((m) => {
    const vm = ageViewModel(m.vm, since);
    return vm === m.vm ? m : { ...m, vm };
  });
});

/**
 * A construction dial no building marker shows: its own marker, just the dial. The hexes a marker owns are the ones it shows
 * (`ownedKeys`); a marker still handing its dial over (`notOwned`) does not own its hex yet.
 */
interface DialOnlyMarker {
  /** Key of the element (`d:q,r`): distinct from a building marker's on the same hex while one hands over to the other. */
  key: string;
  hexKey: string;
  coord: AxialCoord;
  dial: ConstructionDial;
  ring: 'upgrading';
  progress: number;
  label: string;
  time: boolean;
  urgent: boolean;
}

/** The hexes whose construction dial a building marker draws. */
const ownedKeys = computed(() => new Set(rendered.value ? markers.value.map((m) => m.key).filter((key) => !notOwned.value.has(key)) : []));

/** The countdown goes yellow in its last minute, like the canvas dial did. */
const DIAL_URGENT_SECONDS = 60;

const dialOnly = computed<DialOnlyMarker[]>(() => {
  void world.hud.tick; // the countdowns tick every second
  void dialsVersion.value;
  const owned = ownedKeys.value;
  const now = Date.now();
  const reduced = animationPreference.reducedMotion;
  const out: DialOnlyMarker[] = [];
  for (const dial of props.renderer?.constructionDialList ?? []) {
    const hexKey = `${dial.coord.q},${dial.coord.r}`;
    if (owned.has(hexKey)) continue;
    const phase = dialPhase(dial, now, reduced);
    if (!phase) continue;
    const building = phase.kind === 'building';
    const remaining = building ? dialRemainingSeconds(dial, now) : null;
    const label = building ? (remaining === null ? '…' : formatCountdownShort(remaining)) : phase.kind === 'queued' ? `#${phase.position ?? ''}` : '';
    out.push({
      key: `d:${hexKey}`,
      hexKey,
      coord: dial.coord,
      dial,
      ring: 'upgrading',
      progress: building ? dialProgress(dial, now) : 0,
      label,
      time: building,
      urgent: building && remaining !== null && remaining <= DIAL_URGENT_SECONDS,
    });
  }
  return out;
});

/** What the placement loop places: the building markers, then the dial-only ones. */
interface Placeable {
  key: string;
  /** The hex ("q,r"): what a tap or the hovered hex is matched against. */
  hexKey: string;
  coord: AxialCoord;
}
const placeables = computed<Placeable[]>(() => [
  ...markers.value.map((m) => ({ key: m.key, hexKey: m.key, coord: m.coord })),
  ...dialOnly.value,
]);

/** Each marker's rows, worked out again only when its view model, its tier or the premium flag is not what the last ones were made from. */
const rowMemo = new Map<string, { vm: BuildingHudViewModel; tier: HudTier; premium: boolean; rows: HudRow[] }>();
const rowsByKey = computed<Record<string, HudRow[]>>(() => {
  const out: Record<string, HudRow[]> = {};
  const premium = auth.isPremium;
  for (const m of markers.value) {
    const tier = tierOf(m.key);
    const hit = rowMemo.get(m.key);
    if (hit && hit.vm === m.vm && hit.tier === tier && hit.premium === premium) {
      out[m.key] = hit.rows;
      continue;
    }
    const rows = rowsFor(m.vm, tier, { premium });
    rowMemo.set(m.key, { vm: m.vm, tier, premium, rows });
    out[m.key] = rows;
  }
  for (const key of rowMemo.keys()) if (!(key in out)) rowMemo.delete(key);
  return out;
});

// ---- geometry (port of the design reference's dock8Html, drawn at zs = 1; the whole marker is scaled) ---------------------

const DIAL_PAD = (6 * DIAL_RADIUS) / 27.5 / 2 + 1;
const DIAL_HALF = DIAL_RADIUS + DIAL_PAD;

/** The dial's centre is the marker's anchor point: the progress dial's centre. */
const innerStyle = { left: `${-DIAL_HALF}px`, top: `${-DIAL_HALF}px`, height: `${2 * DIAL_HALF}px` };

/** The box starts on the dial's vertical centre line, behind the dial, with its text clear of the dial's right half. */
function boxStyle(currentTier: HudTier) {
  const half = (DIAL_RADIUS * Math.sqrt(3)) / 2;
  return {
    maxHeight: `${2 * DIAL_RADIUS}px`,
    marginLeft: `${-DIAL_HALF}px`,
    paddingLeft: `${half + (currentTier === 'near' ? 9 : 7)}px`,
  };
}

const rowsOf = (m: Marker): HudRow[] => rowsByKey.value[m.key] ?? [];

/**
 * Inside the dial: the countdown of a running upgrade or raze, `#place` of a queued order, else the level; the far tier is the
 * ring only. A pending, refused or finishing dial draws its own symbols instead of a number.
 */
function labelOf(m: Marker): string {
  if (tierOf(m.key) === 'far') return '';
  const { dial } = m.vm;
  switch (dial.kind) {
    case 'upgrading':
    case 'razing':
      return formatCountdownShort(dial.secondsLeft ?? 0);
    case 'queued':
      return `#${dial.queuePosition ?? ''}`;
    case 'pending':
    case 'rejected':
    case 'finishing':
      return '';
    default:
      return String(m.level);
  }
}

// ---- hover / tap (like the progress dial: grows to its default-zoom size, comes to the front) --------------------------------

// The markers take no pointer input (like the canvas dials they never block the map's hover, tap and ring): hover is the
// mouse position the map tracks, a tap is reported by the map. Both hit-test the dial's disc.
let tapKey: string | null = null;
let tapAtMs = 0;
const hoverT = new Map<string, number>();
/** Where each marker's dial is drawn right now (canvas px, radius), for the tap hit test. */
const dialDiscs = new Map<string, { key: string; cx: number; cy: number; r: number }>();

/** A tap on a dial reveals it (a second one closes it); a tap elsewhere closes a revealed one. */
function onMapTap(screen: { x: number; y: number }) {
  tapKey = nextTapReveal(tapKey, pickTappedDial(screen, [...dialDiscs.values()]));
  tapAtMs = Date.now();
}

// ---- per-frame placement --------------------------------------------------------------------------------------------------

const root = ref<HTMLElement | null>(null);
const elements = new Map<string, HTMLElement>();
const lastZ = new Map<string, number>();

/** Ring-menu fade per marker (`markerFadeStep`); absent = fully visible. */
const visibility = new Map<string, number>();
/** Markers the placement loop has placed once already; the first frame still settles the tier a marker mounts with. */
const placedOnce = new Set<string>();
/** Markers whose first frame is over: only these animate a tier or content change (not the one that sets the tier up). */
const settled = new Set<string>();

function setElement(key: string, el: unknown) {
  if (el instanceof HTMLElement) elements.set(key, el);
  else {
    elements.delete(key);
    lastZ.delete(key);
    dialDiscs.delete(key);
    hoverT.delete(key);
    visibility.delete(key);
    placedOnce.delete(key);
    settled.delete(key);
    // A marker mounted again later settles its tier afresh instead of starting on the one it left with.
    if (key in tiers.value) {
      const { [key]: _gone, ...rest } = tiers.value;
      tiers.value = rest;
    }
  }
}

const boxOf = (key: string) => elements.get(key)?.querySelector<HTMLElement>('.hud-marker__box') ?? null;

let lastFrameMs = 0;
let lastDialList: readonly ConstructionDial[] | null = null;

/** Runs from the renderer's own frame (`setFrameObserver`), never from a rAF of its own: the camera it reads is the one just drawn. */
function tick() {
  const renderer = props.renderer;
  const nowMs = Date.now();
  const dtMs = lastFrameMs ? Math.min(100, nowMs - lastFrameMs) : 0;
  lastFrameMs = nowMs;
  if (!renderer) return;
  if (renderer.constructionDialList !== lastDialList) {
    lastDialList = renderer.constructionDialList;
    dialsVersion.value += 1;
  }
  if (tapKey !== null && nowMs - tapAtMs >= DIAL_TAP_REVEAL_MS) tapKey = null;
  // Nothing to place (the landing page without an order, building info off and no dial): no layout read in the map's frame.
  if (placeables.value.length === 0) return;
  const mapScale = renderer.dialMapScale;
  const width = root.value?.offsetWidth ?? window.innerWidth;
  const height = root.value?.offsetHeight ?? window.innerHeight;
  const circle = renderer.markerOcclusionCircle;
  const placed: { key: string; x: number; hovered: boolean }[] = [];
  let tiersChanged = false;
  const nextTiers: Record<string, HudTier> = {};
  // All the layout reads (box widths) first, then every style write: no read after a write for the next marker.
  const boxWidths = new Map<string, number>();
  for (const marker of placeables.value) {
    if (circle || (visibility.get(marker.key) ?? 1) < 1) boxWidths.set(marker.key, boxOf(marker.key)?.offsetWidth ?? 0);
  }
  for (const marker of placeables.value) {
    const el = elements.get(marker.key);
    if (!el) continue;
    if (placedOnce.has(marker.key)) settled.add(marker.key);
    else placedOnce.add(marker.key);
    const { x, y } = renderer.dialScreenPoint(marker.coord);
    // Beneath an open ring menu a marker fades out and stops reacting, like the progress dials.
    const vis0 = visibility.get(marker.key) ?? 1;
    let vis = vis0;
    let occluded = false;
    if (circle || vis0 < 1) {
      const zsNow = dialScale(mapScale, hoverT.get(marker.key) ?? 0).zs;
      const boxWidth = boxWidths.get(marker.key) ?? 0;
      occluded =
        circle !== null &&
        circleIntersectsRect(circle, {
          x: x - DIAL_HALF * zsNow,
          y: y - DIAL_HALF * zsNow,
          w: Math.max(DIAL_HALF, boxWidth) * zsNow + DIAL_HALF * zsNow,
          h: 2 * DIAL_HALF * zsNow,
        });
      vis = markerFadeStep(vis0, occluded, dtMs, animationPreference.reducedMotion);
      if (vis < 1) visibility.set(marker.key, vis);
      else visibility.delete(marker.key);
    }
    if (vis !== vis0 || el.dataset.occluded !== (occluded ? '1' : '0')) {
      el.style.opacity = vis < 1 ? vis.toFixed(2) : '';
      el.dataset.occluded = occluded ? '1' : '0';
      el.classList.toggle('hud-marker--occluded', occluded || vis < 1);
    }
    const mouse = renderer.mousePoint;
    const disc = dialRadiusPx(dialScale(mapScale, hoverT.get(marker.key) ?? 0).zs);
    const hovered =
      !occluded &&
      (tapKey === marker.hexKey ||
        (mouse !== null && Math.hypot(mouse.x - x, mouse.y - y) <= disc) ||
        renderer.hoveredHexKey === marker.hexKey);
    const t = dialHoverStep(hoverT.get(marker.key) ?? 0, hovered, dtMs, animationPreference.reducedMotion);
    if (t > 0) hoverT.set(marker.key, t);
    else hoverT.delete(marker.key);
    const { zs } = dialScale(mapScale, t);
    const tier = tierFor(zs, tiers.value[marker.key] ?? null);
    nextTiers[marker.key] = tier;
    if (tier !== tiers.value[marker.key]) tiersChanged = true;
    dialDiscs.set(marker.key, { key: marker.hexKey, cx: x, cy: y, r: dialRadiusPx(zs) });
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${zs.toFixed(3)})`;
    // A marker well off screen is not worth compositing.
    const reach = 320 * zs;
    el.style.visibility = x < -reach || x > width + reach || y < -reach || y > height + reach ? 'hidden' : 'visible';
    placed.push({ key: marker.key, x, hovered: t > 0 });
  }
  if (tiersChanged) tiers.value = nextTiers;
  // Right-most on top, the hovered / tapped one above all.
  stackOrder(placed).forEach((p, i) => {
    if (lastZ.get(p.key) === i) return;
    lastZ.set(p.key, i);
    elements.get(p.key)!.style.zIndex = String(i);
  });
}

// ---- motion (composables/useBuildingHudMotion.ts) ------------------------------------------------------------------------------

/** Every marker's parts with its wave delay: the distance on screen to the Longhouse's marker. */
function markerParts(): MarkerParts[] {
  const renderer = props.renderer;
  const points = markers.value.map((m) => ({ key: m.key, ...(renderer ? renderer.dialScreenPoint(m.coord) : { x: 0, y: 0 }) }));
  const longhouse = markers.value.find((m) => m.type === 'longhouse');
  const origin = points.find((p) => p.key === longhouse?.key) ?? null;
  const delays = waveDelays(points, origin);
  return markers.value.flatMap((m) => {
    const el = elements.get(m.key);
    if (!el) return [];
    return [
      {
        key: m.key,
        dial: el.querySelector<HTMLElement>('.hud-marker__dial'),
        box: el.querySelector<HTMLElement>('.hud-marker__box'),
        delayMs: delays.get(m.key) ?? 0,
      },
    ];
  });
}

// ---- hand-over of the construction dials ----------------------------------------------------------------------------------
// While a building marker shows, its dial draws every order state of its hex, so there is no dial-only marker on that hex. Per
// marker the hand-over follows the marker's own dial: the dial-only marker stays until the show animation begins to draw the
// marker's dial, and comes back once a hide has taken it away. `notOwned` = markers whose hex a dial-only marker still shows.

const notOwned = ref<Set<string>>(new Set());
const handoverTimers = new Map<string, ReturnType<typeof setTimeout>>();

function setCanvasDraws(key: string, draws: boolean) {
  if (notOwned.value.has(key) === draws) return;
  const next = new Set(notOwned.value);
  if (draws) next.add(key);
  else next.delete(key);
  notOwned.value = next;
}

function clearHandovers() {
  for (const timer of handoverTimers.values()) clearTimeout(timer);
  handoverTimers.clear();
}

function handOverAfter(key: string, ms: number, canvasDraws: boolean) {
  if (ms <= 0) return setCanvasDraws(key, canvasDraws);
  handoverTimers.set(
    key,
    setTimeout(() => {
      handoverTimers.delete(key);
      setCanvasDraws(key, canvasDraws);
    }, ms),
  );
}

// Show / hide: a hide keeps the markers in the DOM until it has ended; a toggle while one runs reverses it.
watch(
  () => prefs.buildingInfo,
  async (on) => {
    if (!props.buildingMarkers) return;
    if (on) {
      const wasShown = rendered.value;
      // Coming from fully hidden, every marker starts with its dial-only marker still showing its hex. Set before the markers
      // mount, so the dial-only markers already on screen stay mounted instead of being taken down and put back.
      if (!wasShown) notOwned.value = hudMarkerKeys(ownBuildings(world));
      rendered.value = true;
      await nextTick();
      const parts = markerParts();
      const reduced = animationPreference.reducedMotion;
      clearHandovers();
      for (const part of parts) {
        if (notOwned.value.has(part.key)) handOverAfter(part.key, dialShownAfterMs(part.delayMs, reduced), false);
      }
      await motion.setShown(true, parts);
    } else {
      const parts = markerParts();
      const reduced = animationPreference.reducedMotion;
      clearHandovers();
      for (const part of parts) if (!notOwned.value.has(part.key)) handOverAfter(part.key, dialGoneAfterMs(part.delayMs, reduced), true);
      await motion.setShown(false, parts);
      if (!prefs.buildingInfo) {
        rendered.value = false;
        clearHandovers();
        notOwned.value = new Set();
      }
    }
  },
);

/** What each marker's box is made of (null until its first frame): a change of it resizes the box, ticking text does not. */
const signatures = computed(() => {
  const out: Record<string, string | null> = {};
  for (const m of markers.value) out[m.key] = tiers.value[m.key] === undefined ? null : rowsSignature(tierOf(m.key), rowsOf(m));
  return out;
});
const hasBox = (signature: string) => !signature.endsWith('|');
const tierOfSignature = (signature: string) => signature.slice(0, signature.indexOf('|'));

// Runs before the DOM follows: the old size and rows are still there to be taken. A box that appears or goes away is the
// `<Transition>` below.
watch(
  signatures,
  (next, previous) => {
    const morphs: { key: string; from: ReturnType<typeof motion.snapshotBox>; change: ReturnType<typeof boxChangeFor> }[] = [];
    for (const [key, signature] of Object.entries(next)) {
      const before = previous[key];
      if (before == null || signature == null || before === signature || !settled.has(key)) continue;
      if (!hasBox(before) || !hasBox(signature)) continue;
      morphs.push({ key, from: motion.snapshotBox(boxOf(key)), change: boxChangeFor(tierOfSignature(before), tierOfSignature(signature)) });
    }
    if (morphs.length === 0) return;
    void nextTick(() => {
      for (const { key, from, change } of morphs) {
        const box = boxOf(key);
        if (box) motion.morphBox(box, from, change);
      }
    });
  },
  { flush: 'pre' },
);

const keyOf = (el: Element) => el.closest('.hud-marker')?.getAttribute('data-coord') ?? '';
function boxHook(direction: 'in' | 'out', el: Element, done: () => void) {
  if (!settled.has(keyOf(el))) return done();
  if (direction === 'in') motion.unfoldBox(el, done);
  else motion.foldBox(el, done);
}
function labelFade(key: string) {
  return settled.has(key) ? motion.fadeLabel : null;
}

// ---- toggle ---------------------------------------------------------------------------------------------------------------

function onKeyDown(e: KeyboardEvent) {
  if (!props.buildingMarkers || e.key.toLowerCase() !== 'h' || e.shiftKey || e.repeat) return;
  // The renderer's own guard: no Ctrl/Meta/Alt, not while typing, not while the map is locked or covered.
  if (!props.renderer?.keyDrivesMap(e)) return;
  e.preventDefault();
  prefs.toggleBuildingInfo();
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  props.renderer?.setTapObserver(onMapTap);
  props.renderer?.setFrameObserver(tick);
});
watch(
  () => props.renderer,
  (next, previous) => {
    previous?.setTapObserver(null);
    previous?.setFrameObserver(null);
    next?.setTapObserver(onMapTap);
    next?.setFrameObserver(tick);
  },
);
onUnmounted(() => {
  clearHandovers();
  motion.dispose();
  window.removeEventListener('keydown', onKeyDown);
  props.renderer?.setTapObserver(null);
  props.renderer?.setFrameObserver(null);
});
</script>

<template>
  <div ref="root" class="building-hud">
    <div class="building-hud__markers">
        <div v-for="m in markers" :key="m.key" :ref="(el) => setElement(m.key, el)" class="hud-marker" :data-coord="m.key" :data-tier="tierOf(m.key)">
          <div class="hud-marker__inner" :style="innerStyle" role="img" :aria-label="t('hud.buildingHud.markerLabel', { building: m.name, level: m.level })">
            <span class="hud-marker__dial">
              <BuildingHudDial
                :radius="DIAL_RADIUS"
                :ring="m.vm.dial.ring"
                :progress="m.vm.dial.progress"
                :label="labelOf(m)"
                :time="m.vm.dial.kind === 'upgrading' || m.vm.dial.kind === 'razing'"
                :label-fade="labelFade(m.key)"
                :order="m.vm.dial.order"
                :label-visible="tierOf(m.key) !== 'far'"
              />
            </span>
            <Transition :css="false" @enter="(el, done) => boxHook('in', el, done)" @leave="(el, done) => boxHook('out', el, done)">
              <div v-if="rowsOf(m).length" class="hud-marker__box" :style="boxStyle(tierOf(m.key))">
                <BuildingHudBox :rows="rowsOf(m)" :tier="tierOf(m.key) === 'near' ? 'near' : 'mid'" />
              </div>
            </Transition>
          </div>
        </div>
        <div
          v-for="d in dialOnly"
          :key="d.key"
          :ref="(el) => setElement(d.key, el)"
          class="hud-marker hud-marker--dial-only"
          :data-dial-only="d.hexKey"
          :data-tier="tierOf(d.key)"
        >
          <div class="hud-marker__inner" :style="innerStyle" aria-hidden="true">
            <span class="hud-marker__dial">
              <BuildingHudDial
                :radius="DIAL_RADIUS"
                :ring="d.ring"
                :progress="d.progress"
                :label="tierOf(d.key) === 'far' ? '' : d.label"
                :time="d.time"
                :urgent="d.urgent"
                :order="d.dial"
                :label-visible="tierOf(d.key) !== 'far'"
              />
            </span>
          </div>
        </div>
    </div>
    <!-- Desktop: the switch is the first icon of the panel column (HudPanelColumn). -->
    <BuildingInfoToggle v-if="buildingMarkers && isMobile" class="building-hud__toggle--phone" />
  </div>
</template>

<style scoped>
/* Fills the map view; only the switch takes the pointer. */
.building-hud {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  isolation: isolate;
  z-index: 1;
}
.building-hud__markers {
  position: absolute;
  inset: 0;
}
/* The marker is a zero-size anchor at the dial's centre; the placement loop moves and scales it (zs, like the progress dial). */
.hud-marker {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  will-change: transform;
  visibility: hidden;
}
.hud-marker__inner {
  position: absolute;
  display: flex;
  align-items: center;
  /* No marker takes the pointer (like the canvas dials): hover, taps, wheel and drags all reach the map. */
  pointer-events: none;
}
.hud-marker--occluded .hud-marker__dial {
  pointer-events: none;
}
.hud-marker__dial {
  position: relative;
  z-index: 2;
  display: inline-block;
  line-height: 0;
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.4));
}
.hud-marker__box {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-sizing: border-box;
  overflow: hidden;
  /* The box folds into / unfolds from the dial's centre line. */
  transform-origin: left center;
  padding-block: 4px;
  padding-right: 8px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-left: 0;
  border-radius: 0 8px 8px 0;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}
/* Phone: the switch sits at the map's top left, below the settlement bubble that sits there (it ends about 44px under the bar). */
.building-hud__toggle--phone {
  position: absolute;
  top: calc(var(--hud-inset-top, 0px) + 60px);
  left: calc(16px + var(--hud-inset-left, 0px));
}
</style>
