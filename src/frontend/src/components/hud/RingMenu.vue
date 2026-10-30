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
// Interaction, uniform at every level: click goes deeper (Build opens its
// categories, a category opens its buildings) and click commits, click on the
// hub or ‹ BACK goes up one level, Escape goes up and then closes. Hover never
// navigates — it only previews: hovering a building (or the root Upgrade /
// Details bubble) shows its read-out card. This component owns layout and
// navigation only — the caller supplies the tree and reacts to `select`.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AtlasSprite from '../AtlasSprite.vue';
import type { ArtRef } from '../../lib/map/buildingArt';
import type { MessageSchema } from '../../i18n/schema';
import { resourceName } from '../../i18n/catalogueNames';
import { formatBuildTime } from '../../lib/map/ringCatalogue';
import { isActionable, type RingAvailability, type RingAvailabilityState } from '../../lib/map/ringAvailability';
import { tapArm, type RingDock } from '../../lib/map/ringDock';
import { ringFootprint } from '../../lib/map/markerOcclusion';
import { motionEnabled, supportsWaapi } from '../../lib/motion';
import * as ringMotion from '../../lib/map/ringMotion';
import {
  BUB1,
  BUB2,
  CARD_W,
  DOT,
  HUB,
  LANE1,
  LANE2,
  layoutRing,
  NOTE_W,
  type Rect,
  bubbleLabelFontPx,
  estimateWordEm,
  type WordEmWidth,
} from '../../lib/map/ringLayout';

export interface RingAction {
  id: string;
  label: string;
  disabled?: boolean;
  /** Shown beside a disabled action on hover, e.g. why it's unavailable. */
  hint?: string;
  /** Overrides the bubble's tint; defaults to gold for `build`, plain text otherwise. */
  color?: string;
  /**
   * Availability look for a bubble that is disabled for a *reason worth
   * explaining*: `locked` (progression) gets a lock badge, `waiting`
   * (resources / slots) a clock badge. A `disabled` action without a state
   * gets the plain "not possible here" look (ban badge + hint chip).
   */
  state?: RingAvailabilityState;
  /** Read-out card shown while this root action is hovered (Upgrade). */
  card?: RingCard;
  /** Info card shown while this root action is hovered (Details). */
  info?: RingInfo;
}

/** What a detail card for a buildable thing (a building, or an upgrade) shows. */
export interface RingCard {
  title: string;
  /** Second line under the title, e.g. "Level 1" or "Level 2 → 3". */
  sub?: string;
  /** Resource cost, rendered as coloured hex chips in the detail card. */
  cost?: { wood?: number; stone?: number; food?: number; iron?: number };
  /** Formatted build duration, e.g. "4:00" (BuildingCatalogue's BuildDuration). */
  time?: string;
  /** One-line summary of what it produces. */
  gives?: string;
  /** Progression blockers (longhouse level, prerequisites, limits), each as a sentence. */
  locks?: string[];
  /** A non-blocking caution (the building can still be placed), e.g. wild beasts burning an unguarded tower. */
  warning?: string;
  /** Art for the card thumbnail. */
  art?: ArtRef;
  availability?: RingAvailability;
}

/** A purely informational card: the tile's own facts (the Details bubble's hover). */
export interface RingInfo {
  title: string;
  sub?: string;
  art?: ArtRef;
  rows: { label: string; value: string }[];
}

export interface RingBuilding extends RingAction, Omit<RingCard, 'title'> {
  /** Level the card shows (1 for a new building). */
  level?: number;
  /** The first progression blocker, kept for callers that pass a single sentence; `locks` wins when both are given. */
  lock?: string;
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
    /**
     * Spendable stock (`hud.available`: stock minus the waiting queue's
     * reservation), used to mark a cost the player can't currently afford
     * when a card carries no `availability` of its own.
     */
    stock?: { wood: number; stone: number; food: number; iron: number };
    /**
     * Why the last upgrade (or an instant, demo-mode placement) from this ring
     * was refused. The ring stays open and shows it — on the card when one is
     * up, otherwise as a chip docked beside the ring. A live-mode build from
     * the building fan no longer comes back here: it closes the ring at once
     * and a refusal shows under the hex instead (MapView's `buildFromRing`).
     */
    error?: string | null;
    /**
     * Phone layout: dock the detail card to a screen edge (a bottom strip in
     * portrait, a side panel in landscape — see lib/map/ringDock.ts) instead
     * of floating it beside the ring. Null keeps the floating desktop card.
     */
    dock?: RingDock | null;
    /**
     * Design handoff "2a": a persistent, muted explanation shown beside a
     * flat ring (no `categories`) — e.g. why the one disabled guided
     * building doesn't fit this hex. Explains the *hex*, not the click, so
     * it reads as information rather than an error. Ignored once the ring
     * has categories: a drilled-in ring shows its own per-building detail
     * card instead.
     */
    note?: { title: string; body: string } | null;
  }>(),
  {
    categories: () => [],
    terrainLabel: '',
    coordLabel: '',
    bounds: undefined,
    cardBounds: undefined,
    stock: undefined,
    error: null,
    dock: null,
    note: null,
  },
);

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const emit = defineEmits<{
  select: [id: string];
  close: [];
  // A mousedown on the backdrop (not a bubble) hands the same PointerEvent
  // back so the caller can turn that one gesture straight into a map drag —
  // a plain `close` on click only fires on release, too late for that.
  outsidePointerDown: [event: PointerEvent];
  // Design handoff "2a": the screen spot of every current lane1 bubble, by
  // action id — GuidancePointer.vue aims at the enabled guided building's
  // spot for the onboarding ring (frame 3, "This one fits {terrain}").
  layout: [spots: Record<string, { x: number; y: number }>];
  // The circle the open ring covers on screen (hub to the far edge of the
  // farthest bubble, outer lane included); re-emitted as the buildings lane
  // opens and closes. MapView hands it to the renderer so canvas markers
  // beneath the ring fade out.
  footprint: [circle: { x: number; y: number; r: number }];
}>();

