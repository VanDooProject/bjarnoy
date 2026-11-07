/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Onboarding quest tray in the settlement view (docs/design/economy.md
// section 7). The landing page's found -> reindeer herder -> lumberjack checklist
// (OnboardingChecklist.vue) hands off to the settlement view; from there
// this tray walks the player through six goals that each pay a resource
// reward on a manual Claim. It shows the first unclaimed quest prominently,
// any *other* completed-but-unclaimed quest as a small claimable row (quests
// can be claimed in any order), and hides itself once all six are claimed.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiErrorMessage } from '../../i18n/apiErrors';
import { resourceName } from '../../i18n/catalogueNames';
import { useWorldStore } from '../../stores/world';
import { rewardOverflows } from '../../lib/quests';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { HUD_COMPACT_QUERY } from '../../lib/breakpoints';
const { t, te } = useI18n({ useScope: 'global' });
const world = useWorldStore();
const REWARD_KINDS = ['wood', 'stone', 'food'];
// A quest id from a newer server that this build has no copy for is left out
// rather than shown as a raw key.
const known = computed(() => world.hud.quests.filter((q) => te(`quests.items.${q.id}.title`)));
const unclaimed = computed(() => known.value.filter((q) => !q.claimed));
const claimedCount = computed(() => known.value.length - unclaimed.value.length);
const current = computed(() => unclaimed.value[0]);
const alsoReady = computed(() => unclaimed.value.slice(1).filter((q) => q.completed));
// Phones: the tray is a round quest button until tapped open — the full card
// covered a third of a landscape screen. The dot says a reward is waiting to
// be claimed (there is always an open quest while the tray exists at all).
const isCompact = useMediaQuery(HUD_COMPACT_QUERY);
const expanded = ref(false);
const collapsed = computed(() => isCompact.value && !expanded.value);
const hasReady = computed(() => unclaimed.value.some((q) => q.completed));
const busyId = ref(null);
const error = ref(null);
function overflows(q) {
    return rewardOverflows(q.reward, world.hud.resources, world.hud.storageCap);
}
async function claim(q) {
    if (busyId.value)
        return;
    busyId.value = q.id;
    error.value = null;
    try {
        await world.claimQuest(q.id);
    }
    catch (err) {
        error.value = apiErrorMessage(err, t('quests.claimError'));
    }
    finally {
        busyId.value = null;
    }
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(current, {});
    __VLS_withDotValue(collapsed, {});
    __VLS_withDotValue(expanded, {});
    __VLS_withDotValue(hasReady, {});
    __VLS_withDotValue(known, {});
    __VLS_withDotValue(isCompact, {});
    __VLS_withDotValue(busyId, {});
    __VLS_withDotValue(alsoReady, {});
    __VLS_withDotValue(error, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['quest-current']} */ ;
    /** @type {__VLS_StyleScopedClasses['claim-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['quest-tray']} */ ;
    /** @type {__VLS_StyleScopedClasses['quest-header']} */ ;
    /** @type {__VLS_StyleScopedClasses['quest-hint']} */ ;
    /** @type {__VLS_StyleScopedClasses['quest-footer']} */ ;
    /** @type {__VLS_StyleScopedClasses['quest-icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['quest-collapse']} */ ;
    if (current.value && collapsed.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(current.value && collapsed.value))
                        throw 0;
                    return (expanded.value = true);
                    // @ts-ignore
                    [current, collapsed, expanded,];
                } },
            type: "button",
            ...{ class: "quest-toggle" },
            'data-testid': "quest-toggle",
            'aria-label': (__VLS_unwrap(t, {})('quests.open')),
            title: (__VLS_unwrap(t, {})('quests.title')),
        });
        /** @type {__VLS_StyleScopedClasses['quest-toggle']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            ...{ class: "quest-icon" },
            viewBox: "0 0 24 24",
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['quest-icon']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M18 17V6a2 2 0 0 0-2-2H5",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M8 20h11a2 2 0 0 0 2-2v-.5a.5.5 0 0 0-.5-.5H10.5a.5.5 0 0 0-.5.5v.5a2 2 0 1 1-4 0V6a2 2 0 1 0-4 0v1.5a.5.5 0 0 0 .5.5H6",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M10 9h5M10 12.5h5",
        });
        if (hasReady.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "quest-dot" },
                'data-testid': "quest-ready-dot",
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['quest-dot']} */ ;
        }
    }
    else if (current.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
            ...{ class: "quest-tray" },
            'data-testid': "quest-tray",
            'aria-label': (__VLS_unwrap(t, {})('quests.title')),
        });
        /** @type {__VLS_StyleScopedClasses['quest-tray']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "quest-header" },
        });
        /** @type {__VLS_StyleScopedClasses['quest-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "quest-heading" },
        });
        /** @type {__VLS_StyleScopedClasses['quest-heading']} */ ;
        (__VLS_unwrap(t, {})('quests.title'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "quest-progress" },
            'data-testid': "quest-progress",
        });
        /** @type {__VLS_StyleScopedClasses['quest-progress']} */ ;
        (__VLS_unwrap(t, {})('quests.progress', { done: __VLS_unwrap(claimedCount, {}), total: known.value.length }));
        if (isCompact.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(current.value && collapsed.value))
                            throw 0;
                        if (!(current.value))
                            throw 0;
                        if (!(isCompact.value))
                            throw 0;
                        return (expanded.value = false);
                        // @ts-ignore
                        [current, expanded, t, t, t, t, t, hasReady, claimedCount, known, isCompact,];
                    } },
                type: "button",
                ...{ class: "quest-collapse" },
                'data-testid': "quest-collapse",
                'aria-label': (__VLS_unwrap(t, {})('quests.collapse')),
            });
            /** @type {__VLS_StyleScopedClasses['quest-collapse']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "quest-current" },
            ...{ class: ({ 'is-ready': current.value.completed }) },
            'data-testid': "quest-current",
            'data-quest-id': (current.value.id),
        });
        /** @type {__VLS_StyleScopedClasses['quest-current']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-ready']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "quest-title" },
        });
        /** @type {__VLS_StyleScopedClasses['quest-title']} */ ;
        (__VLS_unwrap(t, {})(`quests.items.${current.value.id}.title`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "quest-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['quest-hint']} */ ;
        (__VLS_unwrap(t, {})(`quests.items.${current.value.id}.hint`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "quest-footer" },
        });
        /** @type {__VLS_StyleScopedClasses['quest-footer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "quest-reward" },
            'aria-label': (__VLS_unwrap(t, {})('quests.rewardLabel')),
        });
        /** @type {__VLS_StyleScopedClasses['quest-reward']} */ ;
        const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(REWARD_KINDS, {})));
        for (const [kind] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                key: (kind),
                ...{ class: "reward-item" },
                title: (__VLS_unwrap(resourceName, {})(kind)),
            });
            /** @type {__VLS_StyleScopedClasses['reward-item']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "hex-icon" },
                ...{ style: ({ background: `var(--${kind})` }) },
            });
            /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
            (current.value.reward[kind]);
            // @ts-ignore
            [current, current, current, current, current, t, t, t, t, REWARD_KINDS, resourceName,];
        }
        if (current.value.completed) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(current.value && collapsed.value))
                            throw 0;
                        if (!(current.value))
                            throw 0;
                        if (!(current.value.completed))
                            throw 0;
                        return (claim(current.value));
                        // @ts-ignore
                        [current, current,];
                    } },
                type: "button",
                ...{ class: "claim-button" },
                'data-testid': "quest-claim",
                disabled: (busyId.value !== null),
            });
            /** @type {__VLS_StyleScopedClasses['claim-button']} */ ;
            (busyId.value === current.value.id ? __VLS_unwrap(t, {})('quests.claiming') : __VLS_unwrap(t, {})('quests.claim'));
        }
        if (current.value.completed && overflows(current.value)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "quest-note" },
                'data-testid': "quest-overflow-note",
            });
            /** @type {__VLS_StyleScopedClasses['quest-note']} */ ;
            (__VLS_unwrap(t, {})('quests.overflowNote'));
        }
        if (alsoReady.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "quest-also" },
            });
            /** @type {__VLS_StyleScopedClasses['quest-also']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "quest-also-label" },
            });
            /** @type {__VLS_StyleScopedClasses['quest-also-label']} */ ;
            (__VLS_unwrap(t, {})('quests.alsoReady'));
            const __VLS_1 = __VLS_tryAsConstant((alsoReady.value));
            for (const [q] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (q.id),
                    ...{ class: "quest-row" },
                    'data-testid': "quest-ready-row",
                    'data-quest-id': (q.id),
                });
                /** @type {__VLS_StyleScopedClasses['quest-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "quest-row-main" },
                });
                /** @type {__VLS_StyleScopedClasses['quest-row-main']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "quest-row-title" },
                });
                /** @type {__VLS_StyleScopedClasses['quest-row-title']} */ ;
                (__VLS_unwrap(t, {})(`quests.items.${q.id}.title`));
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "quest-reward" },
                });
                /** @type {__VLS_StyleScopedClasses['quest-reward']} */ ;
                const __VLS_2 = __VLS_tryAsConstant((__VLS_unwrap(REWARD_KINDS, {})));
                for (const [kind] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        key: (kind),
                        ...{ class: "reward-item" },
                        title: (__VLS_unwrap(resourceName, {})(kind)),
                    });
                    /** @type {__VLS_StyleScopedClasses['reward-item']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                        ...{ class: "hex-icon" },
                        ...{ style: ({ background: `var(--${kind})` }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['hex-icon']} */ ;
                    (q.reward[kind]);
                    // @ts-ignore
                    [current, current, current, t, t, t, t, t, REWARD_KINDS, resourceName, busyId, busyId, alsoReady, alsoReady,];
                }
                if (overflows(q)) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "quest-note" },
                    });
                    /** @type {__VLS_StyleScopedClasses['quest-note']} */ ;
                    (__VLS_unwrap(t, {})('quests.overflowNote'));
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(current.value && collapsed.value))
                                throw 0;
                            if (!(current.value))
                                throw 0;
                            if (!(alsoReady.value.length))
                                throw 0;
                            return (claim(q));
                            // @ts-ignore
                            [t,];
                        } },
                    type: "button",
                    ...{ class: "claim-button" },
                    disabled: (busyId.value !== null),
                });
                /** @type {__VLS_StyleScopedClasses['claim-button']} */ ;
                (busyId.value === q.id ? __VLS_unwrap(t, {})('quests.claiming') : __VLS_unwrap(t, {})('quests.claim'));
                // @ts-ignore
                [t, t, busyId, busyId,];
            }
        }
        if (error.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "quest-error" },
                role: "alert",
                'data-testid': "quest-error",
            });
            /** @type {__VLS_StyleScopedClasses['quest-error']} */ ;
            (error.value);
        }
    }
    // @ts-ignore
    [error, error,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
