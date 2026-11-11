<script setup lang="ts">
// The building HUD: over every own building of the settlement view a marker (a hex dial with the level or the upgrade
// countdown, and, near and mid, a box docked to it). What a marker shows is lib/hud/buildingHud.ts; this layer feeds it from
// the stores, keeps the markers on their buildings frame by frame (CSS transforms written straight to the elements, like
// composables/useMapAnchor.ts, no Vue re-render per frame) and owns the toggle (icon button and the H key). A marker is sized
// like the Pixi progress dial (`dialScale`): it scales with the map, grows to its default-zoom size on hover / tap.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { buildingName } from '../../i18n/catalogueNames';
import { useAuthStore } from '../../stores/auth';
import { useBuildingCatalogueStore } from '../../stores/buildingCatalogue';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import { useWorldStore } from '../../stores/world';
import { builtBuildingLevels, ownBuildings } from '../../composables/useBuildRing';
import { useIsMobile } from '../../composables/useIsMobile';
import type { AxialCoord } from '../../lib/hex/coords';
import { buildingHudViewModel, rowsFor, stackOrder, tierFor, type BuildingHudViewModel, type HudTier } from '../../lib/hud/buildingHud';
import { formatCountdownShort } from '../../lib/hud/countdown';
import { boostContextAt, type BuildingKind } from '../../lib/map/buildingEconomy';
import { DIAL_TAP_REVEAL_MS, dialHoverStep, dialRadiusPx, dialScale, nextTapReveal } from '../../lib/map/constructionDial';
import { isWallBuilding } from '../../lib/map/ringCatalogue';
import { animationPreference } from '../../lib/perf/animationPreference';
import BuildingHudBox from './BuildingHudBox.vue';
import BuildingHudDial from './BuildingHudDial.vue';

/** The slice of HexMapRenderer the layer reads — kept narrow so tests (and other hosts) can hand it a stand-in. */
export interface BuildingHudRenderer {
  /** Screen point of the progress dial's centre over a building: lifted off the hex's centre. The marker's dial sits right there. */
  dialScreenPoint(coord: AxialCoord): { x: number; y: number };
  /** `camera.zoom / SETTLEMENT_DEFAULT_ZOOM`: what the progress dial sizes itself by (`dialScale`). */
  readonly dialMapScale: number;
  /** The renderer's own "may this key drive the map" guard (no Ctrl/Meta/Alt, not typing, not covered or locked). */
  keyDrivesMap(e: KeyboardEvent): boolean;
}

const props = defineProps<{ renderer: BuildingHudRenderer | null | undefined }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const world = useWorldStore();
const auth = useAuthStore();
const catalogue = useBuildingCatalogueStore();
const prefs = useHudPrefsStore();
const isMobile = useIsMobile();

/** Every marker's current tier (they differ while one is hovered); the placement loop writes it only when it changes. */
const tiers = ref<Record<string, HudTier>>({});
const tierOf = (key: string): HudTier => tiers.value[key] ?? 'mid';

// Walls (palisade pieces and gates) are no buildings with a level; every other building, bridges included, gets a marker.
const hasMarker = (type: string) => !isWallBuilding(type);

/** The dial is drawn at the progress dial's default-zoom size; the marker is scaled to the live size factor `zs`. */
const DIAL_RADIUS = dialRadiusPx(1);

interface Marker {
  key: string;
  coord: AxialCoord;
  name: string;
  level: number;
  vm: BuildingHudViewModel;
}

