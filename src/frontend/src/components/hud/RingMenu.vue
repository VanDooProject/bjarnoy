<script setup lang="ts">
// Issue #16 "ring menu on click of tile", second pass — the "2a" design
// (Claude Design's `Tile Menu 2a`, chosen over four other directions).
//
// What changed against the previous concentric-orbit ring:
//  - At most TWO lanes are ever on screen: the current level's actions at
//    68px, and — once a build category is open — that category's buildings
//    at 118px. Drilling deeper *swaps* the inner lane instead of adding a
//    third orbit, so the footprint stops at ~140px from the tile rather than
//    growing to 216px. That was the reported pain: "distance between menu
//    points and the size, it gets too big too soon".
//  - Children fan out NEXT TO their parent bubble instead of being spread
//    around the whole circle, so which buildings belong to which category is
//    visible rather than inferred.
//  - The hub carries the tile itself (terrain + hex coordinate) and doubles
//    as the back control; a full-size "‹ BACK" bubble also holds a
//    permanently reserved slot on the inner lane, so it never moves and the
//    categories don't shift when it appears.
//  - Placement is edge-aware (see lib/map/ringLayout.ts): near a viewport
//    edge, or a HUD panel excluded via `bounds`, the ring opens into the free
//    half instead of being clipped, and the detail card docks clear of it.
//
// Interaction, uniform at every level: hover goes deeper, click commits,
// click on the hub or ‹ BACK goes up one level, Escape goes up and then
// closes. This component owns layout and navigation only — the caller
// supplies the tree and reacts to `select`, the same contract as before.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  BUB1,
  BUB2,
  CARD_W,
  DOT,
  HUB,
  LANE1,
  LANE2,
  layoutRing,
  type Rect,
} from '../../lib/map/ringLayout';

export interface RingAction {
  id: string;
  label: string;
  disabled?: boolean;
  /** Shown as a tooltip on a disabled action, e.g. why it's unavailable. */
  hint?: string;
  /** Overrides the bubble's tint; defaults to gold for `build`, plain text otherwise. */
  color?: string;
}

export interface RingBuilding extends RingAction {
  /** Resource cost, rendered as coloured hex chips in the detail card. */
  cost?: { wood?: number; stone?: number; food?: number; iron?: number };
  /** Formatted build duration, e.g. "4:00" (BuildingCatalogue's BuildDuration). */
  time?: string;
  /** One-line summary of what it produces. */
  gives?: string;
  /** Reason it can't be built yet, e.g. "Requires longhouse 2". */
  lock?: string;
  /** Art URL for the card thumbnail. */
  art?: string;
}

export interface RingCategory {
  id: string;
  label: string;
  /** Carried into this category's children as their border/fill tint. */
  color: string;
  buildings: RingBuilding[];
}

const props = withDefaults(
  defineProps<{
    x: number;
    y: number;
    /** Root actions. The action with id `build` is the gateway to `categories`. */
    actions: RingAction[];
    /** Build categories; empty for a flat, one-level ring (LandingView's onboarding). */
    categories?: RingCategory[];
    /** Hub line 1 at root level, e.g. "Grassland". */
    terrainLabel?: string;
    /** Hub line 2 at root level, e.g. "HEX 4, −2". */
    coordLabel?: string;
    /**
     * Area the RING must stay inside, in the same coordinate space as x/y.
     * Shrink it to keep clear of the HUD panels. Defaults to the window minus
     * a 16px margin and the 64px top bar.
     */
    bounds?: Rect;
    /**
     * Area the detail CARD may occupy. Deliberately separate: `bounds` exists
     * to keep the ring out from under the HUD panels, but what's left over
     * once every panel is reserved (~308×404 at 1280×720) cannot hold a
     * 200×222 card anywhere clear of the ring — so the card would land on the
     * menu. A card briefly overlapping a panel is far less harmful than one
     * covering the menu. Defaults to the window minus the top bar.
     */
    cardBounds?: Rect;
    /** Stock, used to mark a cost the player can't currently afford. */
    stock?: { wood: number; stone: number; food: number; iron: number };
  }>(),
  { categories: () => [], terrainLabel: '', coordLabel: '', bounds: undefined, cardBounds: undefined, stock: undefined },
);