/** [] = root · ['build'] = categories · ['build', catId] = that category's buildings. */
const path = ref<string[]>([]);
/** The backdrop element: the choreography in lib/map/ringMotion.ts finds the bubbles, links and hub inside it. */
const rootEl = ref<HTMLElement | null>(null);
/** A layer swap is animating; navigation clicks are ignored until it has landed. */
const swapping = ref(false);
const hover = ref<string | null>(null);
/** The root / category bubble under the pointer — only to preview its card or hint chip, never to navigate. */
const hoverLane1 = ref<string | null>(null);
/**
 * Touch only: the bubble the first tap "armed" (its card is showing); a second
 * tap on it commits. Mouse hover never arms — a mouse previews by hovering.
 */
const armed = ref<string | null>(null);

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
// The top HUD bar sits above this ring's backdrop (TopBar.vue's z-index 40
// vs. the backdrop's 30, so header buttons keep working while a ring is
// open) and takes every click on it itself — none reach the backdrop or the
// map. A press anywhere on the bar is still an "outside" press for the ring,
// though, so close it — just not via `outsidePointerDown`, which would also
// start a map drag from a gesture that never touched the map.
function onWindowPointerDown(e: PointerEvent) {
  if ((e.target as Element | null)?.closest?.('.hud-bar')) emit('close');
}
onMounted(() => {
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onWindowKeydown);
  window.addEventListener('pointerdown', onWindowPointerDown, true);
  // O1: the hub grows, then the bubbles bloom out of it.
  if (rootEl.value) void ringMotion.openRing(rootEl.value);
});
onUnmounted(() => {
  window.removeEventListener('pointerdown', onWindowPointerDown, true);
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
    hoverLane1.value = null;
    armed.value = null;
  },
);
watch(path, () => {
  armed.value = null;
});

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
/** Index (on the inner lane) of the hovered root bubble that has a card or info to show. */
const hoveredLane1Index = computed(() => {
  const i = laneItems.value.findIndex((item) => item.id === hoverLane1.value);
  if (i < 0 || !atRoot.value) return null;
  const item = laneItems.value[i];
  return item.card || item.info ? i : null;
});
/**
 * A disabled root bubble with a reason, hovered: its hint shows as a chip beside it.
 * Not for a bubble with its own card (Upgrade): the card already lists the reasons.
 */
const hintedLane1 = computed(() => {
  if (!atRoot.value) return null;
  const entry = lane1.value.find((e) => e.item.id === hoverLane1.value);
  if (!entry || !entry.item.disabled || !entry.item.hint || entry.item.card) return null;
  return entry;
});

const layout = computed(() =>
  layoutRing({
    x: props.x,
    y: props.y,
    area: area.value,
    cardArea: cardArea.value,
    lane1Count: laneCount.value,
    lane2Count: buildings.value.length,
    parentIndex: activeCategory.value ? props.categories.indexOf(activeCategory.value) : -1,
    // A docked card lives at a screen edge, so the ring doesn't make room for it.
    cardAnchor: props.dock ? null : hoveredIndex.value,
    lane1CardAnchor: props.dock ? null : hoveredLane1Index.value,
    wantsNote: !!props.note || !!props.error,
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
      state: item.state,
      // A disabled bubble with no availability state is the plain "can't do
      // that here" look; one with a state explains itself with a badge instead.
      ban: !!item.disabled && !item.state,
      color: item.color ?? (item.id === 'build' ? 'var(--gold)' : 'var(--text)'),
    };
  }),
);
/** ‹ BACK owns the reserved last slot, and stays full size even when the rest collapse to dots. */
const backSpot = computed(() => (atRoot.value ? null : (layout.value.lane1[props.categories.length] ?? null)));

// Re-emitted whenever a bubble's placement actually changes (opening,
// re-anchoring, an edge-case reflow) — not a one-off at mount, since the
// caller's pointer needs to track the same spot the bubble is drawn at.
watch(
  lane1,
  (entries) => {
    const spots: Record<string, { x: number; y: number }> = {};
    for (const entry of entries) spots[entry.item.id] = { x: entry.x, y: entry.y };
    emit('layout', spots);
  },
  { immediate: true },
);

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

const footprint = computed(() => {
  const backIndex = atRoot.value ? -1 : props.categories.length;
  const bubbles = layout.value.lane1.map((spot, i) => ({
    x: spot.x,
    y: spot.y,
    // The reserved back slot stays full size even when the rest collapse to dots.
    r: (layout.value.collapsed && i !== backIndex ? DOT : BUB1) / 2,
  }));
  if (lane2.value.length > 0) for (const b of lane2.value) bubbles.push({ x: b.x, y: b.y, r: BUB2 / 2 });
  return ringFootprint({ x: props.x, y: props.y }, bubbles, HUB / 2);
});
watch(footprint, (circle) => emit('footprint', circle), { immediate: true });

const RESOURCE_COLORS = { wood: 'var(--wood)', stone: 'var(--stone)', food: 'var(--food)', iron: 'var(--iron)' } as const;
const RESOURCE_KEYS = ['wood', 'stone', 'food', 'iron'] as const;

