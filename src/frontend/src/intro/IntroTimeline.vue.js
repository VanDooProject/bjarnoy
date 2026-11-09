/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, watch, watchPostEffect } from 'vue';
import { introText } from './introText';
import { chapterIndexAt, fmtTime, rowFraction, seekLimitMs } from './timeline';
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const NARROW_PX = 360;
const KEY_STEP_MS = 5000;
const PREVIOUS_CHAPTER_GRACE_MS = 1500;
const pos = ref(props.getPosition());
const sync = () => (pos.value = props.getPosition());
let frame = 0;
function loop() {
    sync();
    frame = requestAnimationFrame(loop);
}
// The playhead only needs frames while it moves.
const running = computed(() => !props.state.closed && !props.state.paused && !props.state.waiting && (props.state.phase === 'playing' || props.state.phase === 'exiting'));
watch(() => props.state, () => sync());
watch(running, (go) => {
    cancelAnimationFrame(frame);
    if (go)
        frame = requestAnimationFrame(loop);
}, { immediate: true });
onBeforeUnmount(() => cancelAnimationFrame(frame));
const total = computed(() => props.timeline.totalMs);
const chapters = computed(() => props.timeline.chapters);
const currentIndex = computed(() => chapters.value.findIndex((c) => c.id === props.state.beat));
const name = (id) => introText(props.locale, `chapters.${id}`);
const limitMs = computed(() => seekLimitMs(props.timeline, props.gated));
// ---- geometry
const trackEl = ref(null);
const barEl = ref(null);
const trackWidth = ref(0);
const barWidth = ref(0);
let observer;
function measure() {
    trackWidth.value = trackEl.value?.offsetWidth ?? 0;
    barWidth.value = barEl.value?.clientWidth ?? 0;
}
onMounted(() => {
    measure();
    if (typeof ResizeObserver !== 'undefined' && barEl.value) {
        observer = new ResizeObserver(measure);
        observer.observe(barEl.value);
    }
});
onBeforeUnmount(() => observer?.disconnect());
const narrow = computed(() => barWidth.value > 0 && barWidth.value < NARROW_PX);
const px = (ms) => (total.value > 0 ? (ms / total.value) * trackWidth.value : 0);
const pct = (ms) => (total.value > 0 ? (ms / total.value) * 100 : 0);
const segStyle = (c) => ({ left: `calc(${pct(c.startMs)}% + 1.5px)`, width: `calc(${pct(c.durMs)}% - 3px)` });
const fillStyle = (c) => ({
    transform: `scaleX(${Math.min(1, Math.max(0, (pos.value - c.startMs) / c.durMs))})`,
});
const thumbStyle = computed(() => ({ transform: `translateX(${px(pos.value)}px)` }));
// the narrow bar names only the current chapter, centred over the playhead and kept inside the bar
const oneEl = ref(null);
const oneWidth = ref(0);
watchPostEffect(() => {
    void currentIndex.value;
    void props.locale;
    oneWidth.value = oneEl.value?.offsetWidth ?? 0;
});
const oneStyle = computed(() => {
    const x = px(pos.value) - oneWidth.value / 2;
    return { left: `${Math.max(0, Math.min(barWidth.value - oneWidth.value, x))}px` };
});
// ---- expanded: hover on the timeline, keyboard focus, a drag or a pause
const hover = ref(false);
const focus = ref(false);
const dragging = ref(false);
const expanded = computed(() => !props.locked && (hover.value || focus.value || dragging.value || props.paused));
// the rows stay (faded out) when the last group finishes while the bar is open
const shownRows = ref([]);
watch(() => props.loadRows, (rows) => {
    if (rows.length > 0)
        shownRows.value = rows;
}, { immediate: true });
const showDetail = computed(() => expanded.value && props.loadRows.length > 0);
watch(showDetail, (open) => emit('detail-open', open), { immediate: true });
// ---- seeking
const hitEl = ref(null);
function msFromX(x) {
    const r = trackEl.value?.getBoundingClientRect();
    if (!r || r.width === 0)
        return 0;
    return ((x - r.left) / r.width) * total.value;
}
function onPointerDown(e) {
    if (props.locked)
        return;
    hitEl.value?.setPointerCapture?.(e.pointerId);
    dragging.value = true;
    tipMs.value = null;
    emit('drag-start');
    emit('seek', msFromX(e.clientX));
    e.preventDefault();
}
function onPointerMove(e) {
    if (dragging.value)
        emit('seek', msFromX(e.clientX));
}
function endDrag() {
    if (!dragging.value)
        return;
    dragging.value = false;
    emit('drag-end');
}
function onKeydown(e) {
    if (props.locked || e.altKey || e.ctrlKey || e.metaKey)
        return;
    const at = props.getPosition();
    const i = Math.max(0, currentIndex.value);
    const c = chapters.value[i];
    let target;
    switch (e.key) {
        case 'ArrowRight':
            target = at + KEY_STEP_MS;
            break;
        case 'ArrowLeft':
            target = at - KEY_STEP_MS;
            break;
        case 'PageDown':
            target = chapters.value[Math.min(chapters.value.length - 1, i + 1)].startMs;
            break;
        case 'PageUp':
            target = at - c.startMs > PREVIOUS_CHAPTER_GRACE_MS || i === 0 ? c.startMs : chapters.value[i - 1].startMs;
            break;
        case 'Home':
            target = 0;
            break;
        case 'End':
            target = limitMs.value;
            break;
    }
    if (target === undefined)
        return;
    e.preventDefault();
    emit('seek', target);
}
// the position while dragging
const tipMs = ref(null);
watch(() => [dragging.value, pos.value], ([drag, at]) => (tipMs.value = drag ? at : null));
const tipText = computed(() => {
    const ms = Math.max(0, Math.min(total.value, tipMs.value ?? 0));
    return `${name(chapters.value[chapterIndexAt(props.timeline, ms)].id)} · ${fmtTime(ms)}`;
});
const tipStyle = computed(() => ({ left: `${Math.min(85, Math.max(15, pct(tipMs.value ?? 0)))}%` }));
const valueText = computed(() => introText(props.locale, 'timelineValue')
    .replace('{chapter}', name(props.state.beat))
    .replace('{time}', fmtTime(pos.value))
    .replace('{total}', fmtTime(total.value)));
