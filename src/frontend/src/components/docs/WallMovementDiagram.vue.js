/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Six tiny pictures of the palisade's movement rules: the ground as hexes, the wall as a brown line drawn along the
// middle of its hexes (a gate is a gap in the line between two posts), and an army (the blue dot) walking at it from
// the left. The arrow is green where the army gets through (labelled where it is slower) and red with a cross where it is
// stopped. Plain SVG, no art, so it also reads where the atlas is not loaded.
const R = 12;
const STEP = 21;
const CENTRES = [14, 14 + STEP, 14 + 2 * STEP, 14 + 3 * STEP, 14 + 4 * STEP];
const X = 78;
/** Half the width of a gate's gap: the posts stand this far either side of the gate hex's centre. */
const GATE_HALF = 6;
function hex(cx, cy) {
    const pts = [0, 1, 2, 3, 4, 5].map((i) => {
        const a = (Math.PI / 3) * i;
        return `${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)}`;
    });
    return pts.join(' ');
}
const ROWS = [
    {
        id: 'sealed',
        cells: ['mountain', 'grass', 'sand', 'grass', 'mountain'],
        wall: { from: 1, to: 3 },
        walk: { row: 2, through: false },
    },
    {
        id: 'riverEnd',
        cells: ['river', 'grass', 'sand', 'grass', 'mountain'],
        wall: { from: 1, to: 3 },
        walk: { row: 2, through: false },
    },
    {
        id: 'halfOpen',
        cells: ['grass', 'grass', 'sand', 'grass', 'mountain'],
        wall: { from: 1, to: 3 },
        walk: { row: 1, through: true, slower: true },
    },
    {
        id: 'stream',
        cells: ['stream', 'grass', 'sand', 'grass', 'mountain'],
        wall: { from: 1, to: 3 },
        walk: { row: 1, through: true, slower: true },
    },
    {
        id: 'seaEnd',
        cells: ['water', 'grass', 'sand', 'grass', 'mountain'],
        wall: { from: 0, to: 3 },
        walk: { row: 2, through: false },
    },
    {
        id: 'gate',
        cells: ['mountain', 'grass', 'grass', 'grass', 'mountain'],
        wall: { from: 1, to: 3, gate: 2 },
        walk: { row: 2, through: true },
    },
];
/** The legend under the pictures, in the order a reader meets things: the line, the ground, then the army. */
const LEGEND = [
    { kind: 'wall', id: 'wall' },
    { kind: 'gate', id: 'gate' },
    { kind: 'ground', id: 'grass' },
    { kind: 'ground', id: 'sand' },
    { kind: 'ground', id: 'water' },
    { kind: 'ground', id: 'mountain' },
    { kind: 'ground', id: 'river' },
    { kind: 'ground', id: 'stream' },
    { kind: 'army', id: 'army' },
    { kind: 'pass', id: 'pass' },
    { kind: 'blocked', id: 'blocked' },
];
/** Marks drawn on top of a hex so the ground reads without its colour. */
function peak(cx, cy) {
    return `M${cx - 6} ${cy + 4} L${cx - 1} ${cy - 5} L${cx + 2} ${cy} L${cx + 4} ${cy - 2} L${cx + 7} ${cy + 4}`;
}
function waves(cx, cy) {
    return [-3, 3].map((dy) => `M${cx - 7} ${cy + dy} q2.5 -3 5 0 t5 0 t5 0`).join(' ');
}
/** A wide river: two waves running across the hex. A stream is a single thinner one. */
function river(cx, cy) {
    return [-4, 4].map((dy) => `M${cx - 9} ${cy + dy} q4.5 -4 9 0 t9 0`).join(' ');
}
function stream(cx, cy) {
    return `M${cx - 9} ${cy} q4.5 -4 9 0 t9 0`;
}
function marks(ground, cx, cy) {
    if (ground === 'mountain')
        return { d: peak(cx, cy), cls: 'peak' };
    if (ground === 'water')
        return { d: waves(cx, cy), cls: 'waves' };
    if (ground === 'river')
        return { d: river(cx, cy), cls: 'stream wide' };
    if (ground === 'stream')
        return { d: stream(cx, cy), cls: 'stream' };
    return null;
}
/** The wall's line as one or two segments: a gate cuts a gap into it. */
function segments(wall) {
    const y1 = CENTRES[wall.from];
    const y2 = CENTRES[wall.to];
    if (wall.gate === undefined)
        return [{ y1, y2 }];
    const g = CENTRES[wall.gate];
    return [
        { y1, y2: g - GATE_HALF },
        { y1: g + GATE_HALF, y2 },
    ];
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(CENTRES, {});
    __VLS_withDotValue(X, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['river']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['stream']} */ ;
    /** @type {__VLS_StyleScopedClasses['stream']} */ ;
    /** @type {__VLS_StyleScopedClasses['peak']} */ ;
    /** @type {__VLS_StyleScopedClasses['waves']} */ ;
    /** @type {__VLS_StyleScopedClasses['stream']} */ ;
    /** @type {__VLS_StyleScopedClasses['stream']} */ ;
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    /** @type {__VLS_StyleScopedClasses['path']} */ ;
    /** @type {__VLS_StyleScopedClasses['path']} */ ;
    /** @type {__VLS_StyleScopedClasses['ok']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "movement-diagram" },
        'data-testid': "wall-movement-diagram",
    });
    /** @type {__VLS_StyleScopedClasses['movement-diagram']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(ROWS, {})));
    for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.figure, __VLS_intrinsics.figure)({
            key: (row.id),
            ...{ class: "case" },
            'data-case': (row.id),
        });
        /** @type {__VLS_StyleScopedClasses['case']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            viewBox: "0 0 140 112",
            role: "img",
            'aria-label': (__VLS_ctx.$t(`docs.walls.movement.diagram.${row.id}`)),
        });
        const __VLS_1 = __VLS_tryAsConstant((row.cells));
        for (const [cell, i] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                key: (i),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
                points: (hex(X.value, CENTRES.value[i])),
                ...{ class: (['cell', cell]) },
            });
            /** @type {__VLS_StyleScopedClasses['cell']} */ ;
            if (marks(cell, X.value, CENTRES.value[i])) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: (marks(cell, X.value, CENTRES.value[i]).d),
                    ...{ class: (marks(cell, X.value, CENTRES.value[i]).cls) },
                });
            }
            // @ts-ignore
            [ROWS, $t, X, X, X, X, CENTRES, CENTRES, CENTRES, CENTRES,];
        }
        const __VLS_2 = __VLS_tryAsConstant((segments(row.wall)));
        for (const [seg, i] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
                key: (i),
                ...{ class: "wall" },
                x1: (X.value),
                y1: (seg.y1),
                x2: (X.value),
                y2: (seg.y2),
            });
            /** @type {__VLS_StyleScopedClasses['wall']} */ ;
            // @ts-ignore
            [X, X,];
        }
        if (row.wall.gate !== undefined) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                ...{ class: "post" },
                cx: (X.value),
                cy: (CENTRES.value[row.wall.gate] - __VLS_unwrap(GATE_HALF, {})),
                r: "3",
            });
            /** @type {__VLS_StyleScopedClasses['post']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                ...{ class: "post" },
                cx: (X.value),
                cy: (CENTRES.value[row.wall.gate] + __VLS_unwrap(GATE_HALF, {})),
                r: "3",
            });
            /** @type {__VLS_StyleScopedClasses['post']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: "army" },
            cx: "14",
            cy: (CENTRES.value[row.walk.row]),
            r: "5",
        });
        /** @type {__VLS_StyleScopedClasses['army']} */ ;
        if (row.walk.through) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
                ...{ class: "path ok" },
                x1: "22",
                y1: (CENTRES.value[row.walk.row]),
                x2: "132",
                y2: (CENTRES.value[row.walk.row]),
            });
            /** @type {__VLS_StyleScopedClasses['path']} */ ;
            /** @type {__VLS_StyleScopedClasses['ok']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
                ...{ class: "head ok" },
                points: (`132,${CENTRES.value[row.walk.row] - 5} 138,${CENTRES.value[row.walk.row]} 132,${CENTRES.value[row.walk.row] + 5}`),
            });
            /** @type {__VLS_StyleScopedClasses['head']} */ ;
            /** @type {__VLS_StyleScopedClasses['ok']} */ ;
            if (row.walk.slower) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.text, __VLS_intrinsics.text)({
                    ...{ class: "slower" },
                    x: "136",
                    y: (CENTRES.value[row.walk.row] - 6),
                    'text-anchor': "end",
                });
                /** @type {__VLS_StyleScopedClasses['slower']} */ ;
                (__VLS_ctx.$t('docs.walls.movement.diagram.slower'));
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
                ...{ class: "path no" },
                x1: "22",
                y1: (CENTRES.value[row.walk.row]),
                x2: "54",
                y2: (CENTRES.value[row.walk.row]),
            });
            /** @type {__VLS_StyleScopedClasses['path']} */ ;
            /** @type {__VLS_StyleScopedClasses['no']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                ...{ class: "cross" },
                d: (`M54 ${CENTRES.value[row.walk.row] - 6} l12 12 M66 ${CENTRES.value[row.walk.row] - 6} l-12 12`),
            });
            /** @type {__VLS_StyleScopedClasses['cross']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.figcaption, __VLS_intrinsics.figcaption)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_ctx.$t(`docs.walls.movement.diagram.${row.id}Title`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t(`docs.walls.movement.diagram.${row.id}`));
        // @ts-ignore
        [$t, $t, $t, X, X, CENTRES, CENTRES, CENTRES, CENTRES, CENTRES, CENTRES, CENTRES, CENTRES, CENTRES, CENTRES, CENTRES, CENTRES, CENTRES, GATE_HALF, GATE_HALF,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "legend" },
        'data-testid': "wall-movement-legend",
    });
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    const __VLS_3 = __VLS_tryAsConstant((__VLS_unwrap(LEGEND, {})));
    for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            key: (item.id),
            'data-legend': (item.id),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            viewBox: "0 0 28 28",
            'aria-hidden': "true",
        });
        if (item.kind === 'ground') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
                points: (hex(14, 14)),
                ...{ class: (['cell', item.id]) },
            });
            /** @type {__VLS_StyleScopedClasses['cell']} */ ;
            if (marks(item.id, 14, 14)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: (marks(item.id, 14, 14).d),
                    ...{ class: (marks(item.id, 14, 14).cls) },
                });
            }
        }
        else if (item.kind === 'wall') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
                ...{ class: "wall" },
                x1: "14",
                y1: "3",
                x2: "14",
                y2: "25",
            });
            /** @type {__VLS_StyleScopedClasses['wall']} */ ;
        }
        else if (item.kind === 'gate') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
                ...{ class: "wall" },
                x1: "14",
                y1: "2",
                x2: "14",
                y2: "7",
            });
            /** @type {__VLS_StyleScopedClasses['wall']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
                ...{ class: "wall" },
                x1: "14",
                y1: "21",
                x2: "14",
                y2: "26",
            });
            /** @type {__VLS_StyleScopedClasses['wall']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                ...{ class: "post" },
                cx: "14",
                cy: "8",
                r: "3",
            });
            /** @type {__VLS_StyleScopedClasses['post']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                ...{ class: "post" },
                cx: "14",
                cy: "20",
                r: "3",
            });
            /** @type {__VLS_StyleScopedClasses['post']} */ ;
        }
        else if (item.kind === 'army') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                ...{ class: "army" },
                cx: "14",
                cy: "14",
                r: "5",
            });
            /** @type {__VLS_StyleScopedClasses['army']} */ ;
        }
        else if (item.kind === 'pass') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
                ...{ class: "path ok" },
                x1: "3",
                y1: "14",
                x2: "21",
                y2: "14",
            });
            /** @type {__VLS_StyleScopedClasses['path']} */ ;
            /** @type {__VLS_StyleScopedClasses['ok']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.polygon)({
                ...{ class: "head ok" },
                points: "21,9 27,14 21,19",
            });
            /** @type {__VLS_StyleScopedClasses['head']} */ ;
            /** @type {__VLS_StyleScopedClasses['ok']} */ ;
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.line)({
                ...{ class: "path no" },
                x1: "2",
                y1: "14",
                x2: "9",
                y2: "14",
            });
            /** @type {__VLS_StyleScopedClasses['path']} */ ;
            /** @type {__VLS_StyleScopedClasses['no']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                ...{ class: "cross" },
                d: "M13 8 l12 12 M25 8 l-12 12",
            });
            /** @type {__VLS_StyleScopedClasses['cross']} */ ;
        }
        (__VLS_ctx.$t(`docs.walls.movement.diagram.legend.${item.id}`));
        // @ts-ignore
        [$t, LEGEND,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