/** A building's own fields as the card shape the hover card renders. */
function cardOf(b: RingBuilding): RingCard {
  return {
    title: b.label,
    sub: t('hud.ringMenu.card.level', { level: b.level ?? 1 }),
    cost: b.cost,
    time: b.time,
    gives: b.gives,
    locks: b.locks?.length ? b.locks : b.lock ? [b.lock] : [],
    warning: b.warning,
    art: b.art,
    availability: b.availability,
  };
}

/** What state a building bubble is in: a lock wins, otherwise whatever the availability says. */
function stateOf(b: RingBuilding): RingAvailabilityState {
  if (b.lock || b.locks?.length) return 'locked';
  return b.state ?? b.availability?.state ?? 'ready';
}

const activeCard = computed<RingCard | null>(() => {
  if (hovered.value) return cardOf(hovered.value);
  const item = hoveredLane1Index.value === null ? null : laneItems.value[hoveredLane1Index.value];
  return item?.card ?? null;
});
const activeInfo = computed<RingInfo | null>(() => {
  if (hovered.value || hoveredLane1Index.value === null) return null;
  return laneItems.value[hoveredLane1Index.value].info ?? null;
});

type Tone = 'lock' | 'wait' | 'queue';
interface CardView {
  title: string;
  sub?: string;
  art?: ArtRef;
  badge?: { text: string; tone: 'ok' | Tone };
  chips: { key: string; color: string; amount: number; short: boolean }[];
  time?: string;
  gives?: string;
  slots?: { text: string; short: boolean };
  rows: { label: string; value: string }[];
  warning?: string;
  statuses: { text: string; tone: Tone }[];
  /** Touch: "Tap X again to build" — only while the shown item is armed and committable. */
  tapHint?: string;
}

function resourceList(shortfall: Partial<Record<(typeof RESOURCE_KEYS)[number], number>>): string {
  return RESOURCE_KEYS.filter((key) => shortfall[key])
    .map((key) => `${shortfall[key]} ${resourceName(key)}`)
    .join(' · ');
}

const cardView = computed<CardView | null>(() => {
  const info = activeInfo.value;
  if (info) {
    return { title: info.title, sub: info.sub, art: info.art, chips: [], rows: info.rows, statuses: [], tapHint: tapHint.value };
  }
  const card = activeCard.value;
  if (!card) return null;
  const a = card.availability;
  const locks = card.locks ?? [];
  const chips = RESOURCE_KEYS.filter((key) => !!card.cost?.[key]).map((key) => ({
    key,
    color: RESOURCE_COLORS[key],
    // Upgrade costs scale by a fractional factor; show what the player has to have, rounded up.
    amount: Math.ceil(card.cost![key]!),
    short: a ? !!a.shortfall[key] : !!props.stock && card.cost![key]! > props.stock[key],
  }));

  const statuses: CardView['statuses'] = locks.map((text) => ({ text, tone: 'lock' as const }));
  const resourcesShort = !!a && Object.keys(a.shortfall).length > 0;
  if (a && resourcesShort) {
    statuses.push({ text: t('hud.ringMenu.card.needResources', { resources: resourceList(a.shortfall) }), tone: 'wait' });
  }
  if (a?.slots.short) {
    if (a.queue.hasRoom && !resourcesShort) {
      statuses.push({
        text: t('hud.ringMenu.card.willQueue', { waiting: a.queue.waiting, max: a.queue.max }),
        tone: 'queue',
      });
    } else {
      const params = { needed: a.slots.needed, free: a.slots.free, total: a.slots.total };
      statuses.push({
        text:
          a.nextSlotFreeInSeconds === null
            ? t('hud.ringMenu.card.needSlots', params, a.slots.needed)
            : t('hud.ringMenu.card.needSlotsNext', { ...params, time: formatBuildTime(a.nextSlotFreeInSeconds) }, a.slots.needed),
        tone: 'wait',
      });
      if (a.queue.max > 0 && !a.queue.hasRoom) {
        statuses.push({ text: t('hud.ringMenu.card.queueFull', { waiting: a.queue.waiting, max: a.queue.max }), tone: 'wait' });
      }
    }
  }

  let badge: CardView['badge'];
  if (locks.length) badge = { text: locks[0].toUpperCase(), tone: 'lock' };
  else if (resourcesShort) badge = { text: t('hud.ringMenu.card.badgeNoResources').toUpperCase(), tone: 'wait' };
  else if (a?.state === 'waiting') badge = { text: t('hud.ringMenu.card.badgeNoSlot').toUpperCase(), tone: 'wait' };
  else badge = { text: t('hud.ringMenu.buildableHere'), tone: 'ok' };

  let slots: CardView['slots'];
  if (a) {
    const params = { needed: a.slots.needed, free: a.slots.free, total: a.slots.total };
    // "All (3)" when the order takes every slot the settlement has.
    const all = a.slots.needed >= a.slots.total && a.slots.total > 1;
    slots = { text: all ? t('hud.ringMenu.card.slotsAll', params) : t('hud.ringMenu.card.slotsValue', params), short: a.slots.short };
  }

  return {
    title: card.title,
    sub: card.sub,
    art: card.art,
    badge,
    chips,
    time: card.time,
    gives: card.gives,
    slots,
    rows: [],
    warning: card.warning,
    statuses,
    tapHint: tapHint.value,
  };
});

/**
 * What a second tap on the armed bubble would do, spelled out — touch has no
 * hover, so the two-tap rule has to be visible. Only for an item that the
 * second tap would actually commit; a blocked one shows its reasons instead.
 */