// ---- load
const landfall = computed(() => chapters.value.find((c) => c.role === 'exit'));
const bufferStyle = computed(() => ({ transform: `scaleX(${props.gated ? props.loadFraction : 0})` }));
const stackStyle = computed(() => ({
    right: '1.5px',
    width: `max(calc(${pct(landfall.value?.durMs ?? 0)}% - 3px), 64px)`,
}));
// ---- volume
const shownVolume = computed(() => (props.sound ? props.volume : 0));
const level = computed(() => (shownVolume.value === 0 ? 0 : shownVolume.value < 50 ? 1 : 2));
const soundLabel = computed(() => introText(props.locale, props.sound ? 'soundOff' : 'soundOn'));
const volumeOpen = ref(false);
const trackVolEl = ref(null);
function volumeFromY(y) {
    const r = trackVolEl.value?.getBoundingClientRect();
    if (!r || r.height === 0)
        return props.volume;
    return Math.round(Math.max(0, Math.min(1, (r.bottom - y) / r.height)) * 100);
}
function onVolumeDown(e) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    volumeOpen.value = true;
    emit('volume', volumeFromY(e.clientY));
    e.preventDefault();
}
function onVolumeMove(e) {
    if (volumeOpen.value)
        emit('volume', volumeFromY(e.clientY));
}
function onVolumeKey(e) {
    const steps = { ArrowUp: 10, ArrowRight: 10, ArrowDown: -10, ArrowLeft: -10, PageUp: 25, PageDown: -25 };
    let v;
    if (e.key === 'Home')
        v = 0;
    else if (e.key === 'End')
        v = 100;
    else if (e.key in steps)
        v = Math.max(0, Math.min(100, shownVolume.value + steps[e.key]));
    else
        return;
    e.preventDefault();
    emit('volume', v);
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
    __VLS_withDotValue(hover, {});
    __VLS_withDotValue(currentIndex, {});
    __VLS_withDotValue(tipMs, {});
    __VLS_withDotValue(shownRows, {});
    __VLS_withDotValue(focus, {});
    __VLS_withDotValue(volumeOpen, {});
    __VLS_withDotValue(level, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['bico']} */ ;
    /** @type {__VLS_StyleScopedClasses['bico']} */ ;
    /** @type {__VLS_StyleScopedClasses['hit']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['hit']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['track']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['locked']} */ ;
    /** @type {__VLS_StyleScopedClasses['track']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['sg']} */ ;
    /** @type {__VLS_StyleScopedClasses['sg']} */ ;
    /** @type {__VLS_StyleScopedClasses['sg']} */ ;
    /** @type {__VLS_StyleScopedClasses['lockd']} */ ;
    /** @type {__VLS_StyleScopedClasses['sg']} */ ;
    /** @type {__VLS_StyleScopedClasses['fill']} */ ;
    /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
    /** @type {__VLS_StyleScopedClasses['clabel']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['clabel']} */ ;
    /** @type {__VLS_StyleScopedClasses['clabel']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['clabel']} */ ;
    /** @type {__VLS_StyleScopedClasses['one']} */ ;
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['narrow']} */ ;
    /** @type {__VLS_StyleScopedClasses['clabel']} */ ;
    /** @type {__VLS_StyleScopedClasses['one']} */ ;
    /** @type {__VLS_StyleScopedClasses['tip']} */ ;
    /** @type {__VLS_StyleScopedClasses['show']} */ ;
    /** @type {__VLS_StyleScopedClasses['stack']} */ ;
    /** @type {__VLS_StyleScopedClasses['show']} */ ;
    /** @type {__VLS_StyleScopedClasses['lb']} */ ;
    /** @type {__VLS_StyleScopedClasses['srow']} */ ;
    /** @type {__VLS_StyleScopedClasses['lb']} */ ;
    /** @type {__VLS_StyleScopedClasses['nm']} */ ;
    /** @type {__VLS_StyleScopedClasses['ct']} */ ;
    /** @type {__VLS_StyleScopedClasses['srow']} */ ;
    /** @type {__VLS_StyleScopedClasses['nm']} */ ;
    /** @type {__VLS_StyleScopedClasses['srow']} */ ;
    /** @type {__VLS_StyleScopedClasses['done']} */ ;
    /** @type {__VLS_StyleScopedClasses['ct']} */ ;
    /** @type {__VLS_StyleScopedClasses['vol']} */ ;
    /** @type {__VLS_StyleScopedClasses['vpop']} */ ;
    /** @type {__VLS_StyleScopedClasses['vol']} */ ;
    /** @type {__VLS_StyleScopedClasses['vpop']} */ ;
    /** @type {__VLS_StyleScopedClasses['vol']} */ ;
    /** @type {__VLS_StyleScopedClasses['vpop']} */ ;
    /** @type {__VLS_StyleScopedClasses['vol']} */ ;
    /** @type {__VLS_StyleScopedClasses['bico']} */ ;
    /** @type {__VLS_StyleScopedClasses['vol']} */ ;
    /** @type {__VLS_StyleScopedClasses['bico']} */ ;
    /** @type {__VLS_StyleScopedClasses['vslider']} */ ;
    /** @type {__VLS_StyleScopedClasses['bico']} */ ;
    /** @type {__VLS_StyleScopedClasses['bico']} */ ;
    /** @type {__VLS_StyleScopedClasses['sound']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-muted']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
    /** @type {__VLS_StyleScopedClasses['sg']} */ ;
    /** @type {__VLS_StyleScopedClasses['lockd']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
    /** @type {__VLS_StyleScopedClasses['sg']} */ ;
    /** @type {__VLS_StyleScopedClasses['waiting']} */ ;
    /** @type {__VLS_StyleScopedClasses['fill']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ctrl" },
        ...{ class: ({ 'is-still': __VLS_ctx.reducedMotion }) },
        'data-testid': "intro-controls",
    });
    /** @type {__VLS_StyleScopedClasses['ctrl']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (__VLS_unwrap(emit, {})('toggle-pause'));
                // @ts-ignore
                [reducedMotion, emit,];
            } },
        type: "button",
        ...{ class: "bico" },
        'aria-label': (__VLS_unwrap(introText, {})(__VLS_ctx.locale, __VLS_ctx.paused ? 'resume' : 'pause')),
        'aria-pressed': (__VLS_ctx.paused),
        'data-testid': "intro-pause",
    });
    /** @type {__VLS_StyleScopedClasses['bico']} */ ;
    if (__VLS_ctx.paused) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            viewBox: "0 0 24 24",
            width: "20",
            height: "20",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M7 4.5v15l12.5-7.5z",
            fill: "currentColor",
        });
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            viewBox: "0 0 24 24",
            width: "20",
            height: "20",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "6",
            y: "4.5",
            width: "4",
            height: "15",
            rx: "1",
            fill: "currentColor",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "14",
            y: "4.5",
            width: "4",
            height: "15",
            rx: "1",
            fill: "currentColor",
        });
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onPointerenter: (...[$event]) => {
                void $event;
                return (hover.value = true);
                // @ts-ignore
                [introText, locale, paused, paused, paused, hover,];
            } },
        ...{ onPointerleave: (...[$event]) => {
                void $event;
                return (hover.value = false);
                // @ts-ignore
                [hover,];
            } },
        ref: "barEl",
        ...{ class: "bar" },
        ...{ class: ({ expanded: __VLS_unwrap(expanded, {}), narrow: __VLS_unwrap(narrow, {}), locked: __VLS_ctx.locked }) },
    });
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['expanded']} */ ;
    /** @type {__VLS_StyleScopedClasses['narrow']} */ ;
    /** @type {__VLS_StyleScopedClasses['locked']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "trackEl",
        ...{ class: "track" },
    });
    /** @type {__VLS_StyleScopedClasses['track']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(chapters, {})));
    for (const [c] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (c.id),
            ...{ class: "sg" },
            ...{ class: ({ lockd: __VLS_ctx.gated && c.role === 'exit', waiting: __VLS_ctx.state.waiting && c.role === 'hold' }) },
            'data-chapter': (c.id),
            ...{ style: (__VLS_unwrap(segStyle, {})(c)) },
        });
        /** @type {__VLS_StyleScopedClasses['sg']} */ ;
        /** @type {__VLS_StyleScopedClasses['lockd']} */ ;
        /** @type {__VLS_StyleScopedClasses['waiting']} */ ;
        if (c.role === 'exit') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "bufl" },
                ...{ style: (__VLS_unwrap(bufferStyle, {})) },
            });
            /** @type {__VLS_StyleScopedClasses['bufl']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "fill" },
            ...{ style: (__VLS_unwrap(fillStyle, {})(c)) },
        });
        /** @type {__VLS_StyleScopedClasses['fill']} */ ;
        // @ts-ignore
        [expanded, narrow, locked, chapters, gated, state, segStyle, bufferStyle, fillStyle,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "clabels" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['clabels']} */ ;
    const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(chapters, {})));
    for (const [c, i] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            key: (c.id),
            ...{ class: "clabel" },
            ...{ class: ({ cur: i === currentIndex.value }) },
            ...{ style: (__VLS_unwrap(segStyle, {})(c)) },
        });
        /** @type {__VLS_StyleScopedClasses['clabel']} */ ;
        /** @type {__VLS_StyleScopedClasses['cur']} */ ;
        (__VLS_unwrap(name, {})(c.id));
        // @ts-ignore
        [chapters, segStyle, currentIndex, name,];
    }
    if (currentIndex.value >= 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ref: "oneEl",
            ...{ class: "clabel cur one" },
            ...{ style: (__VLS_unwrap(oneStyle, {})) },
        });
        /** @type {__VLS_StyleScopedClasses['clabel']} */ ;
        /** @type {__VLS_StyleScopedClasses['cur']} */ ;
        /** @type {__VLS_StyleScopedClasses['one']} */ ;
        (__VLS_unwrap(name, {})(__VLS_ctx.state.beat));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "thumb" },
        ...{ class: ({ hidden: __VLS_ctx.state.waiting }) },
        ...{ style: (__VLS_unwrap(thumbStyle, {})) },
    });
    /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['hidden']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spinwrap" },
        ...{ style: (__VLS_unwrap(thumbStyle, {})) },
    });
    /** @type {__VLS_StyleScopedClasses['spinwrap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "spin" },
        ...{ class: ({ show: __VLS_ctx.state.waiting }) },
    });
    /** @type {__VLS_StyleScopedClasses['spin']} */ ;
    /** @type {__VLS_StyleScopedClasses['show']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tip" },
        ...{ class: ({ show: tipMs.value !== null }) },
        ...{ style: (__VLS_unwrap(tipStyle, {})) },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['tip']} */ ;
    /** @type {__VLS_StyleScopedClasses['show']} */ ;
    (__VLS_unwrap(tipText, {}));
    if (shownRows.value.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "stack" },
            ...{ class: ({ show: __VLS_unwrap(showDetail, {}) }) },
            ...{ style: (__VLS_unwrap(stackStyle, {})) },
            'aria-hidden': "true",
            'data-testid': "intro-load-detail",
        });
        /** @type {__VLS_StyleScopedClasses['stack']} */ ;
        /** @type {__VLS_StyleScopedClasses['show']} */ ;
        const __VLS_2 = __VLS_tryAsConstant((shownRows.value));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (row.id),
                ...{ class: "srow" },
                ...{ class: ({ anim: !row.gating, done: row.total > 0 && row.loaded >= row.total }) },
                'data-group': (row.id),
            });
            /** @type {__VLS_StyleScopedClasses['srow']} */ ;
            /** @type {__VLS_StyleScopedClasses['anim']} */ ;
            /** @type {__VLS_StyleScopedClasses['done']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "nm" },
            });
            /** @type {__VLS_StyleScopedClasses['nm']} */ ;
            (__VLS_unwrap(introText, {})(__VLS_ctx.locale, `loadGroups.${row.id}`));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "lb" },
            });
            /** @type {__VLS_StyleScopedClasses['lb']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({
                ...{ style: ({ transform: `scaleX(${__VLS_unwrap(rowFraction, {})(row)})` }) },
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ct" },
            });
            /** @type {__VLS_StyleScopedClasses['ct']} */ ;
            (row.loaded);
            (row.total > 0 ? row.total : '?');
            // @ts-ignore
            [introText, locale, state, state, state, currentIndex, name, oneStyle, thumbStyle, thumbStyle, tipMs, tipStyle, tipText, shownRows, shownRows, showDetail, stackStyle, rowFraction,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onFocus: (...[$event]) => {
                void $event;
                return (focus.value = true);
                // @ts-ignore
                [focus,];
            } },
        ...{ onBlur: (...[$event]) => {
                void $event;
                return (focus.value = false);
                // @ts-ignore
                [focus,];
            } },
        ...{ onPointerdown: (onPointerDown) },
        ...{ onPointermove: (onPointerMove) },
        ...{ onPointerup: (endDrag) },
        ...{ onPointercancel: (endDrag) },
        ...{ onKeydown: (onKeydown) },
        ref: "hitEl",
        ...{ class: "hit" },
        role: "slider",
        tabindex: "0",
        'aria-label': (__VLS_unwrap(introText, {})(__VLS_ctx.locale, 'timeline')),
        'aria-valuemin': (0),
        'aria-valuemax': (Math.round(__VLS_unwrap(limitMs, {}) / 1000)),
        'aria-valuenow': (Math.round(__VLS_unwrap(pos, {}) / 1000)),
        'aria-valuetext': (__VLS_unwrap(valueText, {})),
        'aria-disabled': (__VLS_ctx.locked),
        'data-testid': "intro-timeline",
    });
    /** @type {__VLS_StyleScopedClasses['hit']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "itime" },
        'data-testid': "intro-time",
    });
    /** @type {__VLS_StyleScopedClasses['itime']} */ ;
    (__VLS_unwrap(fmtTime, {})(__VLS_unwrap(pos, {})));
    (__VLS_unwrap(fmtTime, {})(__VLS_unwrap(total, {})));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "vol" },
        ...{ class: ({ open: volumeOpen.value }) },
    });
    /** @type {__VLS_StyleScopedClasses['vol']} */ ;
    /** @type {__VLS_StyleScopedClasses['open']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "vpop" },
    });
    /** @type {__VLS_StyleScopedClasses['vpop']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onPointerdown: (onVolumeDown) },
        ...{ onPointermove: (onVolumeMove) },
        ...{ onPointerup: (...[$event]) => {
                void $event;
                return (volumeOpen.value = false);
                // @ts-ignore
                [introText, locale, locked, limitMs, pos, pos, valueText, fmtTime, fmtTime, total, volumeOpen, volumeOpen,];
            } },
        ...{ onPointercancel: (...[$event]) => {
                void $event;
                return (volumeOpen.value = false);
                // @ts-ignore
                [volumeOpen,];
            } },
        ...{ onKeydown: (onVolumeKey) },
        ...{ class: "vslider" },
        role: "slider",
        tabindex: "0",
        'aria-orientation': "vertical",
        'aria-label': (__VLS_unwrap(introText, {})(__VLS_ctx.locale, 'volume')),
        'aria-valuemin': (0),
        'aria-valuemax': (100),
        'aria-valuenow': (__VLS_unwrap(shownVolume, {})),
        'data-testid': "intro-volume",
    });
    /** @type {__VLS_StyleScopedClasses['vslider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "trackVolEl",
        ...{ class: "vtrack" },
    });
    /** @type {__VLS_StyleScopedClasses['vtrack']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "vfill" },
        ...{ style: ({ transform: `scaleY(${__VLS_unwrap(shownVolume, {}) / 100})` }) },
    });
    /** @type {__VLS_StyleScopedClasses['vfill']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "vknob" },
        ...{ style: ({ bottom: `calc(10px + ${__VLS_unwrap(shownVolume, {}) / 100} * (100% - 20px))` }) },
    });
    /** @type {__VLS_StyleScopedClasses['vknob']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (__VLS_unwrap(emit, {})('sound'));
                // @ts-ignore
                [emit, introText, locale, shownVolume, shownVolume, shownVolume,];
            } },
        type: "button",
        ...{ class: "bico sound" },
        ...{ class: ({ 'is-muted': !__VLS_ctx.sound, 'is-still': __VLS_ctx.reducedMotion }) },
        'aria-label': (__VLS_unwrap(soundLabel, {})),
        'aria-pressed': (__VLS_ctx.sound),
        'data-testid': "intro-sound",
        'data-sound': (__VLS_ctx.sound ? 'on' : 'off'),
        'data-level': (level.value),
    });
    /** @type {__VLS_StyleScopedClasses['bico']} */ ;
    /** @type {__VLS_StyleScopedClasses['sound']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-muted']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
        viewBox: "0 0 24 24",
        width: "20",
        height: "20",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
        'stroke-linecap': "round",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z",
        fill: "currentColor",
    });
    if (level.value === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M16 9.5l5 5M21 9.5l-5 5",
        });
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M15.5 9.5a3.5 3.5 0 0 1 0 5",
        });
        if (level.value === 2) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M18 7a7 7 0 0 1 0 10",
            });
        }
    }
    // @ts-ignore
    [reducedMotion, sound, sound, sound, soundLabel, level, level, level,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
