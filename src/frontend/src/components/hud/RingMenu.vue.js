/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
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
import { computed, nextTick, onMounted, onUnmounted, onUpdated, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AtlasSprite from '../AtlasSprite.vue';
import { resourceName } from '../../i18n/catalogueNames';
import { formatBuildTime } from '../../lib/map/ringCatalogue';
import { hyphenate, loadHyphenation, SOFT_HYPHEN } from '../../lib/hyphenation';
import { isActionable } from '../../lib/map/ringAvailability';
import { tapArm } from '../../lib/map/ringDock';
import { ringFootprint } from '../../lib/map/markerOcclusion';
import { motionEnabled, supportsWaapi } from '../../lib/motion';
import * as ringMotion from '../../lib/map/ringMotion';
import { BUB1, BUB2, CARD_W, HUB, LANE1, LANE2, layoutRing, NOTE_W, bubbleLabelFontPx, fitBubbleLabel, shrinkToFit, estimateWordEm, } from '../../lib/map/ringLayout';
const { defineProps, defineEmits, withDefaults, } = {};
const props = withDefaults(defineProps(), {
    scale: 1,
    categories: () => [],
    terrainLabel: '',
    coordLabel: '',
    bounds: undefined,
    cardBounds: undefined,
    stock: undefined,
    error: null,
    dock: null,
});
const { t, locale } = useI18n({ useScope: 'global' });
const emit = defineEmits();
/** [] = root · ['build'] = categories · ['build', catId] = that category's buildings. */
const path = ref([]);
/** The backdrop element: the choreography in lib/map/ringMotion.ts finds the bubbles, links and hub inside it. */
const rootEl = ref(null);
/**
 * Where a layer swap is: 'out' = the departing layer is being pulled in (its
 * bubbles are leaving, clicks are ignored), 'in' = the new layer is blooming
 * (its bubbles are the live ones, so a click is kept and run once it has landed).
 */
const swapPhase = ref(null);
const swapping = computed(() => swapPhase.value !== null);
/** The latest click made while the new layer bloomed in; run when the swap ends. */
let pendingAction = null;
function runPendingAction() {
    const pending = pendingAction;
    pendingAction = null;
    pending?.();
}
/**
 * True when a swap is running and the click has been dealt with: dropped in the
 * out phase, queued (latest wins) in the in phase. The action runs after the
 * event is over, so it must capture whatever it needs from the event up front.
 */
function deferDuringSwap(action) {
    if (!swapping.value)
        return false;
    if (swapPhase.value === 'in')
        pendingAction = action;
    return true;
}
const hover = ref(null);
/** The root / category bubble under the pointer — only to preview its card or hint chip, never to navigate. */
const hoverLane1 = ref(null);
/**
 * Touch only: the bubble the first tap "armed" (its card is showing); a second
 * tap on it commits. Mouse hover never arms — a mouse previews by hovering.
 */
const armed = ref(null);
const viewport = ref({ w: window.innerWidth, h: window.innerHeight });
function onResize() {
    viewport.value = { w: window.innerWidth, h: window.innerHeight };
}
// Escape walks back up the way ‹ BACK does, and only closes from the root —
// otherwise one keypress throws away a drill-down the player just made.
function onWindowKeydown(e) {
    if (e.key !== 'Escape')
        return;
    if (path.value.length)
        goUp();
    else
        emit('close');
}
// The top HUD bar sits above this ring's backdrop (TopBar.vue's z-index 40
// vs. the backdrop's 30, so header buttons keep working while a ring is
// open) and takes every click on it itself — none reach the backdrop or the
// map. A press anywhere on the bar is still an "outside" press for the ring,
// though, so close it — just not via `outsidePointerDown`, which would also
// start a map drag from a gesture that never touched the map.
function onWindowPointerDown(e) {
    if (e.target?.closest?.('.hud-bar'))
        emit('close');
}
onMounted(() => {
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onWindowKeydown);
    window.addEventListener('pointerdown', onWindowPointerDown, true);
    // O1: the hub grows, then the bubbles bloom out of it.
    if (rootEl.value)
        void ringMotion.openRing(rootEl.value);
});
onUnmounted(() => {
    window.removeEventListener('pointerdown', onWindowPointerDown, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onWindowKeydown);
});
// Re-opening on another tile must start at the root, not wherever the last
// tile's menu was left.
watch(() => [props.x, props.y], () => {
    path.value = [];
    hover.value = null;
    hoverLane1.value = null;
    armed.value = null;
});
watch(path, () => {
    armed.value = null;
});
/** A full-size length of the ring at the ring's size. */
const px = (length) => length * props.scale;
const area = computed(() => props.bounds ?? { left: 16, top: 76, right: viewport.value.w - 16, bottom: viewport.value.h - 16 });
const cardArea = computed(() => props.cardBounds ?? { left: 16, top: 76, right: viewport.value.w - 16, bottom: viewport.value.h - 16 });
const activeCategory = computed(() => props.categories.find((c) => c.id === path.value[1]) ?? null);
const atRoot = computed(() => path.value.length === 0);
/** Inner-lane entries: root actions, or the categories once `build` is open. */
const laneItems = computed(() => (atRoot.value ? props.actions : props.categories));
/**
 * Past the root, the inner lane permanently reserves one extra slot for
 * ‹ BACK — so the categories keep identical positions whether or not a
 * category is currently open.
 */
const laneCount = computed(() => (atRoot.value ? props.actions.length : props.categories.length + 1));
const buildings = computed(() => activeCategory.value?.buildings ?? []);
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
    if (i < 0 || !atRoot.value)
        return null;
    const item = laneItems.value[i];
    return item.card || item.info ? i : null;
});
/**
 * A disabled root bubble with a reason, hovered: its hint shows as a chip beside it.
 * Not for a bubble with its own card (Upgrade): the card already lists the reasons.
 */