const tapHint = computed<string | undefined>(() => {
  const id = armed.value;
  if (!id) return undefined;
  const building = hovered.value;
  if (building && building.id === id) {
    if (building.disabled || !isActionable(stateOf(building))) return undefined;
    return t('hud.ringMenu.tap.build', { name: building.label });
  }
  const item = hoveredLane1Index.value === null ? null : laneItems.value[hoveredLane1Index.value];
  if (!item || item.id !== id || item.disabled) return undefined;
  if (item.info) return t('hud.ringMenu.tap.details', { name: item.label });
  return t('hud.ringMenu.tap.upgrade', { name: item.label });
});

/** Whether the card (floating or docked) is on screen. */
const cardShown = computed(() => !!cardView.value && (!!props.dock || !!layout.value.card));

/**
 * H4: the soft gold glow on the building that can be built while its card is
 * shown (hover on desktop, armed on touch). `ready` and `queues` are the two
 * committable states.
 */
function glowing(b: RingBuilding): boolean {
  return hover.value === b.id && cardShown.value && !b.disabled && isActionable(stateOf(b));
}

const hubLabel = computed(() => (atRoot.value ? props.terrainLabel : t('hud.ringMenu.buildHub')));
const hubSub = computed(() => (atRoot.value ? props.coordLabel : props.terrainLabel));
// Real glyph widths of the UI font for bubbleLabelFontPx — a per-glyph
// estimate was right on one machine and a whole letter short on CI's
// Chromium. OffscreenCanvas shares the document's loaded fonts; where it
// doesn't exist (jsdom) the estimate stands in.
const measureCtx = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1).getContext('2d') : null;
const wordEmCache = new Map<string, number>();
function wordEmAt(weight: number): WordEmWidth {
  if (!measureCtx) return estimateWordEm;
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  return (word) => {
    const key = `${weight}|${family}|${word}`;
    let em = wordEmCache.get(key);
    if (em === undefined) {
      measureCtx.font = `${weight} 100px ${family}`;
      em = measureCtx.measureText(word).width / 100;
      wordEmCache.set(key, em);
    }
    return em;
  };
}
const bubbleFont = (label: string, diameter: number, basePx: number) =>
  `${bubbleLabelFontPx(label, diameter, basePx, { wordEm: wordEmAt(700) })}px`;
// `.hub-label` is capped at 84% of the hub (see its CSS), uppercase, 0.06em tracking.
const hubLabelFont = computed(
  () =>
    `${bubbleLabelFontPx(hubLabel.value, HUB, 10.5, {
      uppercase: true,
      letterSpacingEm: 0.06,
      availablePx: HUB * 0.84 - 2,
      wordEm: wordEmAt(700),
    })}px`,
);

/**
 * Moves to another layer. With motion the departing layer is pulled into its
 * parent first (the hub, or the category bubble), the path only changes once
 * that has finished, and the new layer then blooms out of its parent
 * (lib/map/ringMotion.ts). Under reduced motion the same sequence runs with
 * short opacity fades in place of the movement; without the Web Animations
 * API (jsdom) the path changes immediately.
 */
async function go(next: string[]) {
  const root = rootEl.value;
  if (!root || !supportsWaapi()) {
    path.value = next;
    hover.value = null;
    hoverLane1.value = null;
    return;
  }
  if (swapping.value) return;
  swapping.value = true;
  try {
    const prev = path.value;
    const hubPoint = { x: props.x, y: props.y };
    const parentPoint = () => {
      const kid = lane2.value[0];
      return kid ? { x: kid.parentX, y: kid.parentY } : hubPoint;
    };
    // The lane1 bubbles are swapped when the root <-> build boundary is crossed;
    // the buildings lane when a category opens, closes or changes.
    const lane1Swap = (prev.length === 0) !== (next.length === 0);
    if (lane1Swap) await ringMotion.layerOut(root, 'lane1', hubPoint);
    else if (prev.length === 2) await ringMotion.layerOut(root, 'kids', parentPoint());
    path.value = next;
    hover.value = null;
    hoverLane1.value = null;
    await nextTick();
    ringMotion.release(root);
    if (lane1Swap) await ringMotion.layerIn(root, 'lane1', hubPoint);
    else if (next.length === 2) await ringMotion.layerIn(root, 'kids', parentPoint());
  } finally {
    swapping.value = false;
  }
}

