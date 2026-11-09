/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import { useLeaderboardStore } from '../stores/leaderboard';
import { useWorldStore } from '../stores/world';
const { t, d } = useI18n({ useScope: 'global' });
const world = useWorldStore();
const auth = useAuthStore();
const leaderboard = useLeaderboardStore();
const scopeLabels = computed(() => ({
    user: t('leaderboard.scopes.user'),
    settlement: t('leaderboard.scopes.settlement'),
    guild: t('leaderboard.scopes.guild'),
}));
const categoryLabels = computed(() => ({
    score: t('leaderboard.categories.score'),
    biggestSettlement: t('leaderboard.categories.biggestSettlement'),
    weeklyScoreGained: t('leaderboard.categories.weeklyScoreGained'),
    weeklyFightsWon: t('leaderboard.categories.weeklyFightsWon'),
    weeklyFightsLost: t('leaderboard.categories.weeklyFightsLost'),
    weeklyResourcesLooted: t('leaderboard.categories.weeklyResourcesLooted'),
    biggestArmy: t('leaderboard.categories.biggestArmy'),
}));
// Mirrors the reasons `LeaderboardCatalogue.cs` hands back — kept as a plain
// map so a reason with no entry here still renders something (its raw code).
const darkReasonLabels = computed(() => ({
    noBattleSystemYet: t('leaderboard.darkReasons.noBattleSystemYet'),
    noArmySystemYet: t('leaderboard.darkReasons.noArmySystemYet'),
    noGuildSystemYet: t('leaderboard.darkReasons.noGuildSystemYet'),
    noWeeklyWindowsYet: t('leaderboard.darkReasons.noWeeklyWindowsYet'),
    notComputedYet: t('leaderboard.darkReasons.notComputedYet'),
    unknownBoard: t('leaderboard.darkReasons.unknownBoard'),
}));
const scopeOrder = ['user', 'settlement', 'guild'];
const groupedBoards = computed(() => scopeOrder
    .map((scope) => ({ scope, boards: leaderboard.boardsByScope[scope] ?? [] }))
    .filter((group) => group.boards.length > 0));
