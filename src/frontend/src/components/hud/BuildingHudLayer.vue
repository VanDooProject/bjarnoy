<script setup lang="ts">
// The building HUD: over every own building of the settlement view a marker (a hex dial with the level or the upgrade
// countdown, and, near and mid, a box docked to it). What a marker shows is lib/hud/buildingHud.ts; this layer feeds it from
// the stores, keeps the markers on their buildings frame by frame (CSS transforms written straight to the elements, like
// composables/useMapAnchor.ts, no Vue re-render per frame) and owns the toggle (switch button and the H key).
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
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
import {
  HUD_DIAL_RADIUS,
  buildingHudViewModel,
  rowsFor,
  stackOrder,
  tierFor,
  type HudRow,
  type HudTier,
} from '../../lib/hud/buildingHud';
import { formatCountdownShort } from '../../lib/hud/countdown';
import { boostContextAt, type BuildingKind } from '../../lib/map/buildingEconomy';
import { isWallBuilding } from '../../lib/map/ringCatalogue';
import BuildingHudBox from './BuildingHudBox.vue';
import BuildingHudDial from './BuildingHudDial.vue';

/** The slice of HexMapRenderer the layer reads — kept narrow so tests (and other hosts) can hand it a stand-in. */
export interface BuildingHudRenderer {
  /** Screen point the dial's bottom centre sits at: above the building, lifted off the hex's centre. */
  dialScreenPoint(coord: AxialCoord): { x: number; y: number };
  readonly cameraZoom: number;
  /** The zoom the settlement view lands on; the tiers are measured against it. */
  readonly settlementBaseZoom: number;
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

const tier = ref<HudTier>('mid');
/** Zoom the tiers are measured against: captured the first frame the renderer has one, again for another settlement. */
let baseZoom: number | null = null;

// Walls and bridges have no level to show; every other building gets a marker.
const hasMarker = (type: string) => !isWallBuilding(type) && type !== 'bridge';

interface Marker {
  key: string;
  coord: AxialCoord;
  name: string;
  level: number;
  ring: 'ready' | 'blocked' | 'upgrading' | 'max';
  progress?: number;
  label: string;
  time: boolean;
  rows: HudRow[];
  radius: number;
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
  const radius = HUD_DIAL_RADIUS[tier.value];
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
      // A running upgrade shows its countdown inside the dial; far has no room, so it keeps the level.
      const countdown = vm.dial.kind === 'upgrading' && tier.value !== 'far';
      return {
        key: `${b.q},${b.r}`,
        coord,
        name: buildingName(b.type),
        level: b.level,
        ring: vm.dial.ring,
        progress: vm.dial.progress,
        label: countdown ? formatCountdownShort(vm.dial.secondsLeft ?? 0) : String(b.level),
        time: countdown,
        rows: rowsFor(vm, tier.value, { premium: auth.isPremium }),
        radius,
      };
    });
});

// ---- geometry (port of the design reference's dock8Html) ------------------------------------------------------------------

function dialPad(radius: number): number {
  return (6 * radius) / 27.5 / 2 + 1;
}

function innerStyle(radius: number) {
  const size = 2 * (radius + dialPad(radius));
  return {
    left: `${-(radius + dialPad(radius))}px`,
    top: `${-size - 2}px`,
    height: `${size}px`,
    transformOrigin: `${radius + dialPad(radius)}px 100%`,
  };
}

