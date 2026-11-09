/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsPicker from '../components/docs/DocsPicker.vue';
import DocsTileEntry from '../components/docs/DocsTileEntry.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import { useDocsAdminNotes } from '../composables/useDocsAdminNotes';
import WallExample from '../components/docs/WallExample.vue';
import WallMovementDiagram from '../components/docs/WallMovementDiagram.vue';
import WallPiece from '../components/docs/WallPiece.vue';
import { findAtlasFrame } from '../lib/map/atlas';
import { TILE_ORIENTATIONS } from '../lib/map/types';
import { PALISADE_PIECES, WALL_GROUNDS, usePieceStages } from '../lib/docs/palisadeDocs';
import { WALL_SIEGE } from '../lib/docs/wallSiegeDocs';
const { t } = useI18n({ useScope: 'global' });
// The palisade set (3D_assets hextile055-060, docs/wall-tiles.md; docs/design/economy.md section 5 here is the
// game side). How many stages each piece has is read off the atlas, so the stage the art adds next shows up with
// the next art drop.
const NAME_KEY = {
    straight180: 'straight',
    bend60: 'bend60',
    bend120: 'bend120',
    gate180: 'gate',
    end: 'end',
    end_coast: 'seaEnd',
};
const { stages, stageOf, pick } = usePieceStages((name) => !!findAtlasFrame('buildings-static', name));
const PIECES = PALISADE_PIECES.map((piece) => ({ piece, id: `piece-${piece}`, key: NAME_KEY[piece] }));
const dirs = reactive(Object.fromEntries(PIECES.map((p) => [p.piece, 'SE'])));
function stageLabel(stage) {
    return stage === 0 ? t('docs.walls.stages.construction') : t('docs.walls.stages.level', { n: stage });
}
const straightStage = computed(() => stageOf('straight180'));
const { visible: adminNotes } = useDocsAdminNotes();
const tocLinks = computed(() => [
    { href: '#choosing', label: t('docs.walls.choosing.heading') },
    { href: '#where', label: t('docs.walls.where.heading') },
    { href: '#movement', label: t('docs.walls.movement.heading') },
    { href: '#sieges', label: t('docs.walls.sieges.heading') },
    ...PIECES.map((p) => ({ href: `#${p.id}`, label: t(`docs.walls.pieces.${p.key}.name`) })),
    ...(adminNotes.value ? [{ href: '#not-built', label: t('docs.walls.notBuilt.heading') }] : []),
]);
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(WALL_SIEGE, {});
    __VLS_withDotValue(dirs, {});
    __VLS_withDotValue(stages, {});
    __VLS_withDotValue(TILE_ORIENTATIONS, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    /** @type {__VLS_StyleScopedClasses['ground']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "walls" }, title: (__VLS_ctx.$t('docs.walls.title')), caption: "DOCS · WALLS", intro: (__VLS_ctx.$t('docs.walls.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "walls" },
        title: (__VLS_ctx.$t('docs.walls.title')),
        caption: "DOCS · WALLS",
        intro: (__VLS_ctx.$t('docs.walls.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['walls']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    const __VLS_6 = DocsToc;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        links: (__VLS_unwrap(tocLinks, {})),
    }));
    const __VLS_8 = __VLS_7({
        links: (__VLS_unwrap(tocLinks, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "choosing",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.walls.choosing.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "group-body" },
    });
    /** @type {__VLS_StyleScopedClasses['group-body']} */ ;
    (__VLS_ctx.$t('docs.walls.choosing.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "rules" },
    });
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.choosing.rules.fork'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.choosing.rules.gate'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.choosing.rules.sea'));
    const __VLS_11 = WallExample;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
    // @ts-ignore
    }));
    const __VLS_13 = __VLS_12({}, ...__VLS_functionalComponentArgsRest(__VLS_12));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "where",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.walls.where.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "group-body" },
    });
    /** @type {__VLS_StyleScopedClasses['group-body']} */ ;
    (__VLS_ctx.$t('docs.walls.where.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "grounds" },
    });
    /** @type {__VLS_StyleScopedClasses['grounds']} */ ;
    const __VLS_16 = __VLS_tryAsConstant((__VLS_unwrap(WALL_GROUNDS, {})));
    for (const [ground] of __VLS_vFor(__VLS_nonNull(__VLS_16))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.figure, __VLS_intrinsics.figure)({
            key: (ground.id),
            ...{ class: "ground" },
            'data-ground': (ground.id),
        });
        /** @type {__VLS_StyleScopedClasses['ground']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ground-art" },
        });
        /** @type {__VLS_StyleScopedClasses['ground-art']} */ ;
        const __VLS_17 = WallPiece;
        // @ts-ignore
        const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
            // @ts-ignore
            piece: "straight180", dir: "SE", stage: (__VLS_unwrap(straightStage, {})), ground: (ground.id),
        }));
        const __VLS_19 = __VLS_18({
            piece: "straight180",
            dir: "SE",
            stage: (__VLS_unwrap(straightStage, {})),
            ground: (ground.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_18));
        __VLS_asFunctionalElement1(__VLS_intrinsics.figcaption, __VLS_intrinsics.figcaption)({});
        (__VLS_ctx.$t(`docs.walls.where.grounds.${ground.id}`));
        // @ts-ignore
        [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, tocLinks, WALL_GROUNDS, straightStage,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "movement",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.walls.movement.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "group-body" },
    });
    /** @type {__VLS_StyleScopedClasses['group-body']} */ ;
    (__VLS_ctx.$t('docs.walls.movement.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "rules" },
    });
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.movement.rules.block'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.movement.rules.gate'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.movement.rules.end'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.movement.rules.sea'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.movement.rules.natural'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.movement.rules.rivers'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.movement.rules.fleets'));
    const __VLS_22 = WallMovementDiagram;
    // @ts-ignore
    const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
    // @ts-ignore
    }));
    const __VLS_24 = __VLS_23({}, ...__VLS_functionalComponentArgsRest(__VLS_23));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "sieges",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.walls.sieges.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "group-body" },
    });
    /** @type {__VLS_StyleScopedClasses['group-body']} */ ;
    (__VLS_ctx.$t('docs.walls.sieges.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "rules" },
    });
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.sieges.rules.who'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.sieges.rules.target'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.sieges.rules.level', { levels: WALL_SIEGE.value.levels }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.sieges.rules.ships'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.sieges.rules.gone'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.walls.sieges.rules.rebuild'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "group-heading" },
    });
    /** @type {__VLS_StyleScopedClasses['group-heading']} */ ;
    (__VLS_ctx.$t('docs.walls.pieces.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "group-body" },
    });
    /** @type {__VLS_StyleScopedClasses['group-body']} */ ;
    (__VLS_ctx.$t('docs.walls.pieces.body'));
    const __VLS_27 = __VLS_tryAsConstant((__VLS_unwrap(PIECES, {})));
    for (const [p] of __VLS_vFor(__VLS_nonNull(__VLS_27))) {
        const __VLS_28 = DocsTileEntry || DocsTileEntry;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({
            // @ts-ignore
            id: (p.id), key: (p.piece), title: (__VLS_ctx.$t(`docs.walls.pieces.${p.key}.name`)), level: (3),
        }));
        const __VLS_30 = __VLS_29({
            id: (p.id),
            key: (p.piece),
            title: (__VLS_ctx.$t(`docs.walls.pieces.${p.key}.name`)),
            level: (3),
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        var __VLS_31;
        const { default: __VLS_33 } = __VLS_nonNull(__VLS_31.slots);
        {
            const { thumb: __VLS_34 } = __VLS_nonNull(__VLS_31.slots);
            const __VLS_35 = WallPiece;
            // @ts-ignore
            const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({
                // @ts-ignore
                piece: (p.piece), dir: (dirs.value[p.piece]), stage: (__VLS_unwrap(stageOf, {})(p.piece)),
            }));
            const __VLS_37 = __VLS_36({
                piece: (p.piece),
                dir: (dirs.value[p.piece]),
                stage: (__VLS_unwrap(stageOf, {})(p.piece)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_36));
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, WALL_SIEGE, PIECES, dirs, stageOf,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t(`docs.walls.pieces.${p.key}.body`));
        {
            const { pickers: __VLS_40 } = __VLS_nonNull(__VLS_31.slots);
            if (stages.value[p.piece].length > 1) {
                const __VLS_41 = DocsPicker;
                // @ts-ignore
                const __VLS_42 = __VLS_asFunctionalComponent1(__VLS_41, new __VLS_41({
                    // @ts-ignore
                    ...{ 'onUpdate:modelValue': {} }, modelValue: (__VLS_unwrap(stageOf, {})(p.piece)), label: (__VLS_ctx.$t('docs.walls.stage')), options: (stages.value[p.piece].map((stage) => ({ value: stage, label: stageLabel(stage) }))),
                }));
                const __VLS_43 = __VLS_42({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_unwrap(stageOf, {})(p.piece)),
                    label: (__VLS_ctx.$t('docs.walls.stage')),
                    options: (stages.value[p.piece].map((stage) => ({ value: stage, label: stageLabel(stage) }))),
                }, ...__VLS_functionalComponentArgsRest(__VLS_42));
                let __VLS_46;
                const __VLS_47 = {
                    /** @type {typeof __VLS_46.'update:modelValue'} */
                    'onUpdate:modelValue': (...[$event]) => {
                        void $event;
                        if (!(stages.value[p.piece].length > 1))
                            throw 0;
                        return (__VLS_unwrap(pick, {})(p.piece, $event));
                        // @ts-ignore
                        [$t, $t, stageOf, stages, stages, pick,];
                    },
                };
                void __VLS_47;
                var __VLS_44;
                var __VLS_45;
            }
            const __VLS_48 = DocsPicker;
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
                // @ts-ignore
                modelValue: (dirs.value[p.piece]), label: (__VLS_ctx.$t('docs.walls.camera')), options: (TILE_ORIENTATIONS.value.map((dir) => ({ value: dir, label: dir }))),
            }));
            const __VLS_50 = __VLS_49({
                modelValue: (dirs.value[p.piece]),
                label: (__VLS_ctx.$t('docs.walls.camera')),
                options: (TILE_ORIENTATIONS.value.map((dir) => ({ value: dir, label: dir }))),
            }, ...__VLS_functionalComponentArgsRest(__VLS_49));
            // @ts-ignore
            [$t, dirs, TILE_ORIENTATIONS,];
        }
        // @ts-ignore
        [];
        // @ts-ignore
        [];
    }
    const __VLS_53 = DocsAdminNote || DocsAdminNote;
    // @ts-ignore
    const __VLS_54 = __VLS_asFunctionalComponent1(__VLS_53, new __VLS_53({
        // @ts-ignore
        id: "not-built", as: "section", ...{ class: "block" },
    }));
    const __VLS_55 = __VLS_54({
        id: "not-built",
        as: "section",
        ...{ class: "block" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_54));
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    var __VLS_56;
    const { default: __VLS_58 } = __VLS_nonNull(__VLS_56.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.walls.notBuilt.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "group-body" },
    });
    /** @type {__VLS_StyleScopedClasses['group-body']} */ ;
    (__VLS_ctx.$t('docs.walls.notBuilt.body'));
    // @ts-ignore
    [$t, $t,];
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