function goUp() {
  if (path.value.length) void go(path.value.slice(0, -1));
  else emit('close');
}
/** X11: the hub / ‹ BACK squish, then go back. At the root the hub just closes (the retract is its own motion). */
async function onBackClick(e: MouseEvent) {
  if (swapping.value) return;
  if (path.value.length && motionEnabled()) await ringMotion.press(e.currentTarget as HTMLElement);
  goUp();
}
// Navigation is click-only: Build opens its categories, a category opens its
// buildings, exactly as going back already needed a click. Hover only previews.
function onLaneClick(e: MouseEvent, item: RingAction) {
  if (item.disabled) {
    // A blocked root action (Raze on the longhouse, Send army without units ...) shakes and flashes its reason.
    blockedFeedback(e.currentTarget as HTMLElement);
    return;
  }
  if (swapping.value) return;
  if (atRoot.value) {
    if (item.id === 'build' && props.categories.length) void go(['build']);
    else emit('select', item.id);
    return;
  }
  if (props.categories.some((c) => c.id === item.id)) {
    void go(['build', item.id]);
  }
}
function onBuildingClick(e: MouseEvent, building: RingBuilding) {
  const el = e.currentTarget as HTMLElement;
  if (building.disabled || !isActionable(stateOf(building))) {
    blockedFeedback(el);
    return;
  }
  if (swapping.value) return;
  // X2: tells the retract (RingMenuHost's leave hook) which bubble
  // drops onto the hex; cleared again in case the caller kept the ring open.
  el.setAttribute(ringMotion.DROPPING_ATTR, '');
  emit('select', building.id);
  setTimeout(() => el.removeAttribute(ringMotion.DROPPING_ATTR), 50);
}
/** X1: the shake, the badge wobble and the reason flash for a click on something that is blocked. */
function blockedFeedback(bubble: HTMLElement) {
  const root = rootEl.value;
  const reason = root?.querySelector<HTMLElement>('[data-testid="ring-card-status"], .ring-hint') ?? null;
  void ringMotion.shake(bubble, reason);
}
// Touch has no hover, so the desktop "hover previews, click commits" pattern
// would otherwise collapse into "one tap spends resources blind". A touch
// touchstart does the hover's job instead: the first tap on a building
// previews it (shows the card) and consumes the tap, the second tap on that
// same, now-previewed building falls through to the ordinary click handler
// below and commits — mouse/pen pointers are untouched (they don't fire
// touchstart at all), since a real mouseenter already previewed the card
// before the click ever fires. This must listen on `touchstart` rather than
// `pointerdown`: Chromium only suppresses the tap's compatibility `click`
// when the *touch* event, not the pointer event, was the one canceled.
function onBuildingTouchStart(e: TouchEvent, building: RingBuilding) {
  const tap = tapArm(armed.value, building.id);
  if (tap.commit) return;
  e.preventDefault();
  armed.value = tap.armed;
  hover.value = building.id;
  hoverLane1.value = null;
}
// The same two-tap rule for the root bubbles that carry a card (Upgrade) or
// tile info (Details): the first tap arms and shows it, the second commits.
// Every other root bubble (Build, a category, Send army …) acts on the first
// tap as before — navigating or opening a sheet spends nothing.
function onLaneTouchStart(e: TouchEvent, item: RingAction) {
  if (!atRoot.value || (!item.card && !item.info)) return;
  const tap = tapArm(armed.value, item.id);
  if (tap.commit) return;
  e.preventDefault();
  armed.value = tap.armed;
  hoverLane1.value = item.id;
  hover.value = null;
}
// Where the hint chip of a hovered, disabled root bubble sits: just outside the
// bubble, away from the tile, anchored so it grows away from the bubble.
const hintStyle = computed(() => {
  const entry = hintedLane1.value;
  if (!entry) return null;
  const dx = entry.x - props.x;
  const dy = entry.y - props.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const reach = BUB1 / 2 + 8;
  const tx = ux > 0.35 ? '0' : ux < -0.35 ? '-100%' : '-50%';
  const ty = uy > 0.35 ? '0' : uy < -0.35 ? '-100%' : '-50%';
  return {
    left: `${entry.x + ux * reach}px`,
    top: `${entry.y + uy * reach}px`,
    transform: `translate(${tx}, ${ty})`,
    maxWidth: `${NOTE_W}px`,
  };
});

function onBackdropPointerDown(e: PointerEvent) {
  emit('outsidePointerDown', e);
}
</script>