/** The box starts on the dial's vertical centre line, behind the dial, with its text clear of the dial's right half. */
function boxStyle(radius: number, currentTier: HudTier) {
  const half = (radius * Math.sqrt(3)) / 2;
  return {
    maxHeight: `${2 * radius}px`,
    marginLeft: `${-(radius + dialPad(radius))}px`,
    paddingLeft: `${half + (currentTier === 'near' ? 9 : 7)}px`,
  };
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

function tick() {
  frame = requestAnimationFrame(tick);
  const renderer = props.renderer;
  if (!renderer || !prefs.buildingInfo) return;
  baseZoom ??= renderer.settlementBaseZoom;
  if (baseZoom > 0) {
    const next = tierFor(renderer.cameraZoom / baseZoom, tier.value);
    if (next !== tier.value) tier.value = next;
  }
  const width = root.value?.offsetWidth ?? window.innerWidth;
  const height = root.value?.offsetHeight ?? window.innerHeight;
  const placed: { key: string; x: number }[] = [];
  for (const marker of markers.value) {
    const el = elements.get(marker.key);
    if (!el) continue;
    const { x, y } = renderer.dialScreenPoint(marker.coord);
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    // A marker well off screen is not worth compositing.
    el.style.visibility = x < -320 || x > width + 320 || y < -120 || y > height + 400 ? 'hidden' : 'visible';
    placed.push({ key: marker.key, x });
  }
  // Right-most on top.
  stackOrder(placed).forEach((p, i) => {
    if (lastZ.get(p.key) === i) return;
    lastZ.set(p.key, i);
    elements.get(p.key)!.style.zIndex = String(i);
  });
}

watch([() => props.renderer, () => world.selectedSettlementId], () => {
  baseZoom = null;
});

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
});
onUnmounted(() => {
  cancelAnimationFrame(frame);
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <div ref="root" class="building-hud">
    <Transition name="building-hud-fade">
      <div v-if="prefs.buildingInfo" class="building-hud__markers">
        <div v-for="m in markers" :key="m.key" :ref="(el) => setElement(m.key, el)" class="hud-marker" :data-coord="m.key" :data-tier="tier">
          <div class="hud-marker__inner" :style="innerStyle(m.radius)" role="img" :aria-label="t('hud.buildingHud.markerLabel', { building: m.name, level: m.level })">
            <span class="hud-marker__dial">
              <BuildingHudDial :radius="m.radius" :ring="m.ring" :progress="m.progress" :label="m.label" :time="m.time" />
            </span>
            <div v-if="m.rows.length && tier !== 'far'" class="hud-marker__box" :style="boxStyle(m.radius, tier)">
              <BuildingHudBox :rows="m.rows" :tier="tier" />
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <button
      type="button"
      role="switch"
      class="building-hud__switch"
      :aria-checked="prefs.buildingInfo"
      :title="t('hud.buildingHud.toggle.shortcut')"
      @click="toggle"
    >
      <span class="building-hud__knob" aria-hidden="true" />
      <span>{{ t('hud.buildingHud.toggle.label') }}</span>
      <kbd v-if="!isMobile" aria-hidden="true">{{ t('hud.buildingHud.toggle.key') }}</kbd>
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
/* The marker is a zero-size anchor at the dial's bottom centre; the placement loop moves it. */
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
  pointer-events: auto;
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
  padding-block: 4px;
  padding-right: 8px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-left: 0;
  border-radius: 0 8px 8px 0;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}
.building-hud__switch {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(16px + var(--hud-inset-bottom, 0px) + env(safe-area-inset-bottom, 0px));
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 4px 10px 4px 6px;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  cursor: pointer;
}
.building-hud__switch:focus-visible {
  outline: 2px solid var(--gold, #ffc55c);
  outline-offset: 2px;
}
.building-hud__knob {
  position: relative;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  transition: background 0.15s;
}
.building-hud__knob::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.18s cubic-bezier(0.3, 1.4, 0.5, 1);
}
.building-hud__switch[aria-checked='true'] .building-hud__knob {
  background: var(--gold, #ffc55c);
}
.building-hud__switch[aria-checked='true'] .building-hud__knob::after {
  transform: translateX(14px);
}
.building-hud__switch kbd {
  font: inherit;
  font-size: 11px;
  color: var(--muted);
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  padding: 0 5px;
}
@media (prefers-reduced-motion: reduce) {
  .building-hud__knob,
  .building-hud__knob::after {
    transition: none;
  }
}
</style>