const hintedLane1 = computed(() => {
    if (!atRoot.value)
        return null;
    const entry = lane1.value.find((e) => e.item.id === hoverLane1.value);
    if (!entry || !entry.item.disabled || !entry.item.hint || entry.item.card)
        return null;
    return entry;
});
const layout = computed(() => layoutRing({
    x: props.x,
    y: props.y,
    area: area.value,
    cardArea: cardArea.value,
    lane1Count: laneCount.value,
    lane2Count: buildings.value.length,
    scale: props.scale,
    parentIndex: activeCategory.value ? props.categories.indexOf(activeCategory.value) : -1,
    // A docked card lives at a screen edge, so the ring doesn't make room for it.
    cardAnchor: props.dock ? null : hoveredIndex.value,
    lane1CardAnchor: props.dock ? null : hoveredLane1Index.value,
    wantsNote: !!props.error,
}));
const lane1 = computed(() => laneItems.value.map((item, i) => {
    const spot = layout.value.lane1[i];
    const active = !!activeCategory.value && item.id === activeCategory.value.id;
    return {
        item,
        x: spot.x,
        y: spot.y,
        active,
        dim: !!activeCategory.value && !active,
        category: !atRoot.value,
        state: item.state ?? (atRoot.value ? undefined : categoryState(item.id)),
        // A disabled bubble with no availability state is the plain "can't do
        // that here" look; one with a state explains itself with a badge instead.
        ban: !!item.disabled && !item.state,
        color: item.color ?? (item.id === 'build' ? 'var(--gold)' : 'var(--text)'),
    };
}));
/** ‹ BACK owns the reserved last slot of the inner lane. */
const backSpot = computed(() => (atRoot.value ? null : (layout.value.lane1[props.categories.length] ?? null)));
const lane2 = computed(() => {
    const category = activeCategory.value;
    const parent = category ? layout.value.lane1[props.categories.indexOf(category)] : null;
    if (!category || !parent)
        return [];
    return buildings.value.map((building, i) => ({
        building,
        x: layout.value.lane2[i].x,
        y: layout.value.lane2[i].y,
        parentX: parent.x,
        parentY: parent.y,
        color: category.color,
    }));
});
// Re-emitted whenever a bubble's placement actually changes (opening,
// re-anchoring, an edge-case reflow) — not a one-off at mount, since the
// caller's pointer needs to track the same spot the bubble is drawn at.
// Covers both lanes (category and building ids never collide), so a pointer can
// follow the player from the Build hub through a category to a building.
watch([lane1, lane2], ([inner, outer]) => {
    const spots = {};
    for (const entry of inner)
        spots[entry.item.id] = { x: entry.x, y: entry.y };
    for (const entry of outer)
        spots[entry.building.id] = { x: entry.x, y: entry.y };
    emit('layout', spots);
}, { immediate: true });
watch([lane1, lane2, backSpot, layout], () => {
    const r1 = px(BUB1) / 2;
    emit('bubbles', [
        { id: 'hub', x: props.x, y: props.y, r: px(HUB) / 2 },
        ...lane1.value.map((e) => ({ id: e.item.id, x: e.x, y: e.y, r: r1 })),
        ...(backSpot.value ? [{ id: 'back', x: backSpot.value.x, y: backSpot.value.y, r: px(BUB1) / 2 }] : []),
        ...lane2.value.map((b) => ({ id: b.building.id, x: b.x, y: b.y, r: px(BUB2) / 2 })),
    ]);
}, { immediate: true });
const footprint = computed(() => {
    const bubbles = layout.value.lane1.map((spot) => ({ x: spot.x, y: spot.y, r: px(BUB1) / 2 }));
    if (lane2.value.length > 0)
        for (const b of lane2.value)
            bubbles.push({ x: b.x, y: b.y, r: px(BUB2) / 2 });
    return ringFootprint({ x: props.x, y: props.y }, bubbles, px(HUB) / 2);
});
watch(footprint, (circle) => emit('footprint', circle), { immediate: true });
const RESOURCE_COLORS = { wood: 'var(--wood)', stone: 'var(--stone)', food: 'var(--food)', iron: 'var(--iron)' };
const RESOURCE_KEYS = ['wood', 'stone', 'food', 'iron'];
/** A building's own fields as the card shape the hover card renders. */
function cardOf(b) {
    return {
        title: b.label,
        sub: t('hud.ringMenu.card.level', { level: b.level ?? 1 }),
        cost: b.cost,
        time: b.time,
        gives: b.gives,
        givesTotal: b.givesTotal,
        locks: b.locks?.length ? b.locks : b.lock ? [b.lock] : [],
        warning: b.warning,
        art: b.art,
        availability: b.availability,
    };
}
/** A category whose every building is locked carries the lock itself; it still opens, to show what is locked. */
function categoryState(id) {
    const list = props.categories.find((c) => c.id === id)?.buildings ?? [];
    return list.length && list.every((b) => stateOf(b) === 'locked') ? 'locked' : undefined;
}
/** What state a building bubble is in: a lock wins, otherwise whatever the availability says. */
function stateOf(b) {
    if (b.lock || b.locks?.length)
        return 'locked';
    return b.state ?? b.availability?.state ?? 'ready';
}
const activeCard = computed(() => {
    if (hovered.value)
        return cardOf(hovered.value);
    const item = hoveredLane1Index.value === null ? null : laneItems.value[hoveredLane1Index.value];
    return item?.card ?? null;
});
const activeInfo = computed(() => {
    if (hovered.value || hoveredLane1Index.value === null)
        return null;
    return laneItems.value[hoveredLane1Index.value].info ?? null;
});
function resourceList(shortfall) {
    return RESOURCE_KEYS.filter((key) => shortfall[key])
        .map((key) => `${shortfall[key]} ${resourceName(key)}`)
        .join(' · ');
}
const cardView = computed(() => {
    const info = activeInfo.value;
    if (info) {
        return { title: info.title, sub: info.sub, art: info.art, chips: [], rows: info.rows, statuses: [], tapHint: tapHint.value };
    }
    const card = activeCard.value;
    if (!card)
        return null;
    const a = card.availability;
    const locks = card.locks ?? [];
    const chips = RESOURCE_KEYS.filter((key) => !!card.cost?.[key]).map((key) => ({
        key,
        color: RESOURCE_COLORS[key],
        // Upgrade costs scale by a fractional factor; show what the player has to have, rounded up.
        amount: Math.ceil(card.cost[key]),
        short: a ? !!a.shortfall[key] : !!props.stock && card.cost[key] > props.stock[key],
    }));
    const statuses = locks.map((text) => ({ text, tone: 'lock' }));
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
        }
        else {
            const params = { needed: a.slots.needed, free: a.slots.free, total: a.slots.total };
            statuses.push({
                text: a.nextSlotFreeInSeconds === null
                    ? t('hud.ringMenu.card.needSlots', params, a.slots.needed)
                    : t('hud.ringMenu.card.needSlotsNext', { ...params, time: formatBuildTime(a.nextSlotFreeInSeconds) }, a.slots.needed),
                tone: 'wait',
            });
            if (a.queue.max > 0 && !a.queue.hasRoom) {
                statuses.push({ text: t('hud.ringMenu.card.queueFull', { waiting: a.queue.waiting, max: a.queue.max }), tone: 'wait' });
            }
        }
    }
    let badge;
    if (locks.length)
        badge = { text: locks[0].toUpperCase(), tone: 'lock' };
    else if (resourcesShort)
        badge = { text: t('hud.ringMenu.card.badgeNoResources').toUpperCase(), tone: 'wait' };
    else if (a?.state === 'waiting')
        badge = { text: t('hud.ringMenu.card.badgeNoSlot').toUpperCase(), tone: 'wait' };
    else
        badge = { text: t('hud.ringMenu.buildableHere'), tone: 'ok' };
    return {
        title: card.title,
        sub: card.sub,
        art: card.art,
        badge,
        chips,
        time: card.time,
        gives: card.gives,
        givesTotal: card.givesTotal,
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
const tapHint = computed(() => {
    const id = armed.value;
    if (!id)
        return undefined;
    const building = hovered.value;
    if (building && building.id === id) {
        if (building.disabled || !isActionable(stateOf(building)))
            return undefined;
        return t('hud.ringMenu.tap.build', { name: building.label });
    }
    const item = hoveredLane1Index.value === null ? null : laneItems.value[hoveredLane1Index.value];
    if (!item || item.id !== id || item.disabled)
        return undefined;
    if (item.info)
        return t('hud.ringMenu.tap.details', { name: item.label });
    return t('hud.ringMenu.tap.upgrade', { name: item.label });
});
/** Whether the card (floating or docked) is on screen. */
const cardShown = computed(() => !!cardView.value && (!!props.dock || !!layout.value.card));
/**
 * H4: the soft gold glow on the building that can be built while its card is
 * shown (hover on desktop, armed on touch). `ready` and `queues` are the two
 * committable states.
 */
function glowing(b) {
    return hover.value === b.id && cardShown.value && !b.disabled && isActionable(stateOf(b));
}
const hubLabel = computed(() => (atRoot.value ? props.terrainLabel : t('hud.ringMenu.buildHub')));
const hubSub = computed(() => (atRoot.value ? props.coordLabel : props.terrainLabel));
// Real glyph widths of the UI font for bubbleLabelFontPx — a per-glyph
// estimate was right on one machine and a whole letter short on CI's
// Chromium. OffscreenCanvas shares the document's loaded fonts; where it
// doesn't exist (jsdom) the estimate stands in.
const measureCtx = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1).getContext('2d') : null;
const wordEmCache = new Map();
function wordEmAt(weight) {
    if (!measureCtx)
        return estimateWordEm;
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
/**
 * Bubble labels are laid out against what the browser really renders. A label that fits its bubble (every word on a
 * line, at most two lines, three when the name has spaces) is left alone. A word wider than the bubble is broken at
 * its hyphenation points for the active locale (`lib/hyphenation.ts`: "Waffen-" / "schmiede"), at the normal size;
 * only when that is still too much is the font shrunk, down to `BUBBLE_LABEL_MIN_PX` (`fitBubbleLabel`). The
 * hyphenated text is kept in `fittedLabels` and rendered through `shown`, so the DOM text is the plain label for
 * every name that fits. The hub label (not a bubble) keeps its own shrink-to-fit. Runs after every render and when a
 * web font finishes loading; map and onboarding share it.
 */
const fittedLabels = shallowRef(new Map());
const labelKey = (label, child) => `${child ? 'child' : 'lane'}:${label}`;
const shown = (label, child) => fittedLabels.value.get(labelKey(label, child)) ?? label;
function fitLabels() {
    const root = rootEl.value;
    if (!root)
        return;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none;left:0;top:0';
    // Same box as a bubble's text: as wide as the bubble's inner width, centred, breaking only at spaces and hyphens.
    const box = document.createElement('div');
    box.style.cssText =
        'position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;white-space:normal;overflow-wrap:normal;hyphens:manual;text-align:center;box-sizing:content-box';
    root.append(probe, box);
    const fitted = new Map();
    try {
        for (const el of root.querySelectorAll('.ring-bubble')) {
            el.style.fontSize = '';
            const cs = getComputedStyle(el);
            const text = [...el.childNodes]
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => n.textContent ?? '')
                .join(' ')
                .replaceAll(SOFT_HYPHEN, '')
                .trim();
            const available = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2;
            const startPx = parseFloat(cs.fontSize);
            if (!text || available <= 0 || !(startPx > 0))
                continue;
            const lineHeightEm = (parseFloat(cs.lineHeight) || startPx * 1.12) / startPx;
            const trackingEm = (parseFloat(cs.letterSpacing) || 0) / startPx;
            for (const style of [probe.style, box.style]) {
                style.fontFamily = cs.fontFamily;
                style.fontWeight = cs.fontWeight;
                style.textTransform = cs.textTransform;
            }
            box.style.width = `${available}px`;
            const widthAt = (word, px) => {
                probe.style.fontSize = `${px}px`;
                probe.style.letterSpacing = `${trackingEm}em`;
                probe.textContent = word;
                return probe.offsetWidth;
            };
            const linesAt = (value, px) => {
                box.style.fontSize = `${px}px`;
                box.style.letterSpacing = `${trackingEm}em`;
                box.style.lineHeight = String(lineHeightEm);
                box.textContent = value;
                // A piece with no break point wider than the box spills over its right edge.
                if (box.scrollWidth > box.clientWidth + 0.5)
                    return Infinity;
                return Math.round(box.offsetHeight / (px * lineHeightEm));
            };
            const fit = fitBubbleLabel(text, startPx, {
                widthAt,
                linesAt,
                availablePx: available,
                hyphenate: (word) => hyphenate(word, locale.value),
            });
            if (fit.px < startPx)
                el.style.fontSize = `${fit.px}px`;
            if (fit.text !== text)
                fitted.set(labelKey(text, el.classList.contains('child')), fit.text);
        }
        const hub = root.querySelector('.hub-label');
        if (hub?.parentElement) {
            const words = (hub.textContent ?? '').split(/\s+/).filter(Boolean);
            const hubAvailable = hub.parentElement.clientWidth * 0.84 - 2;
            const cs = getComputedStyle(hub);
            const startPx = parseFloat(cs.fontSize);
            if (words.length > 0 && hubAvailable > 0 && startPx > 0) {
                const trackingEm = (parseFloat(cs.letterSpacing) || 0) / startPx;
                probe.style.fontFamily = cs.fontFamily;
                probe.style.fontWeight = cs.fontWeight;
                probe.style.textTransform = cs.textTransform;
                const hubWidthAt = (word, px) => {
                    probe.style.fontSize = `${px}px`;
                    probe.style.letterSpacing = `${trackingEm}em`;
                    probe.textContent = word;
                    return probe.offsetWidth;
                };
                const shrunk = shrinkToFit(words, hubAvailable, startPx, hubWidthAt);
                if (shrunk < startPx)
                    hub.style.fontSize = `${shrunk}px`;
            }
        }
    }
    finally {
        probe.remove();
        box.remove();
    }
    const before = fittedLabels.value;
    const same = before.size === fitted.size && [...fitted].every(([key, value]) => before.get(key) === value);
    if (!same)
        fittedLabels.value = fitted;
}
onMounted(() => {
    void nextTick(fitLabels);
    document.fonts?.addEventListener?.('loadingdone', fitLabels);
});
onUpdated(() => void nextTick(fitLabels));
onUnmounted(() => document.fonts?.removeEventListener?.('loadingdone', fitLabels));
// The patterns of the active language arrive lazily; labels are laid out again once they are there.
watch(locale, (lang) => void loadHyphenation(lang).then(() => nextTick(fitLabels)), { immediate: true });
// `.hub-label` is capped at 84% of the hub (see its CSS), uppercase, 0.06em tracking.
const hubLabelFont = computed(() => `${bubbleLabelFontPx(hubLabel.value, px(HUB), 10.5 * props.scale, {
    uppercase: true,
    letterSpacingEm: 0.06,
    availablePx: px(HUB) * 0.84 - 2,
    wordEm: wordEmAt(700),
})}px`);
/**
 * Moves to another layer. With motion the departing layer is pulled into its
 * parent first (the hub, or the category bubble), the path only changes once
 * that has finished, and the new layer then blooms out of its parent
 * (lib/map/ringMotion.ts). Under reduced motion the same sequence runs with
 * short opacity fades in place of the movement; without the Web Animations
 * API (jsdom) the path changes immediately.
 */