<template>
  <!-- `data-swapping`: a layer change is mid-flight (old layer leaving, new one arriving), so the bubbles on screen
       are not yet the final set. -->
  <div ref="rootEl" class="ring-backdrop" :data-swapping="swapping || undefined" @pointerdown.self="onBackdropPointerDown" @contextmenu.prevent="emit('close')">
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
      :style="{ left: `${x}px`, top: `${y}px`, width: `${HUB}px`, height: `${HUB}px`, '--d': `${HUB}px` }"
      :title="atRoot ? undefined : t('hud.ringMenu.back')"
      @click="onBackClick"
    >
      <span class="hub-label" :style="{ fontSize: hubLabelFont }">{{ hubLabel }}</span>
      <span v-if="hubSub" class="hub-sub">{{ hubSub }}</span>
    </button>

    <!-- aria-disabled, not the native `disabled` attribute: a disabled
         button doesn't fire mouse events in most browsers, so its `title`
         tooltip (the hint below) would never show. onLaneClick/onLaneEnter
         already guard on entry.item.disabled, so this stays inert. -->
    <button
      v-for="entry in lane1"
      :key="entry.item.id"
      class="ring-bubble"
      :class="{
        active: entry.active,
        dim: entry.dim,
        disabled: entry.ban,
        'is-locked': entry.state === 'locked',
        'is-waiting': entry.state === 'waiting',
        soft: !!note,
        armed: armed === entry.item.id,
        dot: layout.collapsed,
      }"
      :style="{
        left: `${entry.x}px`,
        top: `${entry.y}px`,
        width: `${layout.collapsed ? DOT : BUB1}px`,
        height: `${layout.collapsed ? DOT : BUB1}px`,
        '--d': `${layout.collapsed ? DOT : BUB1}px`,
        fontSize: bubbleFont(entry.item.label, BUB1, entry.item.label.length > 7 ? 8.2 : 9.2),
        '--tint': entry.color,
      }"
      :aria-disabled="entry.item.disabled || undefined"
      :title="layout.collapsed ? entry.item.label : undefined"
      :aria-description="entry.item.disabled ? entry.item.hint : undefined"
      :aria-label="entry.item.label"
      @touchstart="onLaneTouchStart($event, entry.item)"
      @click="onLaneClick($event, entry.item)"
      @mouseenter="hoverLane1 = entry.item.id"
      @mouseleave="hoverLane1 = null"
    >
      <!-- No whitespace between the label and the badges: it would end up in the label's text. -->
      <template v-if="!layout.collapsed">{{ entry.item.label }}</template><span
        v-if="!layout.collapsed && (entry.ban || entry.state)" class="ring-badge" :class="entry.ban ? 'ban' : entry.state" aria-hidden="true">
        <svg v-if="entry.state === 'locked'" viewBox="0 0 12 12"><rect x="2.5" y="5.5" width="7" height="5" rx="1" /><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" /></svg>
        <svg v-else-if="entry.state === 'waiting'" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" /><path d="M6 3.4V6l1.8 1.1" /></svg>
        <svg v-else viewBox="0 0 12 12"><path d="M3 6h6" /></svg>
      </span><span
        v-if="armed === entry.item.id && !entry.item.disabled && !layout.collapsed" class="arm-badge" data-testid="ring-arm-badge" aria-hidden="true" />
    </button>

    <button
      v-if="backSpot"
      class="ring-bubble back"
      :style="{ left: `${backSpot.x}px`, top: `${backSpot.y}px`, width: `${BUB1}px`, height: `${BUB1}px`, '--d': `${BUB1}px` }"
      @click="onBackClick"
    >
      {{ t('hud.ringMenu.backButton') }}
    </button>

    <button
      v-for="b in lane2"
      :key="b.building.id"
      class="ring-bubble child"
      :class="{
        hot: hover === b.building.id,
        glow: glowing(b.building),
        locked: stateOf(b.building) === 'locked',
        waiting: stateOf(b.building) === 'waiting',
        disabled: b.building.disabled,
        armed: armed === b.building.id,
      }"
      :style="{
        left: `${b.x}px`,
        top: `${b.y}px`,
        width: `${BUB2}px`,
        height: `${BUB2}px`,
        '--d': `${BUB2}px`,
        fontSize: bubbleFont(b.building.label, BUB2, b.building.label.length > 7 ? 8.4 : 9.4),
        '--tint': b.color,
      }"
      :aria-disabled="!isActionable(stateOf(b.building)) || b.building.disabled || undefined"
      @touchstart="onBuildingTouchStart($event, b.building)"
      @click="onBuildingClick($event, b.building)"
      @mouseenter="hover = b.building.id"
    >
      {{ b.building.label }}<span
        v-if="stateOf(b.building) !== 'ready' && stateOf(b.building) !== 'queues'" class="ring-badge" :class="stateOf(b.building)" aria-hidden="true">
        <svg v-if="stateOf(b.building) === 'locked'" viewBox="0 0 12 12"><rect x="2.5" y="5.5" width="7" height="5" rx="1" /><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" /></svg>
        <svg v-else viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" /><path d="M6 3.4V6l1.8 1.1" /></svg>
      </span><span
        v-if="armed === b.building.id && !b.building.disabled && isActionable(stateOf(b.building))" class="arm-badge" data-testid="ring-arm-badge" aria-hidden="true" />
    </button>

    <div
      v-if="cardView && cardShown"
      class="ring-card"
      :class="dock ? ['docked', `docked-${dock}`] : []"
      data-testid="ring-card"
      :data-dock="dock ?? undefined"
      :style="dock || !layout.card ? undefined : { left: `${layout.card.x}px`, top: `${layout.card.y}px`, width: `${CARD_W}px` }"
    >
      <div class="card-art">
        <AtlasSprite v-if="cardView.art?.kind === 'atlas'" :frame="cardView.art.frame" class="card-art-img" />
        <img v-else-if="cardView.art?.kind === 'png'" class="card-art-img" :src="cardView.art.url" alt="" />
        <div class="card-head">
          <span class="card-name">{{ cardView.title }}</span>
          <span v-if="cardView.sub" class="card-sub">{{ cardView.sub }}</span>
          <span v-if="cardView.badge" class="card-badge" :class="cardView.badge.tone">{{ cardView.badge.text }}</span>
        </div>
      </div>
      <dl class="card-rows">
        <template v-if="cardView.chips.length">
          <dt>{{ t('hud.ringMenu.cost') }}</dt>
          <dd class="cost">
            <span v-for="chip in cardView.chips" :key="chip.key" class="chip">
              <i :style="{ background: chip.color }" />
              <b :class="{ short: chip.short }">{{ chip.amount }}</b>
            </span>
          </dd>
        </template>
        <template v-if="cardView.time">
          <dt>{{ t('hud.ringMenu.buildTime') }}</dt>
          <dd>{{ cardView.time }}</dd>
        </template>
        <template v-if="cardView.gives">
          <dt>{{ t('hud.ringMenu.gives') }}</dt>
          <dd class="nowrap">{{ cardView.gives }}</dd>
        </template>
        <template v-if="cardView.slots">
          <dt>{{ t('hud.ringMenu.card.slots') }}</dt>
          <dd class="nowrap" :class="{ 'slots-short': cardView.slots.short }" data-testid="ring-card-slots">{{ cardView.slots.text }}</dd>
        </template>
        <template v-for="row in cardView.rows" :key="row.label">
          <dt>{{ row.label }}</dt>
          <dd>{{ row.value }}</dd>
        </template>
      </dl>
      <p v-if="cardView.warning" class="card-warning" data-testid="ring-card-warning">{{ cardView.warning }}</p>
      <ul v-if="cardView.statuses.length || error" class="card-status" data-testid="ring-card-status">
        <li v-for="status in cardView.statuses" :key="status.text" :class="status.tone">{{ status.text }}</li>
        <li v-if="error" class="lock" data-testid="ring-error">{{ error }}</li>
      </ul>
      <p v-if="cardView.tapHint" class="card-tap-hint" data-testid="ring-tap-hint">
        <i class="tap-bubble" aria-hidden="true" />{{ cardView.tapHint }}
      </p>
      <div v-else-if="!(cardView.statuses.length || error)" class="card-foot" />
    </div>

    <div
      v-if="hintedLane1 && hintStyle"
      class="ring-hint"
      data-testid="ring-hint"
      :style="hintStyle"
    >
      {{ hintedLane1.item.hint }}
    </div>

    <!-- A rejected build / upgrade: the server's message stays visible with the
         ring still open. On the card when one is up (above); otherwise here. -->
    <div
      v-if="error && !cardShown && layout.note"
      class="ring-note ring-error"
      data-testid="ring-error"
      :style="{ left: `${layout.note.x}px`, top: `${layout.note.y}px`, width: `${NOTE_W}px` }"
    >
      <div class="note-body">{{ error }}</div>
    </div>

    <div
      v-if="note && !error && lane2.length === 0 && layout.note"
      class="ring-note"
      data-testid="ring-note"
      :style="{ left: `${layout.note.x}px`, top: `${layout.note.y}px`, width: `${NOTE_W}px` }"
    >
      <div class="note-title">{{ note.title }}</div>
      <div class="note-body">{{ note.body }}</div>
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
  /* Centred on left/top with a margin (--d is the diameter) rather than a
     translate, so `transform` stays free for the entrance / retract
     animations and the hover lift, and `translate` for the shake. */
  margin: calc(var(--d, 0px) / -2) 0 0 calc(var(--d, 0px) / -2);
  font-family: inherit;
  cursor: pointer;
  /* X4: a quick lift on hover. */
  transition:
    transform 160ms ease-out,
    box-shadow 160ms ease-out,
    background-color 160ms ease-out,
    border-color 160ms ease-out,
    color 160ms ease-out;
}
.ring-bubble:hover,
.ring-bubble.armed {
  transform: scale(1.07);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6);
}
/* Blocked (locked / waiting / not possible): only a hint of lift, and never a fill. */
.ring-bubble.disabled:hover,
.ring-bubble.is-locked:hover,
.ring-bubble.is-waiting:hover,
.ring-bubble.child.locked:hover,
.ring-bubble.child.waiting:hover,
.ring-bubble.disabled.armed,
.ring-bubble.child.locked.armed,
.ring-bubble.child.waiting.armed {
  transform: scale(1.03);
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
.hub-label,
.hub-sub {
  /* Keeps a wrapped coordinate line inside the circle's round edge. */
  max-width: 84%;
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
.ring-bubble:hover:not(.disabled):not(.is-locked):not(.is-waiting) {
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
/* Not possible here at all (Raze on the longhouse, Send army without units,
   Build on open water ...). Deliberately not the 40% opacity that .dim uses:
   full-strength label, dashed muted-red border, a ban badge. */
.ring-bubble.disabled {
  cursor: not-allowed;
  border: 1.5px dashed rgba(226, 112, 95, 0.55);
  color: var(--text);
  background: rgba(8, 18, 26, 0.9);
}
/* The onboarding ring's "why it's dim" design keeps its soft, dimmed look. */
.ring-bubble.disabled.soft {
  opacity: 0.4;
  border: 1px solid color-mix(in oklab, var(--tint) 50%, transparent);
}
.ring-bubble.is-locked {
  cursor: not-allowed;
  border: 1.5px dashed rgba(226, 112, 95, 0.55);
  color: rgba(240, 163, 150, 0.9);
}
.ring-bubble.is-waiting {
  cursor: not-allowed;
  border: 1.5px solid rgba(255, 179, 71, 0.65);
  color: rgba(232, 240, 245, 0.62);
}
.ring-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  border: 1px solid rgba(0, 0, 0, 0.55);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
}
.ring-badge svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ring-badge.locked {
  background: #7d2e24;
  color: #ffd9d2;
}
.ring-badge.ban {
  background: #4a2a26;
  color: #f0a396;
}
.ring-badge.waiting {
  background: #7a5410;
  color: #ffe2a8;
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
  border: 1.5px dashed rgba(226, 112, 95, 0.55);
  color: rgba(240, 163, 150, 0.85);
  background: rgba(14, 24, 20, 0.94);
  cursor: not-allowed;
}
/* Temporarily unavailable (resources / slots): solid, muted, no category fill on hover. */
.ring-bubble.child.waiting {
  border: 1.5px solid rgba(255, 179, 71, 0.65);
  color: rgba(232, 240, 245, 0.55);
  background: rgba(14, 24, 20, 0.94);
  cursor: not-allowed;
}
.ring-bubble.child.waiting.hot,
.ring-bubble.child.locked.hot {
  background: rgba(14, 24, 20, 0.94);
  font-weight: 600;
}
.ring-bubble.child.waiting.hot {
  color: rgba(232, 240, 245, 0.55);
}
.ring-bubble.child.locked.hot {
  color: rgba(240, 163, 150, 0.85);
}
.ring-card {
  position: absolute;
  /* The card is an informational read-out that happens to sit next to the
     bubbles, so it must never swallow a click aimed at one — building is a
     click on the bubble itself. The card carries no button of its own. */
  pointer-events: none;
  overflow: hidden;
  border-radius: 11px;
  background: rgba(10, 20, 27, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 22px 50px rgba(0, 0, 0, 0.6);
  color: var(--text);
}
.card-art {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: radial-gradient(90% 80% at 50% 40%, #1a3d4d, #0d1f29);
}
.card-art-img {
  width: 50px;
  max-height: 78px;
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
.card-warning {
  margin: 8px 12px 0;
  font-size: 10px;
  line-height: 1.35;
  color: var(--gold);
}
.card-badge.lock {
  color: var(--rival);
}
.card-badge.wait {
  color: #ffb347;
}
.card-badge.queue {
  color: var(--gold);
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
  /* "Build time" is a two-word label in a shrink-to-fit column — without this
     it breaks across two lines as soon as a value on another row is wide. */
  white-space: nowrap;
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
.card-foot {
  height: 12px;
}
.card-tap-hint {
  margin: 0;
  padding: 9px 12px 11px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 10.5px;
  font-weight: 600;
  color: var(--gold);
}
/* A tiny bubble with the armed ring: "this bubble, again". Not a button. */
.tap-bubble {
  width: 12px;
  height: 12px;
  flex: none;
  border-radius: 50%;
  background: rgba(8, 18, 26, 0.9);
  box-shadow: 0 0 0 2px var(--gold);
}
/* Touch: the first tap armed this bubble; a second tap commits it. */
.ring-bubble.armed {
  animation: ring-arm-pulse 1.3s ease-in-out infinite;
}
@keyframes ring-arm-pulse {
  0%,
  100% {
    box-shadow:
      0 0 0 2px var(--gold),
      0 0 0 2px rgba(255, 197, 92, 0.6);
  }
  50% {
    box-shadow:
      0 0 0 2px var(--gold),
      0 0 0 10px rgba(255, 197, 92, 0);
  }
}
/* H4: the building that can be built, while its card is up: a slow gold pulse. */
.ring-bubble.glow {
  border-color: var(--gold);
  animation: ring-glow 2.6s ease-in-out infinite;
}
@keyframes ring-glow {
  0%,
  100% {
    box-shadow:
      0 0 0 0 rgba(255, 197, 92, 0),
      0 6px 18px rgba(0, 0, 0, 0.45);
  }
  50% {
    box-shadow:
      0 0 7px 1.5px rgba(255, 197, 92, 0.42),
      0 6px 18px rgba(0, 0, 0, 0.45);
  }
}
html[data-hud-motion='reduced'] .ring-bubble,
html[data-hud-motion='reduced'] .ring-hub {
  transition: none;
}
html[data-hud-motion='reduced'] .ring-bubble.armed {
  animation: none;
  box-shadow: 0 0 0 4px var(--gold);
}
/* The glow becomes a static gold ring. */
html[data-hud-motion='reduced'] .ring-bubble.glow {
  animation: none;
  box-shadow:
    0 0 0 2px rgba(255, 197, 92, 0.6),
    0 6px 18px rgba(0, 0, 0, 0.45);
}
.arm-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--gold);
  border: 1px solid rgba(0, 0, 0, 0.55);
  color: #20160a;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
/* The digit is drawn by CSS so it never becomes part of the bubble's label text. */
.arm-badge::before {
  content: '2';
  font-size: 9.5px;
  font-weight: 800;
  line-height: 1;
}
/* Phone layout: the card docks to a screen edge (lib/map/ringDock.ts). The
   --hud-inset-* variables come from MapView's root and keep it clear of the
   HUD bar wherever it is docked; env() keeps it clear of notches. */
.ring-card.docked {
  border-radius: 12px;
}
.ring-card.docked-bottom {
  left: calc(8px + env(safe-area-inset-left, 0px));
  right: calc(8px + env(safe-area-inset-right, 0px));
  bottom: calc(var(--hud-inset-bottom, 0px) + 8px + env(safe-area-inset-bottom, 0px));
  max-height: 236px;
}
.ring-card.docked-left,
.ring-card.docked-right {
  top: calc(var(--hud-inset-top, 0px) + 8px + env(safe-area-inset-top, 0px));
  bottom: calc(var(--hud-inset-bottom, 0px) + 8px + env(safe-area-inset-bottom, 0px));
  width: 248px;
}
.ring-card.docked-left {
  left: calc(var(--hud-inset-left, 0px) + 8px + env(safe-area-inset-left, 0px));
}
.ring-card.docked-right {
  right: calc(8px + env(safe-area-inset-right, 0px));
}
.card-status {
  list-style: none;
  margin: 0;
  padding: 10px 12px 11px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.35;
}
.card-status .lock {
  color: var(--rival);
}
.card-status .wait {
  color: #ffb347;
}
.card-status .queue {
  color: var(--gold);
}
.card-rows dd.slots-short {
  color: #ffb347;
}
.ring-hint {
  position: absolute;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(10, 20, 27, 0.96);
  border: 1px solid rgba(226, 112, 95, 0.45);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.55);
  font-size: 11px;
  line-height: 1.35;
  color: #f0c3ba;
  pointer-events: none;
  width: max-content;
}
.ring-error {
  border-color: rgba(226, 112, 95, 0.55);
}
.ring-error .note-body {
  color: #f0c3ba;
}
.ring-note {
  position: absolute;
  padding: 9px 12px;
  border-radius: 9px;
  background: rgba(10, 20, 27, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}
.note-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 5px;
}
.note-body {
  font-size: 11.5px;
  line-height: 1.45;
  color: #c3d2da;
}
</style>
