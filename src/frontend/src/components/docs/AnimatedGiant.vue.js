/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// A standalone, animated giant composite for the Wasted Lands docs page's
// giant cards (WastedLandsView.vue): the same 7 ground-plate-base + 7
// top-part draw WastedIsland.vue's giant placements use (see that module's
// doc comment for why a giant is 14 separate per-hex sprites rather than one
// pre-composited `showcase` frame), rendered on its own rather than as part
// of an island, with any `buildings-anim` clip a top part has playing
// instead of sitting on its static frame. WastedLandsView.vue's own
// `giantFamilyHasClip` gate decides whether a family gets this treatment at
// all (today just the wasted volcano; the wasted Utgard ruin has no clips
// and stays a plain `<AtlasSprite>`).
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { isoGridPosition } from '../../lib/hex/geometry';
import { atlasBackgroundStyle } from '../../lib/map/atlas';
import { giantCoverage } from '../../lib/map/giantTiles';
import { resolveIslandFrame, resolveIslandClip, tileSpriteBox, giantTopPartBox, giantClipBoxes, TOP_FACE_Y, } from '../../lib/docs/wastedIsland';
import { clipFrameIndex, clipTimingOf } from '../../lib/map/clipPlayback';
import { useAnimationClock } from '../../composables/useAnimationClock';
const { defineProps, } = {};
const props = defineProps();
const TILE_W = 400;
const TOP_FACE_H = 184;
const ANCHOR = { q: 0, r: 0 };
// Precomputed off `family`/`plateFamily`/`orientation` (which camera pill is
// selected) — not off the animation clock. Mirrors WastedIsland.vue's own
// `resolved`/`clipLookups` split: every clip frame's box and style is
// resolved here once, and the per-tick step only picks the current one.
const layout = computed(() => {
    const out = [];
    for (const { coord, part } of giantCoverage(ANCHOR)) {
        const g = isoGridPosition(coord, TILE_W, TOP_FACE_H);
        const origin = { x: g.x, y: g.y - TOP_FACE_Y };
        const plateRect = resolveIslandFrame(`${props.plateFamily}_${props.orientation}`, 'showcase');
        const plate = plateRect
            ? {
                box: tileSpriteBox(origin, plateRect),
                style: atlasBackgroundStyle(plateRect),
            }
            : null;
        const topName = `${props.family}_${props.orientation}_level000_part${part}`;
        const topRect = resolveIslandFrame(topName, props.topCategory);
        const top = topRect
            ? {
                box: giantTopPartBox(origin, topRect),
                style: atlasBackgroundStyle(topRect),
            }
            : null;
        const resolvedClip = resolveIslandClip(topName);
        let clip = null;
        if (resolvedClip && resolvedClip.frameRects.length > 0) {
            const boxes = giantClipBoxes(origin, resolvedClip);
            clip = {
                timing: clipTimingOf(resolvedClip),
                frames: resolvedClip.frameRects.map((rect, i) => ({ box: boxes.frames[i], style: atlasBackgroundStyle(rect) })),
                rest: resolvedClip.restRect && boxes.rest
                    ? { box: boxes.rest, style: atlasBackgroundStyle(resolvedClip.restRect) }
                    : null,
            };
        }
        out.push({
            part,
            depth: g.y,
            x: g.x,
            plate,
            top,
            clip,
        });
    }
    // Same painter's-algorithm order as buildIsland: depth, then x, then a
    // hex's own plate before its own top part.
    return out.sort((a, b) => a.depth - b.depth || a.x - b.x);
});
// --- Per-tick clip playback ----------------------------------------------
const now = useAnimationClock();
const topSprites = computed(() => {
    const map = new Map();
    const elapsed = now.value;
    for (const entry of layout.value) {
        if (!entry.clip)
            continue;
        map.set(entry.part, entry.clip.frames[clipFrameIndex(entry.clip.timing, elapsed)]);
    }
    return map;
});
function topSpriteFor(entry) {
    return topSprites.value.get(entry.part) ?? entry.top;
}
// --- Bounds + contain-fit scale -------------------------------------------
const bounds = computed(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (x, y) => {
        if (x < minX)
            minX = x;
        if (y < minY)
            minY = y;
        if (x > maxX)
            maxX = x;
        if (y > maxY)
            maxY = y;
    };
    for (const entry of layout.value) {
        const clipBoxes = entry.clip ? [...entry.clip.frames.map((f) => f.box), entry.clip.rest?.box] : [];
        for (const box of [entry.plate?.box, entry.top?.box, ...clipBoxes]) {
            if (!box)
                continue;
            grow(box.left, box.top);
            grow(box.left + box.width, box.top + box.height);
        }
    }
    if (!Number.isFinite(minX))
        return { minX: 0, minY: 0, width: TILE_W, height: TOP_FACE_H };
    return { minX, minY, width: maxX - minX, height: maxY - minY };
});
function positionStyle(box) {
    const b = bounds.value;
    return {
        left: `${box.left - b.minX}px`,
        top: `${box.top - b.minY}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
    };
}
const rootEl = shallowRef(null);
const containerSize = ref({ w: 0, h: 0 });
let resizeObserver = null;
onMounted(() => {
    if (rootEl.value && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry)
                containerSize.value = {
                    w: entry.contentRect.width,
                    h: entry.contentRect.height,
                };
        });
        resizeObserver.observe(rootEl.value);
        containerSize.value = {
            w: rootEl.value.clientWidth,
            h: rootEl.value.clientHeight,
        };
    }
});
onBeforeUnmount(() => resizeObserver?.disconnect());
// Contain-fit (not just width, like WastedIsland's own scale): this sits in
// a fixed-height card box rather than a full-width page section, so both
// dimensions can constrain it depending on the giant's own aspect ratio.
const scale = computed(() => {
    const { w, h } = containerSize.value;
    const b = bounds.value;
    if (!w || !h || !b.width || !b.height)
        return 1;
    return Math.min(w / b.width, h / b.height);
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
    __VLS_withDotValue(bounds, {});
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "rootEl",
        ...{ class: "animated-giant" },
        role: "img",
    });
    /** @type {__VLS_StyleScopedClasses['animated-giant']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "world" },
        ...{ style: ({
                width: `${bounds.value.width}px`,
                height: `${bounds.value.height}px`,
                transform: `translate(-50%, -50%) scale(${__VLS_unwrap(scale, {})})`,
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['world']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(layout, {})));
    for (const [entry] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
            key: (entry.part),
        });
        if (entry.plate) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                ...{ class: "giant-sprite" },
                ...{ style: ({ ...entry.plate.style, ...positionStyle(entry.plate.box) }) },
            });
            /** @type {__VLS_StyleScopedClasses['giant-sprite']} */ ;
        }
        if (entry.clip?.rest) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                ...{ class: "giant-sprite" },
                ...{ style: ({ ...entry.clip.rest.style, ...positionStyle(entry.clip.rest.box) }) },
            });
            /** @type {__VLS_StyleScopedClasses['giant-sprite']} */ ;
        }
        if (topSpriteFor(entry)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                ...{ class: "giant-sprite" },
                ...{ style: ({ ...topSpriteFor(entry).style, ...positionStyle(topSpriteFor(entry).box) }) },
            });
            /** @type {__VLS_StyleScopedClasses['giant-sprite']} */ ;
        }
        // @ts-ignore
        [bounds, bounds, scale, layout,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
