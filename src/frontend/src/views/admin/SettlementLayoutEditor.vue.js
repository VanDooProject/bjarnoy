/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import { isoGridPosition, isoTopPoints } from '../../lib/hex/geometry';
import { TILE_ART_TOPFACE_H_FRAC } from '../../lib/map/textures';
const { defineProps, defineEmits, } = {};
const { t } = useI18n({ useScope: 'global' });
const props = defineProps();
const emit = defineEmits();
const layout = ref(null);
const loading = ref(false);
const loadError = ref(null);
const selected = ref(null);
const building = ref('');
const level = ref(1);
const saving = ref(false);
const error = ref(null);
const notice = ref(null);
// Flat-top isometric layout matching the real settlement view (SettlementCanvas.vue /
// HexMapRenderer.ts, both built on lib/hex/geometry.ts) — this editor used to lay its
// hexes out pointy-top instead, which drew the same settlement rotated 30° relative
// to how players actually see it.
const TILE_W = 64;
const TILE_H = TILE_W * TILE_ART_TOPFACE_H_FRAC;
function topLeftOf(hex) {
    return isoGridPosition(hex, TILE_W, TILE_H);
}
function centreOf(hex) {
    const { x, y } = topLeftOf(hex);
    return { x: x + TILE_W / 2, y: y + TILE_H / 2 };
}
function pointsFor(hex) {
    const { x, y } = topLeftOf(hex);
    return isoTopPoints(TILE_W, TILE_H)
        .map((p) => `${(x + p.x).toFixed(2)},${(y + p.y).toFixed(2)}`)
        .join(' ');
}
/** The grid is centred on the settlement, so the bounds follow the hexes rather than assuming a size. */
const bounds = computed(() => {
    const hexes = layout.value?.hexes ?? [];
    if (hexes.length === 0)
        return { x: 0, y: 0, w: 100, h: 100 };
    const centres = hexes.map(centreOf);
    const minX = Math.min(...centres.map((c) => c.x)) - TILE_W * 0.6;
    const maxX = Math.max(...centres.map((c) => c.x)) + TILE_W * 0.6;
    const minY = Math.min(...centres.map((c) => c.y)) - TILE_H * 0.6;
    const maxY = Math.max(...centres.map((c) => c.y)) + TILE_H * 0.6;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
});
// Zoom/pan: the visible window is the bounds shrunk by `zoom` and shifted by
// `pan` (in grid units). Wheel zooms toward the cursor, dragging pans.
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const zoom = ref(1);
const pan = ref({ x: 0, y: 0 });
const view = computed(() => {
    const b = bounds.value;
    const w = b.w / zoom.value;
    const h = b.h / zoom.value;
    return { x: b.x + b.w / 2 + pan.value.x - w / 2, y: b.y + b.h / 2 + pan.value.y - h / 2, w, h };
});
const viewBox = computed(() => `${view.value.x} ${view.value.y} ${view.value.w} ${view.value.h}`);
/** Keeps the grid centre inside the bounds so zooming in can't pan the settlement out of view. */
function clampPan() {
    const b = bounds.value;
    const limitX = Math.max(0, (b.w - view.value.w) / 2);
    const limitY = Math.max(0, (b.h - view.value.h) / 2);
    pan.value = {
        x: Math.min(limitX, Math.max(-limitX, pan.value.x)),
        y: Math.min(limitY, Math.max(-limitY, pan.value.y)),
    };
}
/** Zooms to `next`, keeping the grid point under (fx, fy) — fractions of the svg box — where it is. */
function zoomTo(next, fx = 0.5, fy = 0.5) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (clamped === zoom.value)
        return;
    const before = view.value;
    const px = before.x + before.w * fx;
    const py = before.y + before.h * fy;
    zoom.value = clamped;
    const b = bounds.value;
    const w = b.w / clamped;
    const h = b.h / clamped;
    pan.value = {
        x: px - w * fx + w / 2 - (b.x + b.w / 2),
        y: py - h * fy + h / 2 - (b.y + b.h / 2),
    };
    clampPan();
}
function resetZoom() {
    zoom.value = 1;
    pan.value = { x: 0, y: 0 };
}
function onWheel(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const fx = rect.width ? (event.clientX - rect.left) / rect.width : 0.5;
    const fy = rect.height ? (event.clientY - rect.top) / rect.height : 0.5;
    zoomTo(zoom.value * (event.deltaY < 0 ? 1.25 : 0.8), fx, fy);
}
const DRAG_THRESHOLD_PX = 4;
let drag = null;
let suppressClick = false;
function onPointerDown(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, moved: false, w: rect.width, h: rect.height };
}
function onPointerMove(event) {
    if (!drag || zoom.value === 1 || !drag.w || !drag.h)
        return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX)
        return;
    drag.moved = true;
    pan.value = {
        x: pan.value.x - (dx / drag.w) * view.value.w,
        y: pan.value.y - (dy / drag.h) * view.value.h,
    };
    clampPan();
    drag.x = event.clientX;
    drag.y = event.clientY;
}
function onPointerUp() {
    // A drag that panned must not also count as a click on the hex it ended over.
    suppressClick = drag?.moved ?? false;
    drag = null;
    if (suppressClick)
        setTimeout(() => (suppressClick = false), 0);
}
const pending = computed(() => props.settlement.queue.length + props.settlement.trainingQueue.length);
function keyOf(hex) {
    return `${hex.q},${hex.r}`;
}
async function fetchLayout() {
    layout.value = await api.adminGetSettlementLayout(props.settlementId);
    if (selected.value) {
        selected.value = layout.value.hexes.find((h) => keyOf(h) === keyOf(selected.value)) ?? null;
    }
}
async function load() {
    loading.value = true;
    loadError.value = null;
    try {
        await fetchLayout();
    }
    catch {
        loadError.value = t('settlementLayoutEditor.loadError');
    }
    finally {
        loading.value = false;
    }
}
const refreshing = ref(false);
/** Manual "Refresh" button and the poll timer below both go through this — unlike
 * `load()` it doesn't blank the panel behind a "Loading…" message, since queued
 * builds/training finishing in the background shouldn't yank the editor out from
 * under whoever's mid-click on it. */