const emit = defineEmits<{
  select: [id: string];
  close: [];
  // A mousedown on the backdrop (not a bubble) hands the same PointerEvent
  // back so the caller can turn that one gesture straight into a map drag —
  // a plain `close` on click only fires on release, too late for that.
  outsidePointerDown: [event: PointerEvent];
}>();

/** [] = root · ['build'] = categories · ['build', catId] = that category's buildings. */
const path = ref<string[]>([]);
const hover = ref<string | null>(null);

const viewport = ref({ w: window.innerWidth, h: window.innerHeight });
function onResize() {
  viewport.value = { w: window.innerWidth, h: window.innerHeight };
}
// Escape walks back up the way ‹ BACK does, and only closes from the root —
// otherwise one keypress throws away a drill-down the player just made.
function onWindowKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  if (path.value.length) goUp();
  else emit('close');
}
onMounted(() => {
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onWindowKeydown);
});
onUnmounted(() => {
  window.removeEventListener('resize', onResize);
  window.removeEventListener('keydown', onWindowKeydown);
});
// Re-opening on another tile must start at the root, not wherever the last
// tile's menu was left.
watch(
  () => [props.x, props.y],
  () => {
    path.value = [];
    hover.value = null;
  },
);

const area = computed<Rect>(
  () => props.bounds ?? { left: 16, top: 76, right: viewport.value.w - 16, bottom: viewport.value.h - 16 },
);
const cardArea = computed<Rect>(
  () => props.cardBounds ?? { left: 16, top: 76, right: viewport.value.w - 16, bottom: viewport.value.h - 16 },
);

const activeCategory = computed(() => props.categories.find((c) => c.id === path.value[1]) ?? null);
const atRoot = computed(() => path.value.length === 0);
/** Inner-lane entries: root actions, or the categories once `build` is open. */
const laneItems = computed<RingAction[]>(() => (atRoot.value ? props.actions : props.categories));
/**
 * Past the root, the inner lane permanently reserves one extra slot for
 * ‹ BACK — so the categories keep identical positions whether or not a
 * category is currently open.
 */
const laneCount = computed(() => (atRoot.value ? props.actions.length : props.categories.length + 1));
const buildings = computed<RingBuilding[]>(() => activeCategory.value?.buildings ?? []);

const hoveredIndex = computed(() => {
  const i = buildings.value.findIndex((b) => b.id === hover.value);
  return i >= 0 ? i : null;
});
// No card until a building is genuinely hovered — opening the ring must not
// preselect one and pop a card the player didn't ask for.
const hovered = computed(() => (hoveredIndex.value === null ? null : buildings.value[hoveredIndex.value]));

const layout = computed(() =>
  layoutRing({
    x: props.x,
    y: props.y,
    area: area.value,
    cardArea: cardArea.value,
    lane1Count: laneCount.value,
    lane2Count: buildings.value.length,
    parentIndex: activeCategory.value ? props.categories.indexOf(activeCategory.value) : -1,
    cardAnchor: hoveredIndex.value,
  }),
);

const lane1 = computed(() =>
  laneItems.value.map((item, i) => {
    const spot = layout.value.lane1[i];
    const active = !!activeCategory.value && item.id === activeCategory.value.id;
    return {
      item,
      x: spot.x,
      y: spot.y,
      active,
      dim: !!activeCategory.value && !active,
      color: item.color ?? (item.id === 'build' ? 'var(--gold)' : 'var(--text)'),
    };
  }),
);
/** ‹ BACK owns the reserved last slot, and stays full size even when the rest collapse to dots. */
const backSpot = computed(() => (atRoot.value ? null : (layout.value.lane1[props.categories.length] ?? null)));

const lane2 = computed(() => {
  const category = activeCategory.value;
  const parent = category ? layout.value.lane1[props.categories.indexOf(category)] : null;
  if (!category || !parent) return [];
  return buildings.value.map((building, i) => ({
    building,
    x: layout.value.lane2[i].x,
    y: layout.value.lane2[i].y,
    parentX: parent.x,
    parentY: parent.y,
    color: category.color,
  }));
});

