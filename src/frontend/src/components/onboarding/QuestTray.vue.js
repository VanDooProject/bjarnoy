/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import ResourceIcon from '../ResourceIcon.vue';
// Onboarding quest tray in the settlement view (docs/design/economy.md
// section 7). The landing page's found -> reindeer herder -> lumberjack checklist
// (OnboardingChecklist.vue) hands off to the settlement view; from there
// this tray walks the player through six goals that each pay a resource
// reward on a manual Claim. It shows the first unclaimed quest prominently,
// any *other* completed-but-unclaimed quest as a small claimable row (quests
// can be claimed in any order), and hides itself once all of them are claimed.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiErrorMessage } from '../../i18n/apiErrors';
import { resourceName } from '../../i18n/catalogueNames';
import { useWorldStore } from '../../stores/world';
import { questProgressKind, rewardOverflows } from '../../lib/quests';
import { useQuestSeen } from '../../composables/useQuestSeen';
import QuestProgress from './QuestProgress.vue';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { HUD_COMPACT_QUERY } from '../../lib/breakpoints';
const { t, te, locale } = useI18n({ useScope: 'global' });
const world = useWorldStore();
const REWARD_KINDS = ['wood', 'stone', 'food'];
// A quest id from a newer server that this build has no copy for is left out
// rather than shown as a raw key.
const known = computed(() => world.hud.quests.filter((q) => te(`quests.items.${q.id}.title`)));
const unclaimed = computed(() => known.value.filter((q) => !q.claimed));
const claimedCount = computed(() => known.value.length - unclaimed.value.length);
const current = computed(() => unclaimed.value[0]);
const alsoReady = computed(() => unclaimed.value.slice(1).filter((q) => q.completed));
// Phones: the tray is a peek strip (quest title + progress) until tapped open —
// the full card covered a third of a landscape screen. The dot says there is
// something the player has not seen in the opened card yet: a quest that became
// current, or one that became claimable.
const isCompact = useMediaQuery(HUD_COMPACT_QUERY);
const expanded = ref(false);
const collapsed = computed(() => isCompact.value && !expanded.value);
const noticeKeys = computed(() => {
    const keys = [];
    if (current.value)
        keys.push(`${current.value.id}:open`);
    for (const q of unclaimed.value)
        if (q.completed)
            keys.push(`${q.id}:ready`);
    return keys;
});
const { hasUnseen, markSeen } = useQuestSeen(computed(() => world.selectedSettlementId));
const hasNew = computed(() => hasUnseen(noticeKeys.value));
// Whatever the opened card shows counts as seen (always open on desktop).
// Only once mounted: the media query is read in onMounted, so before that a
// phone still looks like a desktop and would mark everything seen unseen.
const mounted = ref(false);
watchEffect(() => {
    if (mounted.value && current.value && !collapsed.value)
        markSeen(noticeKeys.value);
});
function progressOf(q) {
    const kind = questProgressKind(q.id);
    return kind && q.progress && !q.completed ? { kind, progress: q.progress } : null;
}
const currentProgress = computed(() => (current.value ? progressOf(current.value) : null));
// Phone card: the hint clamps to two lines; "More" shows only when it overflows.
const hintEl = ref(null);
const hintOpen = ref(false);
const hintOverflows = ref(false);
function measureHint() {
    const el = hintEl.value;
    if (!el || hintOpen.value)
        return;
    hintOverflows.value = el.scrollHeight > el.clientHeight + 1;
}
watch([hintEl, () => current.value?.id, () => locale.value, isCompact], async () => {
    hintOpen.value = false;
    hintOverflows.value = false;
    await nextTick();
    measureHint();
});
onMounted(() => {
    mounted.value = true;
    window.addEventListener('resize', measureHint);
});
onBeforeUnmount(() => window.removeEventListener('resize', measureHint));
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
    __VLS_withDotValue(hasNew, {});
    __VLS_withDotValue(currentProgress, {});
    __VLS_withDotValue(known, {});
    __VLS_withDotValue(isCompact, {});
    __VLS_withDotValue(hintOpen, {});
    __VLS_withDotValue(hintOverflows, {});
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
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
    Transition;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        name: "quest-swap", mode: "out-in",
    }));
    const __VLS_2 = __VLS_1({
        name: "quest-swap",
        mode: "out-in",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
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
            key: "strip",
            type: "button",
            ...{ class: "quest-toggle" },
            'data-testid': "quest-toggle",
            'aria-label': (__VLS_unwrap(t, {})('quests.open')),
        });
        /** @type {__VLS_StyleScopedClasses['quest-toggle']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "quest-icon-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['quest-icon-wrap']} */ ;
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
        if (hasNew.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "quest-dot" },
                'data-testid': "quest-ready-dot",
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['quest-dot']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "strip-text" },
        });
        /** @type {__VLS_StyleScopedClasses['strip-text']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "strip-title" },
            'data-testid': "quest-strip-title",
        });
        /** @type {__VLS_StyleScopedClasses['strip-title']} */ ;
        (__VLS_unwrap(t, {})(`quests.items.${current.value.id}.title`));
        if (currentProgress.value) {
            const __VLS_6 = QuestProgress;
            // @ts-ignore
            const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
                // @ts-ignore
                compact: true, kind: (currentProgress.value.kind), progress: (currentProgress.value.progress),
            }));
            const __VLS_8 = __VLS_7({
                compact: true,
                kind: (currentProgress.value.kind),
                progress: (currentProgress.value.progress),
            }, ...__VLS_functionalComponentArgsRest(__VLS_7));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "strip-chevron" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['strip-chevron']} */ ;
    }
    else if (current.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
            key: "card",
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
                        [current, current, expanded, t, t, t, t, t, hasNew, currentProgress, currentProgress, currentProgress, claimedCount, known, isCompact,];
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
            ref: "hintEl",
            ...{ class: "quest-hint" },
            ...{ class: ({ clamped: isCompact.value && !hintOpen.value }) },
        });
        /** @type {__VLS_StyleScopedClasses['quest-hint']} */ ;
        /** @type {__VLS_StyleScopedClasses['clamped']} */ ;
        (__VLS_unwrap(t, {})(`quests.items.${current.value.id}.hint`));
        if (isCompact.value && (hintOverflows.value || hintOpen.value)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(current.value && collapsed.value))
                            throw 0;
                        if (!(current.value))
                            throw 0;
                        if (!(isCompact.value && (hintOverflows.value || hintOpen.value)))
                            throw 0;
                        return (hintOpen.value = !hintOpen.value);
                        // @ts-ignore
                        [current, current, current, current, t, t, t, isCompact, isCompact, hintOpen, hintOpen, hintOpen, hintOpen, hintOverflows,];
                    } },
                type: "button",
                ...{ class: "quest-more" },
                'data-testid': "quest-more",
                'aria-expanded': (hintOpen.value),
            });
            /** @type {__VLS_StyleScopedClasses['quest-more']} */ ;
            (hintOpen.value ? __VLS_unwrap(t, {})('quests.less') : __VLS_unwrap(t, {})('quests.more'));
        }
        if (currentProgress.value) {
            const __VLS_11 = QuestProgress;
            // @ts-ignore
            const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
                // @ts-ignore
                kind: (currentProgress.value.kind), progress: (currentProgress.value.progress),
            }));
            const __VLS_13 = __VLS_12({
                kind: (currentProgress.value.kind),
                progress: (currentProgress.value.progress),
            }, ...__VLS_functionalComponentArgsRest(__VLS_12));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "quest-footer" },
        });
        /** @type {__VLS_StyleScopedClasses['quest-footer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "quest-reward" },
            'aria-label': (__VLS_unwrap(t, {})('quests.rewardLabel')),
        });
        /** @type {__VLS_StyleScopedClasses['quest-reward']} */ ;
        const __VLS_16 = __VLS_tryAsConstant((__VLS_unwrap(REWARD_KINDS, {})));
        for (const [kind] of __VLS_vFor(__VLS_nonNull(__VLS_16))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                key: (kind),
                ...{ class: "reward-item" },
                title: (__VLS_unwrap(resourceName, {})(kind)),
            });
            /** @type {__VLS_StyleScopedClasses['reward-item']} */ ;
            const __VLS_17 = ResourceIcon;
            // @ts-ignore
            const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
                // @ts-ignore
                kind: (kind), size: (14),
            }));
            const __VLS_19 = __VLS_18({
                kind: (kind),
                size: (14),
            }, ...__VLS_functionalComponentArgsRest(__VLS_18));
            (current.value.reward[kind]);
            // @ts-ignore
            [current, t, t, t, currentProgress, currentProgress, currentProgress, hintOpen, hintOpen, REWARD_KINDS, resourceName,];
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
            const __VLS_22 = __VLS_tryAsConstant((alsoReady.value));
            for (const [q] of __VLS_vFor(__VLS_nonNull(__VLS_22))) {
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
                const __VLS_23 = __VLS_tryAsConstant((__VLS_unwrap(REWARD_KINDS, {})));
                for (const [kind] of __VLS_vFor(__VLS_nonNull(__VLS_23))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        key: (kind),
                        ...{ class: "reward-item" },
                        title: (__VLS_unwrap(resourceName, {})(kind)),
                    });
                    /** @type {__VLS_StyleScopedClasses['reward-item']} */ ;
                    const __VLS_24 = ResourceIcon;
                    // @ts-ignore
                    const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
                        // @ts-ignore
                        kind: (kind), size: (14),
                    }));
                    const __VLS_26 = __VLS_25({
                        kind: (kind),
                        size: (14),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
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
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
