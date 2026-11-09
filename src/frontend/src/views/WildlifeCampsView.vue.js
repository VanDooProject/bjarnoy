/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { beastName } from '../i18n/catalogueNames';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import AtlasSprite from '../components/AtlasSprite.vue';
import AnimatedCamp from '../components/docs/AnimatedCamp.vue';
import AnimationPausedNote from '../components/docs/AnimationPausedNote.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import { findAtlasClip, findAtlasFrame } from '../lib/map/atlas';
import { KEY_FAMILY } from '../lib/map/textures';
import { TILE_ORIENTATIONS } from '../lib/map/types';
import { lootKindsOf, lootPoolByKind } from '../lib/map/campRules';
import { CAMP_FAMILIES, MaxCampLevel, guardRange } from '../lib/map/campPlacement';
const { t, te } = useI18n({ useScope: 'global' });
// A family only gets a card once its art is in the atlas.
const CAMPS = CAMP_FAMILIES.map((f) => ({ id: f.family, ground: f.ground, strength: f.strength })).filter((c) => TILE_ORIENTATIONS.some((cam) => frameFor(c.id, cam, false)));
const STRENGTHS = ['strong', 'weak'];
// Grounds in the order the family table first mentions them, only those with a camp on the page.
const GROUNDS = [...new Set(CAMPS.map((c) => c.ground))];
const strengthFilter = ref('all');
const groundFilter = ref('all');
const shownCamps = computed(() => CAMPS.filter((c) => (strengthFilter.value === 'all' || c.strength === strengthFilter.value) &&
    (groundFilter.value === 'all' || c.ground === groundFilter.value)));
