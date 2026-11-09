/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import AtlasSprite from '../components/AtlasSprite.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import RealmExample from '../components/docs/RealmExample.vue';
import { buildingArtByFamily } from '../lib/map/buildingArt';
import { claimRadiusForLevel } from '../lib/map/shoreline';
import { FIRST_TOWER_LONGHOUSE_LEVEL, towerLimitRows } from '../lib/docs/realmDocs';
// The realm page: what the longhouse claims, how towers push the border out, how many you may build and where they stand.
// The numbers come from the game's own functions (claimRadiusForLevel, maxTowers); the example map is drawn by the game's renderer.
const { t } = useI18n({ useScope: 'global' });
/** A tower replaces the tile it stands on, so each ground has its own look (buildingArt.ts, buildingArtOnTile). */
const TOWER_GROUNDS = [
    { id: 'grass', family: 'stavetower' },
    { id: 'sand', family: 'stavetower_sand' },
    { id: 'forest', family: 'stavetower_forest' },
    { id: 'bog', family: 'stavetower_bog' },
];
/** The tower level the picture shows. */
const TOWER_ART_LEVEL = 3;
const looks = TOWER_GROUNDS.map((g) => {
    const art = buildingArtByFamily(g.family, TOWER_ART_LEVEL);
    return { ...g, frame: art?.kind === 'atlas' ? art.frame : null, url: art?.kind === 'png' ? art.url : null };
});
const rows = towerLimitRows();
const tocLinks = computed(() => ['claim', 'towers', 'count', 'where', 'giants'].map((id) => ({ href: `#${id}`, label: t(`docs.realm.${id}.heading`) })));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    void {};
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    /** @type {__VLS_StyleScopedClasses['ground-art']} */ ;
    /** @type {__VLS_StyleScopedClasses['ground']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "realm" }, title: (__VLS_ctx.$t('docs.realm.title')), caption: "DOCS · REALM", intro: (__VLS_ctx.$t('docs.realm.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "realm" },
        title: (__VLS_ctx.$t('docs.realm.title')),
        caption: "DOCS · REALM",
        intro: (__VLS_ctx.$t('docs.realm.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['realm']} */ ;
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
        id: "claim",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.realm.claim.heading'));
    let __VLS_11;
    /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
    i18nT;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
        // @ts-ignore
        keypath: "docs.realm.claim.body", tag: "p", ...{ class: "text" }, scope: "global",
    }));
    const __VLS_13 = __VLS_12({
        keypath: "docs.realm.claim.body",
        tag: "p",
        ...{ class: "text" },
        scope: "global",
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    var __VLS_14;
    const { default: __VLS_16 } = __VLS_nonNull(__VLS_14.slots);
    {
        const { longhouse: __VLS_17 } = __VLS_nonNull(__VLS_14.slots);
        const __VLS_18 = BuildingLink;
        // @ts-ignore
        const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
            // @ts-ignore
            type: "longhouse",
        }));
        const __VLS_20 = __VLS_19({
            type: "longhouse",
        }, ...__VLS_functionalComponentArgsRest(__VLS_19));
        // @ts-ignore
        [$t, $t, $t, tocLinks,];
    }
    {
        const { level1: __VLS_23 } = __VLS_nonNull(__VLS_14.slots);
        (__VLS_unwrap(claimRadiusForLevel, {})(1));
        // @ts-ignore
        [claimRadiusForLevel,];
    }
    {
        const { level2: __VLS_24 } = __VLS_nonNull(__VLS_14.slots);
        (__VLS_unwrap(claimRadiusForLevel, {})(2));
        // @ts-ignore
        [claimRadiusForLevel,];
    }
    // @ts-ignore
    [];
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "text" },
    });
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    (__VLS_ctx.$t('docs.realm.claim.destroyed'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "towers",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.realm.towers.heading'));
    let __VLS_25;
    /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
    i18nT;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
        // @ts-ignore
        keypath: "docs.realm.towers.body", tag: "p", ...{ class: "text" }, scope: "global",
    }));
    const __VLS_27 = __VLS_26({
        keypath: "docs.realm.towers.body",
        tag: "p",
        ...{ class: "text" },
        scope: "global",
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    var __VLS_28;
    const { default: __VLS_30 } = __VLS_nonNull(__VLS_28.slots);
    {
        const { tower: __VLS_31 } = __VLS_nonNull(__VLS_28.slots);
        const __VLS_32 = BuildingLink;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({
            // @ts-ignore
            type: "tower",
        }));
        const __VLS_34 = __VLS_33({
            type: "tower",
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        // @ts-ignore
        [$t, $t,];
    }
    {
        const { level: __VLS_37 } = __VLS_nonNull(__VLS_28.slots);
        (__VLS_unwrap(FIRST_TOWER_LONGHOUSE_LEVEL, {}));
        // @ts-ignore
        [FIRST_TOWER_LONGHOUSE_LEVEL,];
    }
    // @ts-ignore
    [];
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "rules" },
    });
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.realm.towers.rules.inside'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.realm.towers.rules.chain'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.realm.towers.rules.cut'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.realm.towers.rules.built'));
    const __VLS_38 = RealmExample;
    // @ts-ignore
    const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
    // @ts-ignore
    }));
    const __VLS_40 = __VLS_39({}, ...__VLS_functionalComponentArgsRest(__VLS_39));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "count",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.realm.count.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "text" },
    });
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    (__VLS_ctx.$t('docs.realm.count.body', { level: __VLS_unwrap(FIRST_TOWER_LONGHOUSE_LEVEL, {}) }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "table-scroll" },
    });
    /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "small" },
        'data-testid': "tower-limit-table",
    });
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('docs.realm.count.levels'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('docs.realm.count.towers'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_43 = __VLS_tryAsConstant((__VLS_unwrap(rows, {})));
    for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_43))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (row.from),
            'data-from': (row.from),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            scope: "row",
            ...{ class: "name" },
        });
        /** @type {__VLS_StyleScopedClasses['name']} */ ;
        (row.from);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "value" },
        });
        /** @type {__VLS_StyleScopedClasses['value']} */ ;
        (row.towers);
        // @ts-ignore
        [$t, $t, $t, $t, $t, $t, $t, $t, FIRST_TOWER_LONGHOUSE_LEVEL, rows,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "where",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.realm.where.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "text" },
    });
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    (__VLS_ctx.$t('docs.realm.where.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "grounds" },
    });
    /** @type {__VLS_StyleScopedClasses['grounds']} */ ;
    const __VLS_44 = __VLS_tryAsConstant((__VLS_unwrap(looks, {})));
    for (const [look] of __VLS_vFor(__VLS_nonNull(__VLS_44))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.figure, __VLS_intrinsics.figure)({
            key: (look.id),
            ...{ class: "ground" },
            'data-ground': (look.id),
        });
        /** @type {__VLS_StyleScopedClasses['ground']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ground-art" },
        });
        /** @type {__VLS_StyleScopedClasses['ground-art']} */ ;
        if (look.frame) {
            const __VLS_45 = AtlasSprite;
            // @ts-ignore
            const __VLS_46 = __VLS_asFunctionalComponent1(__VLS_45, new __VLS_45({
                // @ts-ignore
                frame: (look.frame),
            }));
            const __VLS_47 = __VLS_46({
                frame: (look.frame),
            }, ...__VLS_functionalComponentArgsRest(__VLS_46));
        }
        else if (look.url) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                src: (look.url),
                alt: (__VLS_ctx.$t('docs.realm.where.alt', { ground: __VLS_ctx.$t(`docs.realm.where.grounds.${look.id}`) })),
            });
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.figcaption, __VLS_intrinsics.figcaption)({});
        (__VLS_ctx.$t(`docs.realm.where.grounds.${look.id}`));
        // @ts-ignore
        [$t, $t, $t, $t, $t, looks,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "giants",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.realm.giants.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "text" },
    });
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    (__VLS_ctx.$t('docs.realm.giants.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "linked",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.realm.linked.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "text" },
    });
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    (__VLS_ctx.$t('docs.realm.linked.body'));
    // @ts-ignore
    [$t, $t, $t, $t,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