const RESOURCE_COLORS = { wood: 'var(--wood)', stone: 'var(--stone)', food: 'var(--food)', iron: 'var(--iron)' } as const;
const costChips = computed(() => {
  const cost = hovered.value?.cost;
  if (!cost) return [];
  return (['wood', 'stone', 'food', 'iron'] as const)
    .filter((key) => !!cost[key])
    .map((key) => ({
      key,
      color: RESOURCE_COLORS[key],
      amount: cost[key]!,
      short: !!props.stock && cost[key]! > props.stock[key],
    }));
});

const hubLabel = computed(() => (atRoot.value ? props.terrainLabel : 'BUILD'));
const hubSub = computed(() => (atRoot.value ? props.coordLabel : props.terrainLabel));

function goUp() {
  if (path.value.length) {
    path.value = path.value.slice(0, -1);
    hover.value = null;
  } else {
    emit('close');
  }
}
// Hover drills in; it never commits. Only the two navigation transitions
// (root "build", and picking a category) advance — every other action either
// mutates state or is terminal, so it still needs a real click.
function onLaneEnter(item: RingAction) {
  if (item.disabled) return;
  if (atRoot.value) {
    if (item.id === 'build' && props.categories.length) path.value = ['build'];
    return;
  }
  if (props.categories.some((c) => c.id === item.id)) {
    path.value = ['build', item.id];
    hover.value = null;
  }
}
function onLaneClick(item: RingAction) {
  if (item.disabled) return;
  if (atRoot.value) {
    if (item.id === 'build' && props.categories.length) path.value = ['build'];
    else emit('select', item.id);
    return;
  }
  if (props.categories.some((c) => c.id === item.id)) path.value = ['build', item.id];
}
function onBuildingClick(building: RingBuilding) {
  if (building.lock || building.disabled) return;
  emit('select', building.id);
}
function onBackdropPointerDown(e: PointerEvent) {
  emit('outsidePointerDown', e);
}
</script>