const activeBoard = computed(() => leaderboard.board);
const canJumpToMyRank = computed(() => auth.isAuthenticated && leaderboard.scope !== null && activeBoard.value?.available === true);
function isActive(scope, category) {
    return leaderboard.scope === scope && leaderboard.category === category;
}
function selectTab(scope, category) {
    void leaderboard.selectBoard(scope, category);
}
// Newest window first, so "current" reads as the top of a chronological list.
const windowOptions = computed(() => [...leaderboard.weeklyWindows].reverse());
function windowLabel(periodStart) {
    return d(new Date(periodStart), 'short');
}
function selectWindow(periodStart) {
    void leaderboard.selectWindow(periodStart);
}
function loadMore() {
    void leaderboard.loadPage();
}
function jumpToMyRank() {
    void leaderboard.jumpToMyRank();
}
async function loadForCurrentWorld() {
    if (!world.worldId)
        return;
    await leaderboard.loadDirectory(world.worldId);
    const first = leaderboard.boards[0];
    if (first)
        await leaderboard.selectBoard(first.scope, first.category);
}
onMounted(loadForCurrentWorld);
watch(() => world.worldId, loadForCurrentWorld);
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(world, {});
    __VLS_withDotValue(leaderboard, {});
    __VLS_withDotValue(scopeLabels, {});
    __VLS_withDotValue(darkReasonLabels, {});
    __VLS_withDotValue(categoryLabels, {});
    __VLS_withDotValue(activeBoard, {});
    __VLS_withDotValue(canJumpToMyRank, {});
    __VLS_withDotValue(windowOptions, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['leaderboard']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['board-header']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['pager']} */ ;
    /** @type {__VLS_StyleScopedClasses['pager']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "leaderboard" },
    });
    /** @type {__VLS_StyleScopedClasses['leaderboard']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.$t('leaderboard.title'));
    if (!world.value.worldId) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('leaderboard.noWorld'));
    }
    else {
        if (leaderboard.value.directoryLoading) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
            (__VLS_ctx.$t('common.states.loading'));
        }
        else if (leaderboard.value.directoryError) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "error" },
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (leaderboard.value.directoryError);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "tab-groups" },
            });
            /** @type {__VLS_StyleScopedClasses['tab-groups']} */ ;
            const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(groupedBoards, {})));
            for (const [group] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (group.scope),
                    ...{ class: "tab-group" },
                });
                /** @type {__VLS_StyleScopedClasses['tab-group']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "tab-group-label" },
                });
                /** @type {__VLS_StyleScopedClasses['tab-group-label']} */ ;
                (scopeLabels.value[group.scope]);
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "tabs" },
                });
                /** @type {__VLS_StyleScopedClasses['tabs']} */ ;
                const __VLS_1 = __VLS_tryAsConstant((group.boards));
                for (const [board] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!!(!world.value.worldId))
                                    throw 0;
                                if (!!(leaderboard.value.directoryLoading))
                                    throw 0;
                                if (!!(leaderboard.value.directoryError))
                                    throw 0;
                                return (selectTab(board.scope, board.category));
                                // @ts-ignore
                                [$t, $t, $t, world, leaderboard, leaderboard, leaderboard, groupedBoards, scopeLabels,];
                            } },
                        key: (`${board.scope}-${board.category}`),
                        type: "button",
                        ...{ class: "tab" },
                        ...{ class: ({ active: isActive(board.scope, board.category), dark: !board.available }) },
                        title: (board.available ? undefined : darkReasonLabels.value[board.reason ?? ''] ?? board.reason ?? ''),
                    });
                    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
                    /** @type {__VLS_StyleScopedClasses['active']} */ ;
                    /** @type {__VLS_StyleScopedClasses['dark']} */ ;
                    (categoryLabels.value[board.category]);
                    // @ts-ignore
                    [darkReasonLabels, categoryLabels,];
                }
                // @ts-ignore
                [];
            }
            if (activeBoard.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "board" },
                });
                /** @type {__VLS_StyleScopedClasses['board']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "board-header" },
                });
                /** @type {__VLS_StyleScopedClasses['board-header']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
                (categoryLabels.value[activeBoard.value.category]);
                if (canJumpToMyRank.value) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (jumpToMyRank) },
                        type: "button",
                        ...{ class: "jump-btn" },
                    });
                    /** @type {__VLS_StyleScopedClasses['jump-btn']} */ ;
                    (__VLS_ctx.$t('leaderboard.jumpToMyRank'));
                }
                if (windowOptions.value.length > 0) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "tabs windows" },
                    });
                    /** @type {__VLS_StyleScopedClasses['tabs']} */ ;
                    /** @type {__VLS_StyleScopedClasses['windows']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!!(!world.value.worldId))
                                    throw 0;
                                if (!!(leaderboard.value.directoryLoading))
                                    throw 0;
                                if (!!(leaderboard.value.directoryError))
                                    throw 0;
                                if (!(activeBoard.value))
                                    throw 0;
                                if (!(windowOptions.value.length > 0))
                                    throw 0;
                                return (selectWindow(null));
                                // @ts-ignore
                                [$t, categoryLabels, activeBoard, activeBoard, canJumpToMyRank, windowOptions,];
                            } },
                        type: "button",
                        ...{ class: "tab" },
                        ...{ class: ({ active: leaderboard.value.selectedPeriodStart === null }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
                    /** @type {__VLS_StyleScopedClasses['active']} */ ;
                    (__VLS_ctx.$t('leaderboard.current'));
                    const __VLS_2 = __VLS_tryAsConstant((windowOptions.value));
                    for (const [window] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    void $event;
                                    if (!!(!world.value.worldId))
                                        throw 0;
                                    if (!!(leaderboard.value.directoryLoading))
                                        throw 0;
                                    if (!!(leaderboard.value.directoryError))
                                        throw 0;
                                    if (!(activeBoard.value))
                                        throw 0;
                                    if (!(windowOptions.value.length > 0))
                                        throw 0;
                                    return (selectWindow(window.periodStart));
                                    // @ts-ignore
                                    [$t, leaderboard, windowOptions,];
                                } },
                            key: (window.periodStart),
                            type: "button",
                            ...{ class: "tab" },
                            ...{ class: ({ active: leaderboard.value.selectedPeriodStart === window.periodStart }) },
                        });
                        /** @type {__VLS_StyleScopedClasses['tab']} */ ;
                        /** @type {__VLS_StyleScopedClasses['active']} */ ;
                        (__VLS_ctx.$t('leaderboard.weekOf', { date: windowLabel(window.periodStart) }));
                        // @ts-ignore
                        [$t, leaderboard,];
                    }
                }
                if (!activeBoard.value.available) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                        ...{ class: "hint" },
                    });
                    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
                    (darkReasonLabels.value[activeBoard.value.reason ?? ''] ?? activeBoard.value.reason);
                }
                else {
                    if (leaderboard.value.myRankError) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                            ...{ class: "error" },
                        });
                        /** @type {__VLS_StyleScopedClasses['error']} */ ;
                        (leaderboard.value.myRankError);
                    }
                    if (leaderboard.value.boardLoading && leaderboard.value.entries.length === 0) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
                        (__VLS_ctx.$t('common.states.loading'));
                    }
                    else if (leaderboard.value.boardError) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                            ...{ class: "error" },
                        });
                        /** @type {__VLS_StyleScopedClasses['error']} */ ;
                        (leaderboard.value.boardError);
                    }
                    else if (leaderboard.value.entries.length === 0) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
                        (__VLS_ctx.$t('leaderboard.noEntries'));
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "table-scroll" },
                        });
                        /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                            ...{ class: "table" },
                        });
                        /** @type {__VLS_StyleScopedClasses['table']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
                        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                        (__VLS_ctx.$t('leaderboard.table.rank'));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                        (__VLS_ctx.$t('leaderboard.table.name'));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                        (__VLS_ctx.$t('leaderboard.table.value'));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                        (__VLS_ctx.$t('leaderboard.table.change'));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
                        const __VLS_3 = __VLS_tryAsConstant((leaderboard.value.entries));
                        for (const [entry] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                                key: (entry.subjectId),
                                ...{ class: ({ 'my-row': entry.rank === leaderboard.value.myRank }) },
                            });
                            /** @type {__VLS_StyleScopedClasses['my-row']} */ ;
                            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                            (entry.rank);
                            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                            (entry.subjectName);
                            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                            (Math.round(entry.value));
                            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                            if (entry.previousRank === null) {
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ class: "badge new" },
                                });
                                /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                                /** @type {__VLS_StyleScopedClasses['new']} */ ;
                                (__VLS_ctx.$t('leaderboard.badge.new'));
                            }
                            else if (entry.delta && entry.delta > 0) {
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ class: "badge up" },
                                });
                                /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                                /** @type {__VLS_StyleScopedClasses['up']} */ ;
                                (`▲ ${entry.delta}`);
                            }
                            else if (entry.delta && entry.delta < 0) {
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ class: "badge down" },
                                });
                                /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                                /** @type {__VLS_StyleScopedClasses['down']} */ ;
                                (`▼ ${-entry.delta}`);
                            }
                            else {
                                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                    ...{ class: "badge flat" },
                                });
                                /** @type {__VLS_StyleScopedClasses['badge']} */ ;
                                /** @type {__VLS_StyleScopedClasses['flat']} */ ;
                                (__VLS_ctx.$t('leaderboard.badge.flat'));
                            }
                            // @ts-ignore
                            [$t, $t, $t, $t, $t, $t, $t, $t, leaderboard, leaderboard, leaderboard, leaderboard, leaderboard, leaderboard, leaderboard, leaderboard, leaderboard, darkReasonLabels, activeBoard, activeBoard, activeBoard,];
                        }
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "pager" },
                        });
                        /** @type {__VLS_StyleScopedClasses['pager']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (loadMore) },
                            disabled: (leaderboard.value.boardLoading || !leaderboard.value.nextAfterRank),
                        });
                        (leaderboard.value.boardLoading ? __VLS_ctx.$t('common.states.loading') : __VLS_ctx.$t('leaderboard.loadMore'));
                    }
                }
            }
        }
    }
    // @ts-ignore
    [$t, $t, leaderboard, leaderboard, leaderboard,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