async function go(next) {
    const root = rootEl.value;
    if (!root || !supportsWaapi()) {
        path.value = next;
        hover.value = null;
        hoverLane1.value = null;
        return;
    }
    if (swapping.value)
        return;
    swapPhase.value = 'out';
    pendingAction = null;
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
        if (lane1Swap)
            await ringMotion.layerOut(root, 'lane1', hubPoint);
        else if (prev.length === 2)
            await ringMotion.layerOut(root, 'kids', parentPoint());
        path.value = next;
        hover.value = null;
        hoverLane1.value = null;
        await nextTick();
        ringMotion.release(root);
        swapPhase.value = 'in';
        if (lane1Swap)
            await ringMotion.layerIn(root, 'lane1', hubPoint);
        else if (next.length === 2)
            await ringMotion.layerIn(root, 'kids', parentPoint());
    }
    finally {
        swapPhase.value = null;
        runPendingAction();
    }
}
function goUp() {
    if (path.value.length)
        void go(path.value.slice(0, -1));
    else
        emit('close');
}
/** X11: the hub / ‹ BACK squish, then go back. At the root the hub just closes (the retract is its own motion). */
async function onBackClick(e) {
    const el = e.currentTarget;
    const back = async () => {
        if (path.value.length && motionEnabled())
            await ringMotion.press(el);
        goUp();
    };
    if (deferDuringSwap(() => void back()))
        return;
    await back();
}
// Navigation is click-only: Build opens its categories, a category opens its
// buildings, exactly as going back already needed a click. Hover only previews.
function onLaneClick(e, item) {
    if (item.disabled) {
        // A blocked root action (Raze on the longhouse, Send army without units ...) shakes and flashes its reason.
        blockedFeedback(e.currentTarget);
        return;
    }
    const act = () => {
        if (atRoot.value) {
            if (item.id === 'build' && props.categories.length)
                void go(['build']);
            else
                emit('select', item.id);
            return;
        }
        if (props.categories.some((c) => c.id === item.id)) {
            void go(['build', item.id]);
        }
    };
    if (!deferDuringSwap(act))
        act();
}
function onBuildingClick(e, building) {
    const el = e.currentTarget;
    if (building.disabled || !isActionable(stateOf(building))) {
        blockedFeedback(el);
        return;
    }
    const commit = () => {
        // X2: tells the retract (RingMenuHost's leave hook) which bubble
        // drops onto the hex; cleared again in case the caller kept the ring open.
        el.setAttribute(ringMotion.DROPPING_ATTR, '');
        emit('select', building.id);
        setTimeout(() => el.removeAttribute(ringMotion.DROPPING_ATTR), 50);
    };
    if (!deferDuringSwap(commit))
        commit();
}
/** X1: the shake, the badge wobble and the reason flash for a click on something that is blocked. */
function blockedFeedback(bubble) {
    const root = rootEl.value;
    const reason = root?.querySelector('[data-testid="ring-card-status"], .ring-hint') ?? null;
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
function onBuildingTouchStart(e, building) {
    const tap = tapArm(armed.value, building.id);
    if (tap.commit)
        return;
    e.preventDefault();
    armed.value = tap.armed;
    hover.value = building.id;
    hoverLane1.value = null;
}
// The same two-tap rule for the root bubbles that carry a card (Upgrade) or
// tile info (Details): the first tap arms and shows it, the second commits.
// Every other root bubble (Build, a category, Send army …) acts on the first
// tap as before — navigating or opening a sheet spends nothing.
function onLaneTouchStart(e, item) {
    if (!atRoot.value || (!item.card && !item.info))
        return;
    const tap = tapArm(armed.value, item.id);
    if (tap.commit)
        return;
    e.preventDefault();
    armed.value = tap.armed;
    hoverLane1.value = item.id;
    hover.value = null;
}
// Where the hint chip of a hovered, disabled root bubble sits: just outside the
// bubble, away from the tile, anchored so it grows away from the bubble.
const hintStyle = computed(() => {
    const entry = hintedLane1.value;
    if (!entry)
        return null;
    const dx = entry.x - props.x;
    const dy = entry.y - props.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const reach = px(BUB1) / 2 + 8;
    const tx = ux > 0.35 ? '0' : ux < -0.35 ? '-100%' : '-50%';
    const ty = uy > 0.35 ? '0' : uy < -0.35 ? '-100%' : '-50%';
    return {
        left: `${entry.x + ux * reach}px`,
        top: `${entry.y + uy * reach}px`,
        transform: `translate(${tx}, ${ty})`,
        maxWidth: `${NOTE_W}px`,
    };
});
function onBackdropPointerDown(e) {
    emit('outsidePointerDown', e);
}
const __VLS_defaults = {
    scale: 1,
    categories: () => [],
    terrainLabel: '',
    coordLabel: '',
    bounds: undefined,
    cardBounds: undefined,
    stock: undefined,
    error: null,
    dock: null,
};
void __VLS_defaults;
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(swapping, {});
    __VLS_withDotValue(layout, {});
    __VLS_withDotValue(atRoot, {});
    __VLS_withDotValue(hubSub, {});
    __VLS_withDotValue(hoverLane1, {});
    __VLS_withDotValue(armed, {});
    __VLS_withDotValue(backSpot, {});
    __VLS_withDotValue(hover, {});
    __VLS_withDotValue(cardView, {});
    __VLS_withDotValue(cardShown, {});
    __VLS_withDotValue(hintedLane1, {});
    __VLS_withDotValue(hintStyle, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['ring-track']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['child']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
    /** @type {__VLS_StyleScopedClasses['armed']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['child']} */ ;
    /** @type {__VLS_StyleScopedClasses['locked']} */ ;
    /** @type {__VLS_StyleScopedClasses['armed']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['child']} */ ;
    /** @type {__VLS_StyleScopedClasses['waiting']} */ ;
    /** @type {__VLS_StyleScopedClasses['armed']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-hub']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-hub']} */ ;
    /** @type {__VLS_StyleScopedClasses['hub-label']} */ ;
    /** @type {__VLS_StyleScopedClasses['hub-sub']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-locked']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-waiting']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-locked']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-locked']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-waiting']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['locked']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['waiting']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['child']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['child']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['child']} */ ;
    /** @type {__VLS_StyleScopedClasses['locked']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['child']} */ ;
    /** @type {__VLS_StyleScopedClasses['waiting']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['child']} */ ;
    /** @type {__VLS_StyleScopedClasses['waiting']} */ ;
    /** @type {__VLS_StyleScopedClasses['hot']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['child']} */ ;
    /** @type {__VLS_StyleScopedClasses['locked']} */ ;
    /** @type {__VLS_StyleScopedClasses['hot']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['child']} */ ;
    /** @type {__VLS_StyleScopedClasses['waiting']} */ ;
    /** @type {__VLS_StyleScopedClasses['hot']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['child']} */ ;
    /** @type {__VLS_StyleScopedClasses['locked']} */ ;
    /** @type {__VLS_StyleScopedClasses['hot']} */ ;
    /** @type {__VLS_StyleScopedClasses['card-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['card-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['card-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['card-rows']} */ ;
    /** @type {__VLS_StyleScopedClasses['card-rows']} */ ;
    /** @type {__VLS_StyleScopedClasses['card-rows']} */ ;
    /** @type {__VLS_StyleScopedClasses['card-rows']} */ ;
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['armed']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-hub']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['armed']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['armed']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['armed']} */ ;
    /** @type {__VLS_StyleScopedClasses['no-commit']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['glow']} */ ;
    /** @type {__VLS_StyleScopedClasses['arm-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['docked-left']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['docked-right']} */ ;
    /** @type {__VLS_StyleScopedClasses['card-status']} */ ;
    /** @type {__VLS_StyleScopedClasses['lock']} */ ;
    /** @type {__VLS_StyleScopedClasses['card-status']} */ ;
    /** @type {__VLS_StyleScopedClasses['wait']} */ ;
    /** @type {__VLS_StyleScopedClasses['card-status']} */ ;
    /** @type {__VLS_StyleScopedClasses['queue']} */ ;
    /** @type {__VLS_StyleScopedClasses['gives-total']} */ ;
    /** @type {__VLS_StyleScopedClasses['ring-error']} */ ;
    /** @type {__VLS_StyleScopedClasses['note-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onPointerdown: (onBackdropPointerDown) },
        ...{ onContextmenu: (...[$event]) => {
                void $event;
                return (__VLS_unwrap(emit, {})('close'));
                // @ts-ignore
                [emit,];
            } },
        ref: "rootEl",
        ...{ class: "ring-backdrop" },
        ...{ style: ({ '--ring-scale': __VLS_ctx.scale }) },
        'data-swapping': (swapping.value || undefined),
    });
    /** @type {__VLS_StyleScopedClasses['ring-backdrop']} */ ;
    if (layout.value.showLane1Track) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ class: "ring-track" },
            ...{ style: ({ left: `${__VLS_ctx.x - __VLS_unwrap(px, {})(__VLS_unwrap(LANE1, {}))}px`, top: `${__VLS_ctx.y - __VLS_unwrap(px, {})(__VLS_unwrap(LANE1, {}))}px`, width: `${__VLS_unwrap(px, {})(__VLS_unwrap(LANE1, {})) * 2}px`, height: `${__VLS_unwrap(px, {})(__VLS_unwrap(LANE1, {})) * 2}px` }) },
        });
        /** @type {__VLS_StyleScopedClasses['ring-track']} */ ;
    }
    if (layout.value.showLane2Track) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ class: "ring-track faint" },
            ...{ style: ({ left: `${__VLS_ctx.x - __VLS_unwrap(px, {})(__VLS_unwrap(LANE2, {}))}px`, top: `${__VLS_ctx.y - __VLS_unwrap(px, {})(__VLS_unwrap(LANE2, {}))}px`, width: `${__VLS_unwrap(px, {})(__VLS_unwrap(LANE2, {})) * 2}px`, height: `${__VLS_unwrap(px, {})(__VLS_unwrap(LANE2, {})) * 2}px` }) },
        });
        /** @type {__VLS_StyleScopedClasses['ring-track']} */ ;
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    }
    if (layout.value.leader) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ class: "ring-leader" },
            ...{ style: ({
                    left: `${layout.value.leader.x}px`,
                    top: `${layout.value.leader.y}px`,
                    width: `${layout.value.leader.len}px`,
                    transform: `rotate(${layout.value.leader.deg}deg)`,
                }) },
        });
        /** @type {__VLS_StyleScopedClasses['ring-leader']} */ ;
    }
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(lane2, {})));
    for (const [b] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            key: (`link-${b.building.id}`),
            ...{ class: "ring-link" },
            ...{ style: ({
                    left: `${b.parentX}px`,
                    top: `${b.parentY}px`,
                    width: `${Math.hypot(b.x - b.parentX, b.y - b.parentY)}px`,
                    transform: `rotate(${(Math.atan2(b.y - b.parentY, b.x - b.parentX) * 180) / Math.PI}deg)`,
                    background: b.color,
                }) },
        });
        /** @type {__VLS_StyleScopedClasses['ring-link']} */ ;
        // @ts-ignore
        [scale, swapping, layout, layout, layout, layout, layout, layout, layout, x, x, px, px, px, px, px, px, px, px, LANE1, LANE1, LANE1, LANE1, y, y, LANE2, LANE2, LANE2, LANE2, lane2,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (onBackClick) },
        ...{ class: "ring-hub" },
        ...{ style: ({ left: `${__VLS_ctx.x}px`, top: `${__VLS_ctx.y}px`, width: `${__VLS_unwrap(px, {})(__VLS_unwrap(HUB, {}))}px`, height: `${__VLS_unwrap(px, {})(__VLS_unwrap(HUB, {}))}px`, '--d': `${__VLS_unwrap(px, {})(__VLS_unwrap(HUB, {}))}px` }) },
        title: (atRoot.value ? undefined : __VLS_unwrap(t, {})('hud.ringMenu.back')),
    });
    /** @type {__VLS_StyleScopedClasses['ring-hub']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "hub-label" },
        ...{ style: ({ fontSize: __VLS_unwrap(hubLabelFont, {}) }) },
    });
    /** @type {__VLS_StyleScopedClasses['hub-label']} */ ;
    (__VLS_unwrap(hubLabel, {}));
    if (hubSub.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "hub-sub" },
        });
        /** @type {__VLS_StyleScopedClasses['hub-sub']} */ ;
        (hubSub.value);
    }
    const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(lane1, {})));
    for (const [entry] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onTouchstart: (...[$event]) => {
                    void $event;
                    return (onLaneTouchStart($event, entry.item));
                    // @ts-ignore
                    [x, px, px, px, y, HUB, HUB, HUB, atRoot, t, hubLabelFont, hubLabel, hubSub, hubSub, lane1,];
                } },
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (onLaneClick($event, entry.item));
                    // @ts-ignore
                    [];
                } },
            ...{ onMouseenter: (...[$event]) => {
                    void $event;
                    return (hoverLane1.value = entry.item.id);
                    // @ts-ignore
                    [hoverLane1,];
                } },
            ...{ onMouseleave: (...[$event]) => {
                    void $event;
                    return (hoverLane1.value = null);
                    // @ts-ignore
                    [hoverLane1,];
                } },
            key: (entry.item.id),
            ...{ class: "ring-bubble" },
            ...{ class: ({
                    active: entry.active,
                    dim: entry.dim,
                    disabled: entry.ban,
                    'is-locked': entry.state === 'locked',
                    'is-waiting': entry.state === 'waiting',
                    category: entry.category,
                    armed: armed.value === entry.item.id,
                    'no-commit': entry.item.disabled,
                }) },
            ...{ style: ({
                    left: `${entry.x}px`,
                    top: `${entry.y}px`,
                    width: `${__VLS_unwrap(px, {})(__VLS_unwrap(BUB1, {}))}px`,
                    height: `${__VLS_unwrap(px, {})(__VLS_unwrap(BUB1, {}))}px`,
                    '--d': `${__VLS_unwrap(px, {})(__VLS_unwrap(BUB1, {}))}px`,
                    '--label-px': `${__VLS_unwrap(px, {})(entry.item.label.length > 7 ? 8.2 : 9.2)}px`,
                    '--tint': entry.color,
                }) },
            'aria-disabled': (entry.item.disabled || undefined),
            'aria-description': (entry.item.disabled ? entry.item.hint : undefined),
            'aria-label': (entry.item.label),
        });
        /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        /** @type {__VLS_StyleScopedClasses['dim']} */ ;
        /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
        /** @type {__VLS_StyleScopedClasses['category']} */ ;
        /** @type {__VLS_StyleScopedClasses['armed']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-locked']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-waiting']} */ ;
        /** @type {__VLS_StyleScopedClasses['no-commit']} */ ;
        (__VLS_unwrap(shown, {})(entry.item.label, false));
        if (entry.ban || entry.state) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ring-badge" },
                ...{ class: (entry.ban ? 'ban' : entry.state) },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['ring-badge']} */ ;
            if (entry.state === 'locked') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
                    viewBox: "0 0 12 12",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                    x: "2.5",
                    y: "5.5",
                    width: "7",
                    height: "5",
                    rx: "1",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M4 5.5V4a2 2 0 0 1 4 0v1.5",
                });
            }
            else if (entry.state === 'waiting') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
                    viewBox: "0 0 12 12",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                    cx: "6",
                    cy: "6",
                    r: "4.5",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M6 3.4V6l1.8 1.1",
                });
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
                    viewBox: "0 0 12 12",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M3 6h6",
                });
            }
        }
        if (armed.value === entry.item.id && !entry.item.disabled) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "arm-badge" },
                'data-testid': "ring-arm-badge",
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['arm-badge']} */ ;
        }
        // @ts-ignore
        [px, px, px, px, armed, armed, BUB1, BUB1, BUB1, shown,];
    }
    if (backSpot.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (onBackClick) },
            ...{ class: "ring-bubble back" },
            ...{ style: ({ left: `${backSpot.value.x}px`, top: `${backSpot.value.y}px`, width: `${__VLS_unwrap(px, {})(__VLS_unwrap(BUB1, {}))}px`, height: `${__VLS_unwrap(px, {})(__VLS_unwrap(BUB1, {}))}px`, '--d': `${__VLS_unwrap(px, {})(__VLS_unwrap(BUB1, {}))}px` }) },
        });
        /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
        /** @type {__VLS_StyleScopedClasses['back']} */ ;
        (__VLS_unwrap(t, {})('hud.ringMenu.backButton'));
    }
    const __VLS_2 = __VLS_tryAsConstant((__VLS_unwrap(lane2, {})));
    for (const [b] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onTouchstart: (...[$event]) => {
                    void $event;
                    return (onBuildingTouchStart($event, b.building));
                    // @ts-ignore
                    [px, px, px, lane2, t, BUB1, BUB1, BUB1, backSpot, backSpot, backSpot,];
                } },
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (onBuildingClick($event, b.building));
                    // @ts-ignore
                    [];
                } },
            ...{ onMouseenter: (...[$event]) => {
                    void $event;
                    return (hover.value = b.building.id);
                    // @ts-ignore
                    [hover,];
                } },
            key: (b.building.id),
            ...{ class: "ring-bubble child" },
            ...{ class: ({
                    hot: hover.value === b.building.id,
                    glow: glowing(b.building),
                    locked: stateOf(b.building) === 'locked',
                    waiting: stateOf(b.building) === 'waiting',
                    disabled: b.building.disabled,
                    armed: armed.value === b.building.id,
                    'no-commit': b.building.disabled || !__VLS_unwrap(isActionable, {})(stateOf(b.building)),
                }) },
            ...{ style: ({
                    left: `${b.x}px`,
                    top: `${b.y}px`,
                    width: `${__VLS_unwrap(px, {})(__VLS_unwrap(BUB2, {}))}px`,
                    height: `${__VLS_unwrap(px, {})(__VLS_unwrap(BUB2, {}))}px`,
                    '--d': `${__VLS_unwrap(px, {})(__VLS_unwrap(BUB2, {}))}px`,
                    '--label-px': `${__VLS_unwrap(px, {})(b.building.label.length > 7 ? 8.4 : 9.4)}px`,
                    '--tint': b.color,
                }) },
            'aria-disabled': (!__VLS_unwrap(isActionable, {})(stateOf(b.building)) || b.building.disabled || undefined),
        });
        /** @type {__VLS_StyleScopedClasses['ring-bubble']} */ ;
        /** @type {__VLS_StyleScopedClasses['child']} */ ;
        /** @type {__VLS_StyleScopedClasses['hot']} */ ;
        /** @type {__VLS_StyleScopedClasses['glow']} */ ;
        /** @type {__VLS_StyleScopedClasses['locked']} */ ;
        /** @type {__VLS_StyleScopedClasses['waiting']} */ ;
        /** @type {__VLS_StyleScopedClasses['disabled']} */ ;
        /** @type {__VLS_StyleScopedClasses['armed']} */ ;
        /** @type {__VLS_StyleScopedClasses['no-commit']} */ ;
        (__VLS_unwrap(shown, {})(b.building.label, true));
        if (stateOf(b.building) !== 'ready' && stateOf(b.building) !== 'queues') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ring-badge" },
                ...{ class: (stateOf(b.building)) },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['ring-badge']} */ ;
            if (stateOf(b.building) === 'locked') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
                    viewBox: "0 0 12 12",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                    x: "2.5",
                    y: "5.5",
                    width: "7",
                    height: "5",
                    rx: "1",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M4 5.5V4a2 2 0 0 1 4 0v1.5",
                });
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
                    viewBox: "0 0 12 12",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                    cx: "6",
                    cy: "6",
                    r: "4.5",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M6 3.4V6l1.8 1.1",
                });
            }
        }
        if (armed.value === b.building.id && !b.building.disabled && __VLS_unwrap(isActionable, {})(stateOf(b.building))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "arm-badge" },
                'data-testid': "ring-arm-badge",
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['arm-badge']} */ ;
        }
        // @ts-ignore
        [px, px, px, px, armed, armed, shown, hover, isActionable, isActionable, isActionable, BUB2, BUB2, BUB2,];
    }
    if (cardView.value && cardShown.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ring-card" },
            ...{ class: (__VLS_ctx.dock ? ['docked', `docked-${__VLS_ctx.dock}`] : []) },
            'data-testid': "ring-card",
            'data-dock': (__VLS_ctx.dock ?? undefined),
            ...{ style: (__VLS_ctx.dock || !layout.value.card ? undefined : { left: `${layout.value.card.x}px`, top: `${layout.value.card.y}px`, width: `${__VLS_unwrap(CARD_W, {})}px` }) },
        });
        /** @type {__VLS_StyleScopedClasses['ring-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "card-art" },
        });
        /** @type {__VLS_StyleScopedClasses['card-art']} */ ;
        if (cardView.value.art?.kind === 'atlas') {
            const __VLS_3 = AtlasSprite;
            // @ts-ignore
            const __VLS_4 = __VLS_asFunctionalComponent1(__VLS_3, new __VLS_3({
                // @ts-ignore
                frame: (cardView.value.art.frame), ...{ class: "card-art-img" },
            }));
            const __VLS_5 = __VLS_4({
                frame: (cardView.value.art.frame),
                ...{ class: "card-art-img" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_4));
            /** @type {__VLS_StyleScopedClasses['card-art-img']} */ ;
        }
        else if (cardView.value.art?.kind === 'png') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                ...{ class: "card-art-img" },
                src: (cardView.value.art.url),
                alt: "",
            });
            /** @type {__VLS_StyleScopedClasses['card-art-img']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "card-head" },
        });
        /** @type {__VLS_StyleScopedClasses['card-head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "card-name" },
        });
        /** @type {__VLS_StyleScopedClasses['card-name']} */ ;
        (cardView.value.title);
        if (cardView.value.sub) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "card-sub" },
            });
            /** @type {__VLS_StyleScopedClasses['card-sub']} */ ;
            (cardView.value.sub);
        }
        if (cardView.value.badge) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "card-badge" },
                ...{ class: (cardView.value.badge.tone) },
            });
            /** @type {__VLS_StyleScopedClasses['card-badge']} */ ;
            (cardView.value.badge.text);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({
            ...{ class: "card-rows" },
        });
        /** @type {__VLS_StyleScopedClasses['card-rows']} */ ;
        if (cardView.value.chips.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_unwrap(t, {})('hud.ringMenu.cost'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({
                ...{ class: "cost" },
            });
            /** @type {__VLS_StyleScopedClasses['cost']} */ ;
            const __VLS_8 = __VLS_tryAsConstant((cardView.value.chips));
            for (const [chip] of __VLS_vFor(__VLS_nonNull(__VLS_8))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    key: (chip.key),
                    ...{ class: "chip" },
                });
                /** @type {__VLS_StyleScopedClasses['chip']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                    ...{ style: ({ background: chip.color }) },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({
                    ...{ class: ({ short: chip.short }) },
                });
                /** @type {__VLS_StyleScopedClasses['short']} */ ;
                (chip.amount);
                // @ts-ignore
                [layout, layout, layout, t, cardView, cardView, cardView, cardView, cardView, cardView, cardView, cardView, cardView, cardView, cardView, cardView, cardView, cardShown, dock, dock, dock, dock, CARD_W,];
            }
        }
        if (cardView.value.time) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_unwrap(t, {})('hud.ringMenu.buildTime'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (cardView.value.time);
        }
        if (cardView.value.gives) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_unwrap(t, {})('hud.ringMenu.gives'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({
                ...{ class: "nowrap" },
            });
            /** @type {__VLS_StyleScopedClasses['nowrap']} */ ;
            (cardView.value.gives);
            if (cardView.value.givesTotal) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "gives-total" },
                    'data-testid': "ring-card-total",
                });
                /** @type {__VLS_StyleScopedClasses['gives-total']} */ ;
                (cardView.value.givesTotal);
            }
        }
        const __VLS_9 = __VLS_tryAsConstant((cardView.value.rows));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_9))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                key: (row.label),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (row.label);
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (row.value);
            // @ts-ignore
            [t, t, cardView, cardView, cardView, cardView, cardView, cardView, cardView,];
        }
        if (cardView.value.warning) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "card-warning" },
                'data-testid': "ring-card-warning",
            });
            /** @type {__VLS_StyleScopedClasses['card-warning']} */ ;
            (cardView.value.warning);
        }
        if (cardView.value.statuses.length || __VLS_ctx.error) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                ...{ class: "card-status" },
                'data-testid': "ring-card-status",
            });
            /** @type {__VLS_StyleScopedClasses['card-status']} */ ;
            const __VLS_10 = __VLS_tryAsConstant((cardView.value.statuses));
            for (const [status] of __VLS_vFor(__VLS_nonNull(__VLS_10))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    key: (status.text),
                    ...{ class: (status.tone) },
                });
                (status.text);
                // @ts-ignore
                [cardView, cardView, cardView, cardView, error,];
            }
            if (__VLS_ctx.error) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    ...{ class: "lock" },
                    'data-testid': "ring-error",
                });
                /** @type {__VLS_StyleScopedClasses['lock']} */ ;
                (__VLS_ctx.error);
            }
        }
        if (cardView.value.tapHint) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "card-tap-hint" },
                'data-testid': "ring-tap-hint",
            });
            /** @type {__VLS_StyleScopedClasses['card-tap-hint']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                ...{ class: "tap-bubble" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['tap-bubble']} */ ;
            (cardView.value.tapHint);
        }
        else if (!(cardView.value.statuses.length || __VLS_ctx.error)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                ...{ class: "card-foot" },
            });
            /** @type {__VLS_StyleScopedClasses['card-foot']} */ ;
        }
    }
    if (hintedLane1.value && hintStyle.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ring-hint" },
            'data-testid': "ring-hint",
            ...{ style: (hintStyle.value) },
        });
        /** @type {__VLS_StyleScopedClasses['ring-hint']} */ ;
        (hintedLane1.value.item.hint);
    }
    if (__VLS_ctx.error && !cardShown.value && layout.value.note) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ring-note ring-error" },
            'data-testid': "ring-error",
            ...{ style: ({ left: `${layout.value.note.x}px`, top: `${layout.value.note.y}px`, width: `${__VLS_unwrap(NOTE_W, {})}px` }) },
        });
        /** @type {__VLS_StyleScopedClasses['ring-note']} */ ;
        /** @type {__VLS_StyleScopedClasses['ring-error']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "note-body" },
        });
        /** @type {__VLS_StyleScopedClasses['note-body']} */ ;
        (__VLS_ctx.error);
    }
    // @ts-ignore
    [layout, layout, layout, cardView, cardView, cardView, cardShown, error, error, error, error, error, hintedLane1, hintedLane1, hintStyle, hintStyle, NOTE_W,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
