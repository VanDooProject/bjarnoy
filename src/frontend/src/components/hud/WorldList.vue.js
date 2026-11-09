/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The list-fetching-and-rendering half of "join another world" — extracted
// from WorldPickerView.vue (which still hosts it full-page at /worlds,
// `compact: false`) so ReturningPlayerMenu.vue can also drop it straight
// into its dropdown panel (`compact: true`) instead of nesting it behind an
// intermediate "Join another world" menu step. See
// docs/plans/returning-player-world-switching.md's click-count decision.
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import { useWorldStore } from '../../stores/world';
import { usePlayerStore } from '../../stores/player';
const { defineProps, withDefaults, } = {};
const __VLS_props = withDefaults(defineProps(), { compact: false });
const { t, d } = useI18n({ useScope: 'global' });
const router = useRouter();
const world = useWorldStore();
const player = usePlayerStore();
const worlds = ref([]);
const loading = ref(true);
const loadError = ref(false);
// Per-world "does this owner already have a realm there" lookup — a plain
// per-row `getWorldMembership` call each, awaited alongside the list itself
// in `load()` below before anything renders (world counts here are
// realistically small; no bulk endpoint exists, and adding one just for
// this list would be over-engineering, and awaiting them up front avoids a
// Join-button flash before a Return one replaces it). `null` means "checked,
// no realm there"; absent (the row matching the world already joined,
// skipped entirely) is never read — `isCurrent` is checked first.
const membership = reactive({});
const joiningWorldId = ref(null);
const joinError = ref(null);
async function checkMembership(worldId) {
    try {
        const result = await api.getWorldMembership(worldId, player.id);
        membership[worldId] = result.settlementId;
    }
    catch {
        // Best effort — a failed check just falls back to "no realm known
        // here", which only ever under-offers a Return button in favour of a
        // Join one; the backend's own founding checks are the real authority.
        membership[worldId] = null;
    }
}
async function load() {
    loading.value = true;
    loadError.value = false;
    try {
        worlds.value = await api.listJoinableWorlds();
        await Promise.all(worlds.value.filter((w) => w.id !== world.worldId).map((w) => checkMembership(w.id)));
    }
    catch {
        loadError.value = true;
    }
    finally {
        loading.value = false;
    }
}
onMounted(load);
function isCurrent(w) {
    return w.id === world.worldId;
}
function hasRealm(w) {
    return !!membership[w.id];
}
// Reuses `landing.joinBlocked`'s existing copy where the reason strings
// match — see WorldContracts.cs's `JoinableWorldResponse.From`, which
// mirrors `WorldResponse.From`'s own `joinability.Reason.ToString()
// .ToLowerInvariant()` (so the wire values are e.g. `notstartedyet`,
// `joinsclosed`, not the PascalCase enum names) — rather than a second copy
// of the same messages under the new `worlds` namespace.
function blockedLabel(w) {
    if (w.joinableReason === 'notstartedyet' && w.startsAt) {
        return t('landing.joinBlocked.opensAt', { date: d(new Date(w.startsAt), 'long') });
    }
    if (w.joinableReason === 'joinsclosed') {
        return t('landing.joinBlocked.joinsClosed');
    }
    return t('landing.joinBlocked.notAcceptingPlayers');
}
async function joinOrReturn(w) {
    if (joiningWorldId.value)
        return;
    joiningWorldId.value = w.id;
    joinError.value = null;
    try {
        await world.joinWorld(w.id);
        router.push('/');
    }
    catch (err) {
        joinError.value = err instanceof ApiError ? err.message : t('worlds.joinError');
        joiningWorldId.value = null;
    }
}
const __VLS_defaults = { compact: false };
void __VLS_defaults;
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
    __VLS_withDotValue(loading, {});
    __VLS_withDotValue(loadError, {});
    __VLS_withDotValue(worlds, {});
    __VLS_withDotValue(joiningWorldId, {});
    __VLS_withDotValue(joinError, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['tag']} */ ;
    /** @type {__VLS_StyleScopedClasses['action']} */ ;
    /** @type {__VLS_StyleScopedClasses['rows']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['rows']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    /** @type {__VLS_StyleScopedClasses['rows']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['meta']} */ ;
    /** @type {__VLS_StyleScopedClasses['rows']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['tag']} */ ;
    /** @type {__VLS_StyleScopedClasses['rows']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['tag']} */ ;
    /** @type {__VLS_StyleScopedClasses['blocked']} */ ;
    /** @type {__VLS_StyleScopedClasses['rows']} */ ;
    /** @type {__VLS_StyleScopedClasses['compact']} */ ;
    /** @type {__VLS_StyleScopedClasses['action']} */ ;
    if (loading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status" },
            ...{ class: ({ compact: __VLS_ctx.compact }) },
        });
        /** @type {__VLS_StyleScopedClasses['status']} */ ;
        /** @type {__VLS_StyleScopedClasses['compact']} */ ;
        (__VLS_unwrap(t, {})('worlds.loading'));
    }
    else if (loadError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status error" },
            ...{ class: ({ compact: __VLS_ctx.compact }) },
        });
        /** @type {__VLS_StyleScopedClasses['status']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        /** @type {__VLS_StyleScopedClasses['compact']} */ ;
        (__VLS_unwrap(t, {})('worlds.error'));
    }
    else if (worlds.value.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status" },
            ...{ class: ({ compact: __VLS_ctx.compact }) },
        });
        /** @type {__VLS_StyleScopedClasses['status']} */ ;
        /** @type {__VLS_StyleScopedClasses['compact']} */ ;
        (__VLS_unwrap(t, {})('worlds.empty'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "rows" },
            ...{ class: ({ compact: __VLS_ctx.compact }) },
        });
        /** @type {__VLS_StyleScopedClasses['rows']} */ ;
        /** @type {__VLS_StyleScopedClasses['compact']} */ ;
        const __VLS_0 = __VLS_tryAsConstant((worlds.value));
        for (const [w] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                key: (w.id),
                ...{ class: "row" },
                'data-testid': "world-picker-row",
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "info" },
            });
            /** @type {__VLS_StyleScopedClasses['info']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (w.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "meta" },
            });
            /** @type {__VLS_StyleScopedClasses['meta']} */ ;
            (__VLS_unwrap(t, {})('worlds.players', { count: w.playerCount, max: w.maxPlayers }));
            (__VLS_unwrap(t, {})('worlds.speed', { factor: w.speedFactor }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "state" },
            });
            /** @type {__VLS_StyleScopedClasses['state']} */ ;
            if (isCurrent(w)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "tag" },
                });
                /** @type {__VLS_StyleScopedClasses['tag']} */ ;
                (__VLS_unwrap(t, {})('worlds.youAreHere'));
            }
            else if (hasRealm(w)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "tag" },
                });
                /** @type {__VLS_StyleScopedClasses['tag']} */ ;
                (__VLS_unwrap(t, {})('worlds.yourRealm'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!!(worlds.value.length === 0))
                                throw 0;
                            if (!!(isCurrent(w)))
                                throw 0;
                            if (!(hasRealm(w)))
                                throw 0;
                            return (joinOrReturn(w));
                            // @ts-ignore
                            [loading, compact, compact, compact, compact, t, t, t, t, t, t, t, loadError, worlds, worlds,];
                        } },
                    type: "button",
                    ...{ class: "action" },
                    'data-testid': "world-picker-join",
                    disabled: (joiningWorldId.value === w.id),
                });
                /** @type {__VLS_StyleScopedClasses['action']} */ ;
                (joiningWorldId.value === w.id ? __VLS_unwrap(t, {})('worlds.joining') : __VLS_unwrap(t, {})('worlds.return'));
            }
            else if (w.joinable) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(loading.value))
                                throw 0;
                            if (!!(loadError.value))
                                throw 0;
                            if (!!(worlds.value.length === 0))
                                throw 0;
                            if (!!(isCurrent(w)))
                                throw 0;
                            if (!!(hasRealm(w)))
                                throw 0;
                            if (!(w.joinable))
                                throw 0;
                            return (joinOrReturn(w));
                            // @ts-ignore
                            [t, t, joiningWorldId, joiningWorldId,];
                        } },
                    type: "button",
                    ...{ class: "action" },
                    'data-testid': "world-picker-join",
                    disabled: (joiningWorldId.value === w.id),
                });
                /** @type {__VLS_StyleScopedClasses['action']} */ ;
                (joiningWorldId.value === w.id ? __VLS_unwrap(t, {})('worlds.joining') : __VLS_unwrap(t, {})('worlds.join'));
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "tag blocked" },
                    title: (blockedLabel(w)),
                });
                /** @type {__VLS_StyleScopedClasses['tag']} */ ;
                /** @type {__VLS_StyleScopedClasses['blocked']} */ ;
                (blockedLabel(w));
            }
            // @ts-ignore
            [t, t, joiningWorldId, joiningWorldId,];
        }
    }
    if (joinError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status error" },
            ...{ class: ({ compact: __VLS_ctx.compact }) },
        });
        /** @type {__VLS_StyleScopedClasses['status']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        /** @type {__VLS_StyleScopedClasses['compact']} */ ;
        (joinError.value);
    }
    // @ts-ignore
    [compact, joinError, joinError,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