async function refresh() {
    if (refreshing.value || saving.value)
        return;
    refreshing.value = true;
    try {
        await fetchLayout();
        loadError.value = null;
    }
    catch {
        loadError.value = t('settlementLayoutEditor.refreshError');
    }
    finally {
        refreshing.value = false;
    }
}
watch(() => props.settlementId, load, { immediate: true });
// Background world ticks keep completing this settlement's build/training
// queues, so the grid is kept fresh on a timer too, not just after an edit.
const POLL_MS = 10_000;
let pollHandle = null;
onMounted(() => {
    pollHandle = setInterval(() => void refresh(), POLL_MS);
});
onBeforeUnmount(() => {
    if (pollHandle !== null)
        clearInterval(pollHandle);
});
function select(hex) {
    if (suppressClick)
        return;
    selected.value = hex;
    error.value = null;
    notice.value = null;
    building.value = hex.building ?? layout.value?.buildingTypes[0] ?? '';
    level.value = hex.level ?? 1;
}
/** Applies a settlement the backend just returned, then refreshes the grid it was drawn from. */
async function applied(updated, message) {
    emit('changed', updated);
    notice.value = message;
    await load();
}
async function place() {
    const hex = selected.value;
    if (!hex || saving.value || !building.value)
        return;
    saving.value = true;
    error.value = null;
    notice.value = null;
    try {
        const updated = await api.adminPlaceBuilding(props.settlementId, hex.q, hex.r, {
            building: building.value,
            level: level.value,
        });
        await applied(updated, t('settlementLayoutEditor.buildingSetToLevel', { building: building.value, level: level.value }));
    }
    catch (err) {
        error.value = err instanceof ApiError ? err.message : t('settlementLayoutEditor.placeError');
    }
    finally {
        saving.value = false;
    }
}
async function raze() {
    const hex = selected.value;
    if (!hex || saving.value || !hex.building)
        return;
    saving.value = true;
    error.value = null;
    notice.value = null;
    try {
        const updated = await api.adminRazeBuilding(props.settlementId, hex.q, hex.r);
        await applied(updated, t('settlementLayoutEditor.razed'));
    }
    catch (err) {
        error.value = err instanceof ApiError ? err.message : t('settlementLayoutEditor.razeError');
    }
    finally {
        saving.value = false;
    }
}
async function instantBuild() {
    if (saving.value)
        return;
    saving.value = true;
    error.value = null;
    notice.value = null;
    try {
        const result = await api.adminCompleteQueues(props.settlementId, { builds: true, training: true });
        await applied(result.settlement, t('settlementLayoutEditor.finishedQueue', {
            builds: result.completedBuilds,
            training: result.completedTraining,
        }));
    }
    catch (err) {
        error.value = err instanceof ApiError ? err.message : t('settlementLayoutEditor.finishQueueError');
    }
    finally {
        saving.value = false;
    }
}
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
    __VLS_withDotValue(saving, {});
    __VLS_withDotValue(pending, {});
    __VLS_withDotValue(loading, {});
    __VLS_withDotValue(refreshing, {});
    __VLS_withDotValue(loadError, {});
    __VLS_withDotValue(layout, {});
    __VLS_withDotValue(zoom, {});
    __VLS_withDotValue(selected, {});
    __VLS_withDotValue(building, {});
    __VLS_withDotValue(error, {});
    __VLS_withDotValue(notice, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['layout-editor']} */ ;
    /** @type {__VLS_StyleScopedClasses['zoom-controls']} */ ;
    /** @type {__VLS_StyleScopedClasses['hex']} */ ;
    /** @type {__VLS_StyleScopedClasses['hex']} */ ;
    /** @type {__VLS_StyleScopedClasses['hex-form']} */ ;
    /** @type {__VLS_StyleScopedClasses['hex-form']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "layout-editor" },
    });
    /** @type {__VLS_StyleScopedClasses['layout-editor']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.$t('settlementLayoutEditor.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (instantBuild) },
        ...{ class: "insta" },
        type: "button",
        disabled: (saving.value || pending.value === 0),
    });
    /** @type {__VLS_StyleScopedClasses['insta']} */ ;
    (pending.value === 0 ? __VLS_ctx.$t('settlementLayoutEditor.nothingQueued') : __VLS_ctx.$t('settlementLayoutEditor.instantBuild', { pending: pending.value }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (refresh) },
        type: "button",
        disabled: (loading.value || refreshing.value || saving.value),
    });
    (refreshing.value ? __VLS_ctx.$t('settlementLayoutEditor.refreshing') : __VLS_ctx.$t('settlementLayoutEditor.refresh'));
    if (loading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('settlementLayoutEditor.loading'));
    }
    else if (loadError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (loadError.value);
    }
    else if (layout.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "grid-and-form" },
        });
        /** @type {__VLS_StyleScopedClasses['grid-and-form']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "grid-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['grid-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "zoom-controls" },
        });
        /** @type {__VLS_StyleScopedClasses['zoom-controls']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!!(loadError.value))
                        throw 0;
                    if (!(layout.value))
                        throw 0;
                    return (zoomTo(zoom.value * 1.5));
                    // @ts-ignore
                    [$t, $t, $t, $t, $t, $t, saving, saving, pending, pending, pending, loading, loading, refreshing, refreshing, loadError, loadError, layout, zoom,];
                } },
            type: "button",
            disabled: (zoom.value >= __VLS_unwrap(MAX_ZOOM, {})),
            'aria-label': (__VLS_ctx.$t('settlementLayoutEditor.zoomIn')),
        });
        (__VLS_ctx.$t('settlementLayoutEditor.zoomInSymbol'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(loading.value))
                        throw 0;
                    if (!!(loadError.value))
                        throw 0;
                    if (!(layout.value))
                        throw 0;
                    return (zoomTo(zoom.value / 1.5));
                    // @ts-ignore
                    [$t, $t, zoom, zoom, MAX_ZOOM,];
                } },
            type: "button",
            disabled: (zoom.value <= __VLS_unwrap(MIN_ZOOM, {})),
            'aria-label': (__VLS_ctx.$t('settlementLayoutEditor.zoomOut')),
        });
        (__VLS_ctx.$t('settlementLayoutEditor.zoomOutSymbol'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (resetZoom) },
            type: "button",
            disabled: (zoom.value === 1),
        });
        (__VLS_ctx.$t('settlementLayoutEditor.zoomReset'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            ...{ onWheel: (onWheel) },
            ...{ onPointerdown: (onPointerDown) },
            ...{ onPointermove: (onPointerMove) },
            ...{ onPointerup: (onPointerUp) },
            ...{ onPointerleave: (onPointerUp) },
            ...{ class: "grid" },
            viewBox: (__VLS_unwrap(viewBox, {})),
            role: "group",
            'aria-label': (__VLS_ctx.$t('settlementLayoutEditor.gridAriaLabel')),
        });
        /** @type {__VLS_StyleScopedClasses['grid']} */ ;
        const __VLS_0 = __VLS_tryAsConstant((layout.value.hexes));
        for (const [hex] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                key: (keyOf(hex)),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(loading.value))
                            throw 0;
                        if (!!(loadError.value))
                            throw 0;
                        if (!(layout.value))
                            throw 0;
                        return (select(hex));
                        // @ts-ignore
                        [$t, $t, $t, $t, layout, zoom, zoom, MIN_ZOOM, viewBox,];
                    } },
                points: (pointsFor(hex)),
                ...{ class: ([
                        'hex',
                        `terrain-${hex.terrain}`,
                        { occupied: !!hex.building, selected: selected.value && keyOf(selected.value) === keyOf(hex) },
                    ]) },
                'data-hex': (keyOf(hex)),
            });
            /** @type {__VLS_StyleScopedClasses['occupied']} */ ;
            /** @type {__VLS_StyleScopedClasses['selected']} */ ;
            /** @type {__VLS_StyleScopedClasses['hex']} */ ;
            if (hex.building) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!(layout.value))
                                throw 0;
                            if (!(hex.building))
                                throw 0;
                            return (select(hex));
                            // @ts-ignore
                            [selected, selected,];
                        } },
                    x: (centreOf(hex).x),
                    y: (centreOf(hex).y + 4),
                    ...{ class: "label" },
                });
                /** @type {__VLS_StyleScopedClasses['label']} */ ;
                (hex.building.slice(0, 4));
                (hex.level);
            }
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "hex-form" },
        });
        /** @type {__VLS_StyleScopedClasses['hex-form']} */ ;
        if (!selected.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "hint" },
            });
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            (__VLS_ctx.$t('settlementLayoutEditor.pickHex'));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.h4, __VLS_intrinsics.h4)({});
            (selected.value.q);
            (selected.value.r);
            (selected.value.terrain);
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "standing" },
            });
            /** @type {__VLS_StyleScopedClasses['standing']} */ ;
            (selected.value.building
                ? __VLS_ctx.$t('settlementLayoutEditor.buildingLevel', { building: selected.value.building, level: selected.value.level })
                : __VLS_ctx.$t('settlementLayoutEditor.empty'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_ctx.$t('settlementLayoutEditor.building'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                value: (building.value),
            });
            const __VLS_1 = __VLS_tryAsConstant((layout.value.buildingTypes));
            for (const [type] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (type),
                    value: (type),
                });
                (type);
                // @ts-ignore
                [$t, $t, $t, $t, layout, selected, selected, selected, selected, selected, selected, selected, building,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_ctx.$t('settlementLayoutEditor.level'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "number",
                min: "1",
                max: (layout.value.maxLevel),
                step: "1",
            });
            (__VLS_unwrap(level, {}));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "actions" },
            });
            /** @type {__VLS_StyleScopedClasses['actions']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (place) },
                type: "button",
                disabled: (saving.value || !building.value),
            });
            (__VLS_ctx.$t('settlementLayoutEditor.apply'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (raze) },
                type: "button",
                ...{ class: "danger" },
                disabled: (saving.value || !selected.value.building),
            });
            /** @type {__VLS_StyleScopedClasses['danger']} */ ;
            (__VLS_ctx.$t('settlementLayoutEditor.raze'));
        }
        if (error.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "error" },
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (error.value);
        }
        else if (notice.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "notice" },
            });
            /** @type {__VLS_StyleScopedClasses['notice']} */ ;
            (notice.value);
        }
    }
    // @ts-ignore
    [$t, $t, $t, saving, saving, layout, selected, building, level, error, error, notice, notice,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