const markers = computed<Marker[]>(() => {
  void world.hud.tick; // the countdowns tick every second
  if (!prefs.buildingInfo || !world.selectedSettlementId) return [];
  const now = Date.now();
  const sinceQueue = (now - world.hud.queueFetchedAt) / 1000;
  const sinceTraining = (now - world.hud.trainingQueueFetchedAt) / 1000;
  const sinceFeast = (now - world.hud.feastFetchedAt) / 1000;
  const left = (seconds: number | null, since: number) => (seconds === null ? null : Math.max(0, seconds - since));
  const queue = world.hud.queue.map((o) => ({ ...o, completesInSeconds: left(o.completesInSeconds, sinceQueue) }));
  const trainingQueue = world.hud.trainingQueue.map((o) => ({
    ...o,
    startsInSeconds: left(o.startsInSeconds, sinceTraining),
    completesInSeconds: left(o.completesInSeconds, sinceTraining),
  }));
  const feast = world.hud.feast
    ? {
        secondsLeft: left(world.hud.feast.endsInSeconds, sinceFeast),
        totalSeconds: (Date.parse(world.hud.feast.endsAtGameTime) - Date.parse(world.hud.feast.startedAtGameTime)) / 1000,
        renownGain: world.hud.feast.renownGain,
      }
    : null;
  const builtLevels = builtBuildingLevels(world);
  const tileAt = (q: number, r: number) => world.model.getTile(q, r);

  return ownBuildings(world)
    .filter((b) => hasMarker(b.type))
    .map((b) => {
      const coord = { q: b.q, r: b.r };
      const boost = boostContextAt(b.type as BuildingKind, { ...coord, bog: tileAt(b.q, b.r).bog }, tileAt);
      const vm = buildingHudViewModel({
        coord,
        type: b.type,
        level: b.level,
        definitions: catalogue.byType[b.type],
        queue,
        longhouseLevel: world.hud.level,
        builtLevels,
        available: world.hud.available,
        storageCap: world.hud.storageCap,
        rates: world.hud.rates,
        construction: world.hud.construction,
        worldSpeedFactor: world.worldSpeedFactor,
        matchingNeighbours: boost.matchingNeighbours,
        onLake: boost.onLake,
        feast,
        garrison: world.hud.garrison,
        trainingQueue,
      });
      return { key: `${b.q},${b.r}`, coord, name: buildingName(b.type), level: b.level, vm };
    });
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

function rowsOf(m: Marker) {
  return rowsFor(m.vm, tierOf(m.key), { premium: auth.isPremium });
}

/** Inside the dial: the countdown of a running upgrade, else the level; the far tier is the ring only. */
function labelOf(m: Marker): string {
  if (tierOf(m.key) === 'far') return '';
  return m.vm.dial.kind === 'upgrading' ? formatCountdownShort(m.vm.dial.secondsLeft ?? 0) : String(m.level);
}

// ---- hover / tap (like the progress dial: grows to its default-zoom size, comes to the front) --------------------------------

const hoveredKey = ref<string | null>(null);
let tapKey: string | null = null;
let tapAtMs = 0;
const hoverT = new Map<string, number>();

function onPointerEnter(key: string, e: PointerEvent) {
  if (e.pointerType !== 'touch') hoveredKey.value = key;
}
function onPointerLeave(key: string, e: PointerEvent) {
  if (e.pointerType !== 'touch' && hoveredKey.value === key) hoveredKey.value = null;
}
function onPointerDown(key: string, e: PointerEvent) {
  if (e.pointerType !== 'touch') return;
  tapKey = nextTapReveal(tapKey, key);
  tapAtMs = Date.now();
}
/** A touch anywhere else closes a tap-revealed marker. */
function onWindowPointerDown(e: PointerEvent) {
  if (e.pointerType === 'touch' && !(e.target as Element | null)?.closest?.('.hud-marker')) tapKey = null;
}

// ---- per-frame placement --------------------------------------------------------------------------------------------------

const root = ref<HTMLElement | null>(null);
const elements = new Map<string, HTMLElement>();
const lastZ = new Map<string, number>();
let frame = 0;

function setElement(key: string, el: unknown) {
  if (el instanceof HTMLElement) elements.set(key, el);
  else {
    elements.delete(key);
    lastZ.delete(key);
  }
}

let lastFrameMs = 0;

function tick() {
  frame = requestAnimationFrame(tick);
  const renderer = props.renderer;
  const nowMs = Date.now();
  const dtMs = lastFrameMs ? Math.min(100, nowMs - lastFrameMs) : 0;
  lastFrameMs = nowMs;
  if (!renderer || !prefs.buildingInfo) return;
  if (tapKey !== null && nowMs - tapAtMs >= DIAL_TAP_REVEAL_MS) tapKey = null;
  const mapScale = renderer.dialMapScale;
  const width = root.value?.offsetWidth ?? window.innerWidth;
  const height = root.value?.offsetHeight ?? window.innerHeight;
  const placed: { key: string; x: number; hovered: boolean }[] = [];
  let tiersChanged = false;
  const nextTiers: Record<string, HudTier> = {};
  for (const marker of markers.value) {
    const el = elements.get(marker.key);
    if (!el) continue;
    const hovered = hoveredKey.value === marker.key || tapKey === marker.key;
    const t = dialHoverStep(hoverT.get(marker.key) ?? 0, hovered, dtMs, animationPreference.reducedMotion);
    if (t > 0) hoverT.set(marker.key, t);
    else hoverT.delete(marker.key);
    const { zs } = dialScale(mapScale, t);
    const tier = tierFor(zs, tiers.value[marker.key] ?? null);
    nextTiers[marker.key] = tier;
    if (tier !== tiers.value[marker.key]) tiersChanged = true;
    const { x, y } = renderer.dialScreenPoint(marker.coord);
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

// ---- toggle ---------------------------------------------------------------------------------------------------------------

function toggle() {
  prefs.setBuildingInfo(!prefs.buildingInfo);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key.toLowerCase() !== 'h' || e.shiftKey || e.repeat) return;
  // The renderer's own guard: no Ctrl/Meta/Alt, not while typing, not while the map is locked or covered.
  if (!props.renderer?.keyDrivesMap(e)) return;
  e.preventDefault();
  toggle();
}

onMounted(() => {
  frame = requestAnimationFrame(tick);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointerdown', onWindowPointerDown);
});
onUnmounted(() => {
  cancelAnimationFrame(frame);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('pointerdown', onWindowPointerDown);
});
</script>

<template>
  <div ref="root" class="building-hud">
    <Transition name="building-hud-fade">
      <div v-if="prefs.buildingInfo" class="building-hud__markers">
        <div v-for="m in markers" :key="m.key" :ref="(el) => setElement(m.key, el)" class="hud-marker" :data-coord="m.key" :data-tier="tierOf(m.key)">
          <div class="hud-marker__inner" :style="innerStyle" role="img" :aria-label="t('hud.buildingHud.markerLabel', { building: m.name, level: m.level })">
            <span
              class="hud-marker__dial"
              @pointerenter="onPointerEnter(m.key, $event)"
              @pointerleave="onPointerLeave(m.key, $event)"
              @pointerdown="onPointerDown(m.key, $event)"
            >
              <BuildingHudDial
                :radius="DIAL_RADIUS"
                :ring="m.vm.dial.ring"
                :progress="m.vm.dial.progress"
                :label="labelOf(m)"
                :time="m.vm.dial.kind === 'upgrading'"
              />
            </span>
            <div v-if="rowsOf(m).length" class="hud-marker__box" :style="boxStyle(tierOf(m.key))">
              <BuildingHudBox :rows="rowsOf(m)" :tier="tierOf(m.key) === 'near' ? 'near' : 'mid'" />
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <button
      type="button"
      class="building-hud__toggle"
      :class="{ 'building-hud__toggle--desktop': !isMobile }"
      :aria-pressed="prefs.buildingInfo"
      :aria-label="t('hud.buildingHud.toggle.label')"
      :title="t('hud.buildingHud.toggle.title')"
      @click="toggle"
    >
      <!-- A hex dial with a quarter of its ring filled and a level mark inside. -->
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
        <path class="building-hud__toggle-hex" d="M12 2.5 20.2 7.25V16.75L12 21.5 3.8 16.75V7.25Z" />
        <path class="building-hud__toggle-arc" d="M12 2.5 20.2 7.25V16.75" />
        <path class="building-hud__toggle-mark" d="M10.4 10.4 12.3 9.2V14.8" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
/* Fills the map view; only the markers and the switch take the pointer. */
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
.building-hud-fade-enter-active,
.building-hud-fade-leave-active {
  transition: opacity 150ms ease;
}
.building-hud-fade-enter-from,
.building-hud-fade-leave-to {
  opacity: 0;
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
  /* Only the dial takes the pointer (like the progress dial); the box lets wheel zoom and drags through to the map. */
  pointer-events: none;
}
.hud-marker__dial {
  pointer-events: auto;
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
  padding-block: 4px;
  padding-right: 8px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-left: 0;
  border-radius: 0 8px 8px 0;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}
/* Icon button at the map's top left, under the header. Phone: below the settlement bubble that sits there (it ends about 44px
   under the bar). Desktop: right of the build queue's column, where its card sits. */
.building-hud__toggle {
  position: absolute;
  top: calc(var(--hud-inset-top, 0px) + 60px);
  left: calc(16px + var(--hud-inset-left, 0px));
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  color: var(--muted);
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  cursor: pointer;
}
.building-hud__toggle--desktop {
  top: calc(var(--hud-inset-top, 0px) + 12px);
  left: 268px;
}
.building-hud__toggle:hover {
  color: var(--text);
}
.building-hud__toggle[aria-pressed='true'] {
  color: var(--gold, #ffc55c);
  border-color: var(--gold, #ffc55c);
}
.building-hud__toggle:focus-visible {
  outline: 2px solid var(--gold, #ffc55c);
  outline-offset: 2px;
}
.building-hud__toggle svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.building-hud__toggle-arc {
  stroke: #ffd23f;
  stroke-width: 2.6;
}
.building-hud__toggle[aria-pressed='false'] .building-hud__toggle-arc {
  stroke: currentColor;
  opacity: 0.5;
}
</style>
