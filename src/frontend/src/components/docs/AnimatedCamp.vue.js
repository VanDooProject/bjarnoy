/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// A wildlife camp's guarded state, animated, for the camps docs page
// (WildlifeCampsView.vue): the cleared camp's `showcase` frame (ground plus
// the empty camp, 400x600 canvas) with the guarded level's `buildings-anim`
// clip playing over it. A camp clip is an overlay clip whose frames carry
// only the animals (every camp part is animated and sets
// `anim_rest_shadow = False`, 3D_assets docs/wildlife-camps.md), so the
// cleared frame is the whole still background and the clip's own rest image
// - the same camp at half the resolution - is not drawn.
//
// The clip is rendered at 200x300, half the showcase canvas, so its frames
// are drawn at 2x into the same canvas. The view is cropped to the union of
// the background's trim and every clip frame's box (the eyrie's circling
// eagle flies above the stack's own trim) and contain-fitted into its box.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { atlasBackgroundStyle, findAtlasClip, findAtlasFrame } from '../../lib/map/atlas';
import { clipFrameIndex, clipTimingOf } from '../../lib/map/clipPlayback';
import { useAnimationClock } from '../../composables/useAnimationClock';
const { defineProps, } = {};
const props = defineProps();
/** A frame's box on the 400x600 showcase canvas; `k` scales a half-size (200x300) clip frame up. */
function boxOf(rect, k) {
    return {
        left: k * rect.spriteSourceSize.x,
        top: k * rect.spriteSourceSize.y,
        width: k * rect.frame.w,
        height: k * rect.frame.h,
    };
}
const background = computed(() => findAtlasFrame('showcase', `${props.family}_${props.orientation}_level000`));
const clip = computed(() => {
    const c = findAtlasClip('buildings-anim', `${props.family}_${props.orientation}_level001`);
    if (!c || c.frameRects.length === 0 || !background.value)
        return null;
    const k = background.value.sourceSize.w / c.frameRects[0].sourceSize.w;
    return { timing: clipTimingOf(c), frames: c.frameRects.map((rect) => ({ rect, box: boxOf(rect, k) })) };
});
const bounds = computed(() => {
    const boxes = [
        ...(background.value ? [boxOf(background.value, 1)] : []),
        ...(clip.value?.frames.map((f) => f.box) ?? []),
    ];
    if (boxes.length === 0)
        return { left: 0, top: 0, width: 400, height: 600 };
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    const right = Math.max(...boxes.map((b) => b.left + b.width));
    const bottom = Math.max(...boxes.map((b) => b.top + b.height));
    return { left, top, width: right - left, height: bottom - top };
});
const now = useAnimationClock();
const frame = computed(() => {
    const c = clip.value;
    return c ? c.frames[clipFrameIndex(c.timing, now.value)] : null;
});
function place(rect, box) {
    const b = bounds.value;
    return {
        ...atlasBackgroundStyle(rect),
        left: `${box.left - b.left}px`,
        top: `${box.top - b.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
    };
}
const rootEl = shallowRef(null);
const size = ref({ w: 0, h: 0 });
let observer = null;
onMounted(() => {
    if (!rootEl.value)
        return;
    size.value = { w: rootEl.value.clientWidth, h: rootEl.value.clientHeight };
    if (typeof ResizeObserver === 'undefined')
        return;
    observer = new ResizeObserver(([entry]) => {
        if (entry)
            size.value = { w: entry.contentRect.width, h: entry.contentRect.height };
    });
    observer.observe(rootEl.value);
});
onBeforeUnmount(() => observer?.disconnect());
const scale = computed(() => {
    const { w, h } = size.value;
    const b = bounds.value;
    return w && h ? Math.min(w / b.width, h / b.height) : 1;
});
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(clip, {});
    __VLS_withDotValue(bounds, {});
    __VLS_withDotValue(background, {});
    __VLS_withDotValue(frame, {});
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "rootEl",
        ...{ class: "animated-camp" },
        role: "img",
        'data-animated': (clip.value ? 'true' : 'false'),
    });
    /** @type {__VLS_StyleScopedClasses['animated-camp']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "world" },
        ...{ style: ({
                width: `${bounds.value.width}px`,
                height: `${bounds.value.height}px`,
                transform: `translate(-50%, -50%) scale(${__VLS_unwrap(scale, {})})`,
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['world']} */ ;
    if (background.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ class: "layer" },
            ...{ style: (place(background.value, boxOf(background.value, 1))) },
        });
        /** @type {__VLS_StyleScopedClasses['layer']} */ ;
    }
    if (frame.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
            ...{ class: "layer" },
            ...{ style: (place(frame.value.rect, frame.value.box)) },
        });
        /** @type {__VLS_StyleScopedClasses['layer']} */ ;
    }
    // @ts-ignore
    [clip, bounds, bounds, scale, background, background, background, frame, frame, frame,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