<template>
  <div class="ring-backdrop" @pointerdown.self="onBackdropPointerDown" @contextmenu.prevent="emit('close')">
    <div
      v-if="layout.showLane1Track"
      class="ring-track"
      :style="{ left: `${x - LANE1}px`, top: `${y - LANE1}px`, width: `${LANE1 * 2}px`, height: `${LANE1 * 2}px` }"
    />
    <div
      v-if="layout.showLane2Track"
      class="ring-track faint"
      :style="{ left: `${x - LANE2}px`, top: `${y - LANE2}px`, width: `${LANE2 * 2}px`, height: `${LANE2 * 2}px` }"
    />
    <!-- The lane was displaced clear of a panel, so there's no orbit around
         the tile to draw — this connects the hex to where the menu went. -->
    <div
      v-if="layout.leader"
      class="ring-leader"
      :style="{
        left: `${layout.leader.x}px`,
        top: `${layout.leader.y}px`,
        width: `${layout.leader.len}px`,
        transform: `rotate(${layout.leader.deg}deg)`,
      }"
    />
    <div
      v-for="b in lane2"
      :key="`link-${b.building.id}`"
      class="ring-link"
      :style="{
        left: `${b.parentX}px`,
        top: `${b.parentY}px`,
        width: `${Math.hypot(b.x - b.parentX, b.y - b.parentY)}px`,
        transform: `rotate(${(Math.atan2(b.y - b.parentY, b.x - b.parentX) * 180) / Math.PI}deg)`,
        background: b.color,
      }"
    />

    <button
      class="ring-hub"
      :style="{ left: `${x}px`, top: `${y}px`, width: `${HUB}px`, height: `${HUB}px` }"
      :title="atRoot ? undefined : 'Back'"
      @click="goUp"
    >
      <span class="hub-label">{{ hubLabel }}</span>
      <span v-if="hubSub" class="hub-sub">{{ hubSub }}</span>
    </button>

    <button
      v-for="entry in lane1"
      :key="entry.item.id"
      class="ring-bubble"
      :class="{ active: entry.active, dim: entry.dim, disabled: entry.item.disabled, dot: layout.collapsed }"
      :style="{
        left: `${entry.x}px`,
        top: `${entry.y}px`,
        width: `${layout.collapsed ? DOT : BUB1}px`,
        height: `${layout.collapsed ? DOT : BUB1}px`,
        fontSize: entry.item.label.length > 7 ? '8.2px' : '9.2px',
        '--tint': entry.color,
      }"
      :disabled="entry.item.disabled"
      :title="entry.item.disabled ? entry.item.hint : layout.collapsed ? entry.item.label : undefined"
      :aria-label="entry.item.label"
      @click="onLaneClick(entry.item)"
      @mouseenter="onLaneEnter(entry.item)"
    >
      <template v-if="!layout.collapsed">{{ entry.item.label }}</template>
    </button>

    <button
      v-if="backSpot"
      class="ring-bubble back"
      :style="{ left: `${backSpot.x}px`, top: `${backSpot.y}px`, width: `${BUB1}px`, height: `${BUB1}px` }"
      @click="goUp"
    >
      ‹ BACK
    </button>

    <button
      v-for="b in lane2"
      :key="b.building.id"
      class="ring-bubble child"
      :class="{ hot: hover === b.building.id, locked: !!b.building.lock, disabled: b.building.disabled }"
      :style="{
        left: `${b.x}px`,
        top: `${b.y}px`,
        width: `${BUB2}px`,
        height: `${BUB2}px`,
        fontSize: b.building.label.length > 7 ? '8.4px' : '9.4px',
        '--tint': b.color,
      }"
      :title="b.building.lock"
      @click="onBuildingClick(b.building)"
      @mouseenter="hover = b.building.id"
    >
      {{ b.building.label }}
    </button>

    <div
      v-if="hovered && layout.card"
      class="ring-card"
      :style="{ left: `${layout.card.x}px`, top: `${layout.card.y}px`, width: `${CARD_W}px` }"
    >
      <div class="card-art">
        <img v-if="hovered.art" :src="hovered.art" alt="" />
        <div class="card-head">
          <span class="card-name">{{ hovered.label }}</span>
          <span class="card-sub">Level 1 · {{ hovered.lock ? 'locked' : 'ready' }}</span>
          <span class="card-badge" :class="{ locked: !!hovered.lock }">
            {{ hovered.lock ? hovered.lock.toUpperCase() : 'BUILDABLE HERE' }}
          </span>
        </div>
      </div>
      <dl class="card-rows">
        <template v-if="costChips.length">
          <dt>Cost</dt>
          <dd class="cost">
            <span v-for="chip in costChips" :key="chip.key" class="chip">
              <i :style="{ background: chip.color }" />
              <b :class="{ short: chip.short }">{{ chip.amount }}</b>
            </span>
          </dd>
        </template>
        <template v-if="hovered.time">
          <dt>Build time</dt>
          <dd>{{ hovered.time }}</dd>
        </template>
        <template v-if="hovered.gives">
          <dt>Gives</dt>
          <dd class="nowrap">{{ hovered.gives }}</dd>
        </template>
      </dl>
      <button
        class="card-cta"
        :class="{ locked: !!hovered.lock }"
        :disabled="!!hovered.lock || !!hovered.disabled"
        @click="onBuildingClick(hovered)"
      >
        {{ hovered.lock ? 'LOCKED' : `BUILD ${hovered.label.toUpperCase()}` }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ring-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
}
.ring-track {
  position: absolute;
  border-radius: 50%;
  border: 1.5px dashed rgba(255, 255, 255, 0.45);
  pointer-events: none;
  /* A plain low-alpha stroke washes out over bright terrain and fog; the
     drop-shadow gives the track a dark halo so it reads over both. */
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
}
.ring-track.faint {
  border-color: rgba(255, 255, 255, 0.16);
}
.ring-leader {
  position: absolute;
  height: 0;
  border-top: 1.5px dashed rgba(255, 197, 92, 0.6);
  transform-origin: 0 50%;
  pointer-events: none;
}
.ring-link {
  position: absolute;
  height: 1px;
  opacity: 0.45;
  transform-origin: 0 50%;
  pointer-events: none;
}
.ring-hub,
.ring-bubble {
  position: absolute;
  pointer-events: auto;
  transform: translate(-50%, -50%);
  font-family: inherit;
  cursor: pointer;
}
.ring-hub {
  border: none;
  border-radius: 50%;
  background: var(--gold);
  color: #20160a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.5);
}
.ring-hub:hover {
  filter: brightness(1.08);
}
.hub-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.hub-sub {
  font-size: 8px;
  font-weight: 500;
  letter-spacing: 0.05em;
  opacity: 0.55;
  text-transform: uppercase;
}
.ring-bubble {
  border-radius: 50%;
  padding: 0 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.12;
  letter-spacing: 0.02em;
  font-weight: 600;
  /* A long single word ("Watchtower") has nowhere to break otherwise and just
     overflows the circle; natural word boundaries still win first. */
  overflow-wrap: anywhere;
  background: rgba(8, 18, 26, 0.9);
  border: 1px solid color-mix(in oklab, var(--tint) 50%, transparent);
  color: var(--tint);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}