const BOX_H = 238;
function fit(frame, boxHeight) {
    if (!frame)
        return undefined;
    return {
        width: `min(100%, ${(boxHeight * frame.frame.w) / frame.frame.h}px)`,
    };
}
// The art a camp is drawn with - the map's own family table (`KEY_FAMILY`), so a camp that
// borrows another camp's art there borrows it here too.
function artOf(id) {
    return KEY_FAMILY[id] ?? id;
}
function frameFor(id, camera, guarded) {
    return findAtlasFrame('showcase', `${artOf(id)}_${camera}_level00${guarded ? 1 : 0}`);
}
/** The hexes a camp of this strength guards at level 1 and at the top level (`guardRange`, the game's own formula). */
function rangeOf(strength) {
    return { min: guardRange(1, strength), max: guardRange(MaxCampLevel, strength), levels: MaxCampLevel };
}
// Loot kinds and amounts come from the game's own rules (`campRules.ts`, the mirror of `CampRules`).
// The levels the cards quote loot amounts for: a fresh camp and a mid-level one.
const AMOUNT_LEVELS = [1, 5];
const lootOf = (camp) => lootKindsOf(camp.id);
function hasClip(id, camera) {
    return !!findAtlasClip('buildings-anim', `${artOf(id)}_${camera}_level001`);
}
function keptCameras(id) {
    return TILE_ORIENTATIONS.filter((cam) => frameFor(id, cam, true));
}
const view = reactive(Object.fromEntries(CAMPS.map(({ id }) => {
    const kept = keptCameras(id);
    return [
        id,
        {
            guarded: kept.length > 0,
            camera: kept.includes('SE') ? 'SE' : (kept[0] ?? 'SE'),
        },
    ];
})));
function setGuarded(id, guarded) {
    const state = view[id];
    state.guarded = guarded;
    const kept = keptCameras(id);
    if (guarded && !kept.includes(state.camera) && kept[0])
        state.camera = kept[0];
}
// The page-wide switch: every camp at once. A camp's own pills still change
// just that camp, and the switch then shows neither state as active.
const allState = computed(() => {
    const states = CAMPS.map((c) => view[c.id].guarded);
    if (states.every(Boolean))
        return 'guarded';
    if (states.every((g) => !g))
        return 'cleared';
    return null;
});
function setAll(guarded) {
    for (const c of CAMPS)
        setGuarded(c.id, guarded);
}
function cameraAvailable(id, camera) {
    return !!frameFor(id, camera, view[id].guarded);
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(allState, {});
    __VLS_withDotValue(strengthFilter, {});
    __VLS_withDotValue(groundFilter, {});
    __VLS_withDotValue(shownCamps, {});
    __VLS_withDotValue(view, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['loot-kind']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['strength']} */ ;
    /** @type {__VLS_StyleScopedClasses['strength']} */ ;
    /** @type {__VLS_StyleScopedClasses['pill']} */ ;
    /** @type {__VLS_StyleScopedClasses['pill']} */ ;
    /** @type {__VLS_StyleScopedClasses['pill']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "wildlife-camps" }, title: (__VLS_ctx.$t('docs.wildlifeCamps.title')), caption: "DOCS · WILDLIFE CAMPS", intro: (__VLS_ctx.$t('docs.wildlifeCamps.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "wildlife-camps" },
        title: (__VLS_ctx.$t('docs.wildlifeCamps.title')),
        caption: "DOCS · WILDLIFE CAMPS",
        intro: (__VLS_ctx.$t('docs.wildlifeCamps.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['wildlife-camps']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    {
        const { status: __VLS_6 } = __VLS_nonNull(__VLS_3.slots);
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status" },
        });
        /** @type {__VLS_StyleScopedClasses['status']} */ ;
        (__VLS_ctx.$t('docs.wildlifeCamps.status'));
        // @ts-ignore
        [$t, $t, $t,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "rules",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "rules" },
    });
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.towers'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.range'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.bigIslands'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.states'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.building'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.respawn'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.neverBuilt'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.atSea'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.hunting'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.regrowth'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.calm'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.leveling'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.ambush'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.rules.leftover'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "camps",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.camps.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.camps.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.strength.help'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t('docs.wildlifeCamps.loot.note'));
    const __VLS_7 = AnimationPausedNote;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
    // @ts-ignore
    }));
    const __VLS_9 = __VLS_8({}, ...__VLS_functionalComponentArgsRest(__VLS_8));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filters" },
    });
    /** @type {__VLS_StyleScopedClasses['filters']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pills" },
        'data-testid': "state-switch",
    });
    /** @type {__VLS_StyleScopedClasses['pills']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "pills-label" },
    });
    /** @type {__VLS_StyleScopedClasses['pills-label']} */ ;
    (__VLS_ctx.$t('docs.wildlifeCamps.state.all'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (setAll(true));
                // @ts-ignore
                [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t,];
            } },
        type: "button",
        ...{ class: "pill" },
        ...{ class: ({ active: allState.value === 'guarded' }) },
    });
    /** @type {__VLS_StyleScopedClasses['pill']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (__VLS_ctx.$t('docs.wildlifeCamps.state.guarded'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (setAll(false));
                // @ts-ignore
                [$t, allState,];
            } },
        type: "button",
        ...{ class: "pill" },
        ...{ class: ({ active: allState.value === 'cleared' }) },
    });
    /** @type {__VLS_StyleScopedClasses['pill']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (__VLS_ctx.$t('docs.wildlifeCamps.state.cleared'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pills" },
        'data-testid': "strength-filter",
    });
    /** @type {__VLS_StyleScopedClasses['pills']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "pills-label" },
    });
    /** @type {__VLS_StyleScopedClasses['pills-label']} */ ;
    (__VLS_ctx.$t('docs.wildlifeCamps.strength.label'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (strengthFilter.value = 'all');
                // @ts-ignore
                [$t, $t, allState, strengthFilter,];
            } },
        type: "button",
        ...{ class: "pill" },
        ...{ class: ({ active: strengthFilter.value === 'all' }) },
    });
    /** @type {__VLS_StyleScopedClasses['pill']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (__VLS_ctx.$t('docs.wildlifeCamps.filters.all'));
    const __VLS_12 = __VLS_tryAsConstant((__VLS_unwrap(STRENGTHS, {})));
    for (const [strength] of __VLS_vFor(__VLS_nonNull(__VLS_12))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (strengthFilter.value = strength);
                    // @ts-ignore
                    [$t, strengthFilter, strengthFilter, STRENGTHS,];
                } },
            key: (strength),
            type: "button",
            ...{ class: "pill" },
            ...{ class: ({ active: strengthFilter.value === strength }) },
        });
        /** @type {__VLS_StyleScopedClasses['pill']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (__VLS_unwrap(t, {})(`docs.wildlifeCamps.strength.${strength}`));
        // @ts-ignore
        [strengthFilter, t,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pills" },
        'data-testid': "ground-filter",
    });
    /** @type {__VLS_StyleScopedClasses['pills']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "pills-label" },
    });
    /** @type {__VLS_StyleScopedClasses['pills-label']} */ ;
    (__VLS_ctx.$t('docs.wildlifeCamps.filters.ground'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (groundFilter.value = 'all');
                // @ts-ignore
                [$t, groundFilter,];
            } },
        type: "button",
        ...{ class: "pill" },
        ...{ class: ({ active: groundFilter.value === 'all' }) },
    });
    /** @type {__VLS_StyleScopedClasses['pill']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (__VLS_ctx.$t('docs.wildlifeCamps.filters.all'));
    const __VLS_13 = __VLS_tryAsConstant((__VLS_unwrap(GROUNDS, {})));
    for (const [ground] of __VLS_vFor(__VLS_nonNull(__VLS_13))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (groundFilter.value = ground);
                    // @ts-ignore
                    [$t, groundFilter, groundFilter, GROUNDS,];
                } },
            key: (ground),
            type: "button",
            ...{ class: "pill" },
            ...{ class: ({ active: groundFilter.value === ground }) },
        });
        /** @type {__VLS_StyleScopedClasses['pill']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (__VLS_unwrap(t, {})(`docs.wildlifeCamps.grounds.${ground}`));
        // @ts-ignore
        [t, groundFilter,];
    }
    if (shownCamps.value.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "empty" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        (__VLS_ctx.$t('docs.wildlifeCamps.filters.none'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "cards" },
    });
    /** @type {__VLS_StyleScopedClasses['cards']} */ ;
    const __VLS_14 = __VLS_tryAsConstant((shownCamps.value));
    for (const [camp] of __VLS_vFor(__VLS_nonNull(__VLS_14))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            id: (`camp-${camp.id}`),
            key: (camp.id),
            ...{ class: "card" },
        });
        /** @type {__VLS_StyleScopedClasses['card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
        (__VLS_unwrap(t, {})(`docs.wildlifeCamps.list.${camp.id}.name`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "tags" },
        });
        /** @type {__VLS_StyleScopedClasses['tags']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ground" },
        });
        /** @type {__VLS_StyleScopedClasses['ground']} */ ;
        (__VLS_unwrap(t, {})(`docs.wildlifeCamps.grounds.${camp.ground}`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "strength" },
            ...{ class: (camp.strength) },
            'data-strength': (camp.strength),
        });
        /** @type {__VLS_StyleScopedClasses['strength']} */ ;
        (__VLS_unwrap(t, {})(`docs.wildlifeCamps.strength.${camp.strength}`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "art-box" },
        });
        /** @type {__VLS_StyleScopedClasses['art-box']} */ ;
        if (view.value[camp.id].guarded && hasClip(camp.id, view.value[camp.id].camera)) {
            const __VLS_15 = AnimatedCamp;
            // @ts-ignore
            const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
                // @ts-ignore
                family: (artOf(camp.id)), orientation: (view.value[camp.id].camera),
            }));
            const __VLS_17 = __VLS_16({
                family: (artOf(camp.id)),
                orientation: (view.value[camp.id].camera),
            }, ...__VLS_functionalComponentArgsRest(__VLS_16));
        }
        else if (frameFor(camp.id, view.value[camp.id].camera, view.value[camp.id].guarded)) {
            const __VLS_20 = AtlasSprite;
            // @ts-ignore
            const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
                // @ts-ignore
                frame: (frameFor(camp.id, view.value[camp.id].camera, view.value[camp.id].guarded)), ...{ style: (fit(frameFor(camp.id, view.value[camp.id].camera, view.value[camp.id].guarded), __VLS_unwrap(BOX_H, {}))) },
            }));
            const __VLS_22 = __VLS_21({
                frame: (frameFor(camp.id, view.value[camp.id].camera, view.value[camp.id].guarded)),
                ...{ style: (fit(frameFor(camp.id, view.value[camp.id].camera, view.value[camp.id].guarded), __VLS_unwrap(BOX_H, {}))) },
            }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_unwrap(t, {})(`docs.wildlifeCamps.list.${camp.id}.guards`));
        if (__VLS_unwrap(te, {})(`docs.wildlifeCamps.list.${camp.id}.artNote`)) {
            const __VLS_25 = DocsAdminNote || DocsAdminNote;
            // @ts-ignore
            const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
            // @ts-ignore
            }));
            const __VLS_27 = __VLS_26({}, ...__VLS_functionalComponentArgsRest(__VLS_26));
            var __VLS_28;
            const { default: __VLS_30 } = __VLS_nonNull(__VLS_28.slots);
            (__VLS_unwrap(t, {})(`docs.wildlifeCamps.list.${camp.id}.artNote`));
            // @ts-ignore
            [$t, t, t, t, t, t, shownCamps, shownCamps, view, view, view, view, view, view, view, view, view, BOX_H, te,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "beasts" },
            'data-testid': "beasts",
        });
        /** @type {__VLS_StyleScopedClasses['beasts']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "pills-label" },
        });
        /** @type {__VLS_StyleScopedClasses['pills-label']} */ ;
        (__VLS_ctx.$t('docs.wildlifeCamps.beasts.label'));
        (__VLS_unwrap(t, {})('docs.wildlifeCamps.beasts.tiers', {
            young: __VLS_unwrap(beastName, {})(camp.id, 'young'),
            adult: __VLS_unwrap(beastName, {})(camp.id, 'adult'),
            alpha: __VLS_unwrap(beastName, {})(camp.id, 'alpha'),
        }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "loot" },
            'data-testid': "loot",
        });
        /** @type {__VLS_StyleScopedClasses['loot']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "pills-label" },
        });
        /** @type {__VLS_StyleScopedClasses['pills-label']} */ ;
        (__VLS_ctx.$t('docs.wildlifeCamps.loot.label'));
        const __VLS_31 = __VLS_tryAsConstant((__VLS_unwrap(lootOf, {})(camp)));
        for (const [share] of __VLS_vFor(__VLS_nonNull(__VLS_31))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                key: (share.kind),
                ...{ class: "loot-kind" },
                ...{ class: ({ more: share.more }) },
                'data-loot': (share.kind),
                'data-more': (share.more ? 'true' : undefined),
                title: (share.more ? __VLS_unwrap(t, {})('docs.wildlifeCamps.loot.moreHint') : undefined),
            });
            /** @type {__VLS_StyleScopedClasses['loot-kind']} */ ;
            /** @type {__VLS_StyleScopedClasses['more']} */ ;
            (share.more
                ? __VLS_unwrap(t, {})('docs.wildlifeCamps.loot.more', { kind: __VLS_unwrap(t, {})(`docs.wildlifeCamps.loot.${share.kind}`) })
                : __VLS_unwrap(t, {})(`docs.wildlifeCamps.loot.${share.kind}`));
            // @ts-ignore
            [$t, $t, t, t, t, t, t, beastName, beastName, beastName, lootOf,];
        }
        const __VLS_32 = __VLS_tryAsConstant((__VLS_unwrap(AMOUNT_LEVELS, {})));
        for (const [level] of __VLS_vFor(__VLS_nonNull(__VLS_32))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                key: (level),
                ...{ class: "loot-amounts" },
                'data-testid': "loot-amounts",
            });
            /** @type {__VLS_StyleScopedClasses['loot-amounts']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "pills-label" },
            });
            /** @type {__VLS_StyleScopedClasses['pills-label']} */ ;
            (__VLS_unwrap(t, {})('docs.wildlifeCamps.loot.atLevel', { level }));
            const __VLS_33 = __VLS_tryAsConstant((__VLS_unwrap(lootOf, {})(camp)));
            for (const [share] of __VLS_vFor(__VLS_nonNull(__VLS_33))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    key: (share.kind),
                    ...{ class: "loot-kind" },
                });
                /** @type {__VLS_StyleScopedClasses['loot-kind']} */ ;
                (__VLS_unwrap(lootPoolByKind, {})(camp.id, level)[share.kind]);
                (__VLS_unwrap(t, {})(`docs.wildlifeCamps.loot.${share.kind}`));
                // @ts-ignore
                [t, t, lootOf, AMOUNT_LEVELS, lootPoolByKind,];
            }
            // @ts-ignore
            [];
        }
        if (camp.ground !== 'sea') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "range" },
                'data-testid': "guard-range",
            });
            /** @type {__VLS_StyleScopedClasses['range']} */ ;
            (__VLS_unwrap(t, {})('docs.wildlifeCamps.range', rangeOf(camp.strength)));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pills" },
        });
        /** @type {__VLS_StyleScopedClasses['pills']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "pills-label" },
        });
        /** @type {__VLS_StyleScopedClasses['pills-label']} */ ;
        (__VLS_ctx.$t('docs.wildlifeCamps.state.label'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (setGuarded(camp.id, true));
                    // @ts-ignore
                    [$t, t,];
                } },
            type: "button",
            ...{ class: "pill" },
            ...{ class: ({ active: view.value[camp.id].guarded }) },
            disabled: (keptCameras(camp.id).length === 0),
        });
        /** @type {__VLS_StyleScopedClasses['pill']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (__VLS_ctx.$t('docs.wildlifeCamps.state.guarded'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (setGuarded(camp.id, false));
                    // @ts-ignore
                    [$t, view,];
                } },
            type: "button",
            ...{ class: "pill" },
            ...{ class: ({ active: !view.value[camp.id].guarded }) },
        });
        /** @type {__VLS_StyleScopedClasses['pill']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (__VLS_ctx.$t('docs.wildlifeCamps.state.cleared'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pills" },
        });
        /** @type {__VLS_StyleScopedClasses['pills']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "pills-label" },
        });
        /** @type {__VLS_StyleScopedClasses['pills-label']} */ ;
        (__VLS_ctx.$t('docs.wildlifeCamps.camera'));
        const __VLS_34 = __VLS_tryAsConstant((__VLS_unwrap(TILE_ORIENTATIONS, {})));
        for (const [cam] of __VLS_vFor(__VLS_nonNull(__VLS_34))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        return (view.value[camp.id].camera = cam);
                        // @ts-ignore
                        [$t, $t, view, view, TILE_ORIENTATIONS,];
                    } },
                key: (cam),
                type: "button",
                ...{ class: "pill" },
                ...{ class: ({ active: view.value[camp.id].camera === cam }) },
                disabled: (!cameraAvailable(camp.id, cam)),
                title: (cameraAvailable(camp.id, cam) ? undefined : __VLS_unwrap(t, {})('docs.wildlifeCamps.notKept')),
            });
            /** @type {__VLS_StyleScopedClasses['pill']} */ ;
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            (cam);
            // @ts-ignore
            [t, view,];
        }
        // @ts-ignore
        [];
    }
    const __VLS_35 = DocsAdminNote || DocsAdminNote;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({
    // @ts-ignore
    }));
    const __VLS_37 = __VLS_36({}, ...__VLS_functionalComponentArgsRest(__VLS_36));
    var __VLS_38;
    const { default: __VLS_40 } = __VLS_nonNull(__VLS_38.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "caption-note" },
    });
    /** @type {__VLS_StyleScopedClasses['caption-note']} */ ;
    (__VLS_ctx.$t('docs.wildlifeCamps.camps.rotations'));
    // @ts-ignore
    [$t,];
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