.ring-bubble:hover:not(.disabled) {
  background: color-mix(in oklab, var(--tint) 18%, rgba(8, 18, 26, 0.9));
}
.ring-bubble.active {
  background: color-mix(in oklab, var(--tint) 24%, rgba(8, 18, 26, 0.9));
  border: 1.5px solid var(--tint);
  color: #fff;
  font-weight: 700;
}
.ring-bubble.dim {
  background: rgba(8, 18, 26, 0.55);
  border-color: rgba(255, 255, 255, 0.14);
  color: rgba(232, 240, 245, 0.45);
}
.ring-bubble.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
/* Two full lanes didn't fit: the spent inner lane shrinks to markers so the
   buildings lane has somewhere to go, rather than the two overlapping. */
.ring-bubble.dot {
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.4);
  background: color-mix(in oklab, var(--tint) 55%, transparent);
  box-shadow: none;
}
.ring-bubble.dot.active {
  background: var(--tint);
}
.ring-bubble.back {
  background: rgba(8, 18, 26, 0.92);
  border: 1px solid rgba(255, 197, 92, 0.6);
  color: var(--gold);
  font-size: 8.6px;
  font-weight: 700;
  white-space: nowrap;
}
.ring-bubble.child {
  background: rgba(14, 24, 20, 0.94);
  color: var(--text);
}
.ring-bubble.child.hot {
  background: color-mix(in oklab, var(--tint) 92%, transparent);
  color: #12200c;
  font-weight: 700;
}
.ring-bubble.child.locked {
  border-style: dashed;
  border-color: rgba(226, 112, 95, 0.5);
  color: rgba(240, 163, 150, 0.85);
  background: rgba(14, 24, 20, 0.94);
  cursor: not-allowed;
}
.ring-card {
  position: absolute;
  pointer-events: auto;
  overflow: hidden;
  border-radius: 11px;
  background: rgba(10, 20, 27, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 22px 50px rgba(0, 0, 0, 0.6);
  color: var(--text);
}
.card-art {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: radial-gradient(90% 80% at 50% 40%, #1a3d4d, #0d1f29);
}
.card-art img {
  width: 50px;
  height: 78px;
  object-fit: contain;
  flex: none;
}
.card-head {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.card-name {
  font-size: 15px;
  font-weight: 700;
}
.card-sub {
  margin-top: 2px;
  font-size: 10px;
  font-weight: 500;
  color: var(--muted);
}
.card-badge {
  margin-top: 6px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--food);
}
.card-badge.locked {
  color: var(--rival);
}
.card-rows {
  margin: 0;
  padding: 11px 12px 0;
  display: grid;
  grid-template-columns: auto 1fr;
  row-gap: 8px;
  column-gap: 10px;
  font-size: 10.5px;
}
.card-rows dt {
  color: var(--muted);
  font-weight: 400;
}
.card-rows dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}
.card-rows dd.nowrap {
  white-space: nowrap;
}
.card-rows dd.cost {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.chip i {
  width: 8px;
  height: 8px;
  flex: none;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
.chip b.short {
  color: var(--rival);
}
.card-cta {
  margin: 11px 12px 12px;
  width: calc(100% - 24px);
  padding: 9px 0;
  border: none;
  border-radius: 8px;
  background: var(--gold);
  color: #20160a;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
}
.card-cta.locked,
.card-cta:disabled {
  background: rgba(255, 197, 92, 0.22);
  color: #8a7448;
  cursor: not-allowed;
}
</style>
