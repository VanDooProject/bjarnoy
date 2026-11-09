/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import DateTimeField from '../../components/admin/DateTimeField.vue';
import { useUnsavedInput } from '../../composables/useUnsavedInput';
import { dateTimePattern, formatDateTime, formatRelativeTime, parseDateTime } from '../../lib/dateTimeFormat';
import { DEFAULT_GENERATION } from '../../lib/map/worldGenerator';
const { t, locale } = useI18n({ useScope: 'global' });
const worlds = ref([]);
const loading = ref(true);
const loadError = ref(null);
const drafts = reactive({});
function draftFor(world) {
    return {
        name: world.name,
        speedFactor: String(world.speedFactor),
        startsAt: formatDateTime(world.startsAt, locale.value),
        joinsClosed: world.joinsClosed,
        frozenIslesEnabled: world.frozenIslesEnabled,
        hidden: world.hidden,
        endbossAt: formatDateTime(world.endbossAt, locale.value),
        runState: world.runState,
        graceMinutes: '0',
        saving: false,
        error: null,
    };
}
// The date fields hold text in the UI language's layout; when the language
// changes, re-write what is typed into the new layout so it still parses.
watch(locale, (next, prev) => {
    for (const draft of Object.values(drafts)) {
        for (const key of ['startsAt', 'endbossAt']) {
            const parsed = parseDateTime(draft[key], prev);
            if (parsed.ok)
                draft[key] = formatDateTime(parsed.iso, next);
        }
    }
});
// Creating a world (issue #105). Its own draft, separate from the per-world
// settings drafts above — this one has no world to key off yet.
const newWorld = reactive({
    name: '',
    seed: '',
    radius: String(DEFAULT_GENERATION.worldRadius),
    maxPlayers: '500',
    creating: false,
    error: null,
});
function editedFields(d) {
    return JSON.stringify([d.speedFactor, d.startsAt, d.joinsClosed, d.frozenIslesEnabled, d.endbossAt, d.graceMinutes]);
}
// A new-world form with a name or seed typed, or a world setting changed but not saved.
useUnsavedInput(() => newWorld.name !== '' ||
    newWorld.seed !== '' ||
    worlds.value.some((world) => !!drafts[world.id] && editedFields(drafts[world.id]) !== editedFields(draftFor(world))));
async function createWorld() {
    if (newWorld.creating)
        return;
    if (newWorld.name.trim().length < 3) {
        newWorld.error = t('adminWorlds.create.nameTooShort');
        return;
    }
    newWorld.creating = true;
    newWorld.error = null;
    try {
        const created = await api.adminCreateWorld({
            name: newWorld.name.trim(),
            // An omitted seed means "draw one" — the backend does that, so an empty
            // field must send nothing rather than 0, which is a real seed.
            seed: newWorld.seed === '' ? undefined : Number(newWorld.seed),
            radius: Number(newWorld.radius) || DEFAULT_GENERATION.worldRadius,
            maxPlayers: Number(newWorld.maxPlayers) || 500,
        });
        worlds.value = [...worlds.value, created];
        drafts[created.id] = draftFor(created);
        newWorld.name = '';
        newWorld.seed = '';
    }
    catch (err) {
        newWorld.error = err instanceof ApiError ? err.message : t('adminWorlds.create.createError');
    }
    finally {
        newWorld.creating = false;
    }
}
async function load() {
    loading.value = true;
    loadError.value = null;
    try {
        worlds.value = await api.adminListWorlds();
        for (const world of worlds.value) {
            drafts[world.id] = draftFor(world);
        }
    }
    catch {
        loadError.value = t('adminWorlds.loadError');
    }
    finally {
        loading.value = false;
    }
}
onMounted(load);
// A world is generated in the background after the create request returns (status "creating"): poll the list
// while one is, and pick up its new status and seed when it turns "active" or "failed".
const CREATING_POLL_MS = 3000;
let creatingPoll = null;
const anyCreating = computed(() => worlds.value.some((w) => w.status === 'creating'));
async function refreshCreating() {
    try {
        const fresh = await api.adminListWorlds();
        const previous = new Map(worlds.value.map((w) => [w.id, w]));
        worlds.value = fresh;
        for (const world of fresh) {
            // Only a world that just left "creating" (or is new) takes the server's values; every other draft may hold unsaved edits.
            if (!drafts[world.id] || previous.get(world.id)?.status !== world.status)
                drafts[world.id] = draftFor(world);
        }
    }
    catch {
        // The next tick tries again; the list on screen stays as it was.
    }
}
watch(anyCreating, (creating) => {
    if (creating && creatingPoll === null) {
        creatingPoll = setInterval(() => void refreshCreating(), CREATING_POLL_MS);
    }
    else if (!creating && creatingPoll !== null) {
        clearInterval(creatingPoll);
        creatingPoll = null;
    }
}, { immediate: true });
onBeforeUnmount(() => {
    if (creatingPoll !== null)
        clearInterval(creatingPoll);
});
const STATUSES = ['active', 'inactive', 'full', 'creating', 'failed'];
function statusName(status) {
    return STATUSES.includes(status) ? t(`adminWorlds.statuses.${status}`) : status;
}
/** A world still being generated or whose generation failed has no map to configure: its panel only says so. */
function hasMap(world) {
    return world.status !== 'creating' && world.status !== 'failed';
}
function applyUpdated(updated) {
    const index = worlds.value.findIndex((w) => w.id === updated.id);
    if (index !== -1)
        worlds.value[index] = updated;
    drafts[updated.id] = draftFor(updated);
}
async function saveSettings(world) {
    const draft = drafts[world.id];
    if (!draft || draft.saving)
        return;
    const name = draft.name.trim();
    if (name.length < 3) {
        draft.error = t('adminWorlds.create.nameTooShort');
        return;
    }
    const speedFactor = Number(draft.speedFactor);
    if (!Number.isFinite(speedFactor) || speedFactor <= 0) {
        draft.error = t('adminWorlds.speedFactorTooLow');
        return;
    }
    const startsAt = parseDateTime(draft.startsAt, locale.value);
    const endbossAt = parseDateTime(draft.endbossAt, locale.value);
    if (!startsAt.ok || !endbossAt.ok) {
        draft.error = t('adminWorlds.dateInvalid', { pattern: dateTimePattern(locale.value) });
        return;
    }
    draft.saving = true;
    draft.error = null;
    try {
        const updated = await api.adminUpdateWorldSettings(world.id, {
            name,
            speedFactor,
            startsAt: startsAt.iso,
            joinsClosed: draft.joinsClosed,
            frozenIslesEnabled: draft.frozenIslesEnabled,
            hidden: draft.hidden,
            endbossAt: endbossAt.iso,
        });
        // Saving the settings must not throw away a run state that was picked
        // but not applied yet.
        const pendingRunState = draft.runState;
        applyUpdated(updated);
        drafts[updated.id].runState = pendingRunState;
    }
    catch (err) {
        draft.error = err instanceof ApiError ? err.message : t('adminWorlds.saveError');
    }
    finally {
        draft.saving = false;
    }
}
// The run states a world can be put in, with the backend action that gets
// it there (POST /admin/worlds/{id}/run-state).
const RUN_STATES = ['running', 'paused', 'maintenance', 'locked'];
const ACTION_FOR_STATE = {
    running: 'resume',
    paused: 'pause',
    maintenance: 'maintenance',
    locked: 'lock',
};
const RUN_STATE_LABELS = computed(() => ({
    pause: t('adminWorlds.runStateLabels.pause'),
    maintenance: t('adminWorlds.runStateLabels.maintenance'),
    lock: t('adminWorlds.runStateLabels.lock'),
    resume: t('adminWorlds.runStateLabels.resume'),
}));
function runStateName(state) {
    return RUN_STATES.includes(state) ? t(`adminWorlds.runStates.${state}`) : state;
}
function runStateSinceText(world) {
    return t('adminWorlds.runStateSince', {
        state: runStateName(world.runState),
        date: formatDateTime(world.runStateSince, locale.value),
        relative: formatRelativeTime(world.runStateSince, new Date(), locale.value),
    });
}
/** The grace field only matters when resuming a world that is not running. */
function showsGrace(world) {
    return drafts[world.id]?.runState === 'running' && world.runState !== 'running';
}
async function applyRunState(world) {
    const draft = drafts[world.id];
    if (!draft || draft.saving || draft.runState === world.runState)
        return;
    const action = ACTION_FOR_STATE[draft.runState];
    if (!action)
        return;
    const label = RUN_STATE_LABELS.value[action] ?? action;
    if (!window.confirm(t('adminWorlds.confirmRunState', { label, name: world.name })))
        return;
    draft.saving = true;
    draft.error = null;
    try {
        const graceMinutes = action === 'resume' ? Number(draft.graceMinutes) || 0 : undefined;
        const updated = await api.adminSetWorldRunState(world.id, { action, graceMinutes });
        applyUpdated(updated);
    }
    catch (err) {
        draft.error = err instanceof ApiError ? err.message : t('adminWorlds.runStateError');
    }
    finally {
        draft.saving = false;
    }
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(newWorld, {});
    __VLS_withDotValue(loading, {});
    __VLS_withDotValue(loadError, {});
    __VLS_withDotValue(drafts, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['fields']} */ ;
    /** @type {__VLS_StyleScopedClasses['fields']} */ ;
    /** @type {__VLS_StyleScopedClasses['fields']} */ ;
    /** @type {__VLS_StyleScopedClasses['run-state']} */ ;
    /** @type {__VLS_StyleScopedClasses['grace']} */ ;
    /** @type {__VLS_StyleScopedClasses['create']} */ ;
    /** @type {__VLS_StyleScopedClasses['create-fields']} */ ;
    /** @type {__VLS_StyleScopedClasses['create-fields']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "worlds" },
    });
    /** @type {__VLS_StyleScopedClasses['worlds']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.$t('adminWorlds.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (createWorld) },
        ...{ class: "create" },
    });
    /** @type {__VLS_StyleScopedClasses['create']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('adminWorlds.create.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "create-fields" },
    });
    /** @type {__VLS_StyleScopedClasses['create-fields']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('adminWorlds.create.name'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        value: (newWorld.value.name),
        type: "text",
        placeholder: (__VLS_ctx.$t('adminWorlds.create.namePlaceholder')),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('adminWorlds.create.seed'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        step: "1",
        placeholder: (__VLS_ctx.$t('adminWorlds.create.seedPlaceholder')),
    });
    (newWorld.value.seed);
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('adminWorlds.create.radius'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        min: "1",
        max: "5000",
        step: "1",
    });
    (newWorld.value.radius);
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    (__VLS_ctx.$t('adminWorlds.create.maxPlayers'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "number",
        min: "1",
        step: "1",
    });
    (newWorld.value.maxPlayers);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        type: "submit",
        disabled: (newWorld.value.creating),
    });
    (newWorld.value.creating ? __VLS_ctx.$t('adminWorlds.create.generating') : __VLS_ctx.$t('adminWorlds.create.submit'));
    if (newWorld.value.error) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (newWorld.value.error);
    }
    if (loading.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.$t('adminWorlds.loading'));
    }
    else if (loadError.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (loadError.value);
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "table" },
        });
        /** @type {__VLS_StyleScopedClasses['table']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorlds.columns.name'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorlds.columns.status'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorlds.columns.runState'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorlds.columns.players'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            title: (__VLS_ctx.$t('adminWorlds.columns.spawnsHint')),
        });
        (__VLS_ctx.$t('adminWorlds.columns.spawns'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorlds.columns.joinable'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorlds.columns.endboss'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorlds.columns.frozenIsles'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorlds.columns.hidden'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorlds.columns.seed'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(worlds, {})));
        for (const [world] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (world.id),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (world.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (statusName(world.status));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (runStateName(world.runState));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (world.playerCount);
            (world.maxPlayers);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (world.freeSpawnCount);
            (world.spawnCount);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (world.joinsClosed ? __VLS_ctx.$t('adminWorlds.joins.closed') : __VLS_ctx.$t('adminWorlds.joins.open'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (world.endbossTriggeredAt ? __VLS_ctx.$t('adminWorlds.endbossStatus.triggered') : world.endbossAt ? __VLS_ctx.$t('adminWorlds.endbossStatus.scheduled') : __VLS_ctx.$t('adminWorlds.endbossStatus.none'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (world.frozenIslesEnabled ? __VLS_ctx.$t('adminWorlds.frozenIsles.enabled') : __VLS_ctx.$t('adminWorlds.frozenIsles.disabled'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (world.hidden ? __VLS_ctx.$t('adminWorlds.yes') : __VLS_ctx.$t('adminWorlds.no'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (world.seed);
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, newWorld, newWorld, newWorld, newWorld, newWorld, newWorld, newWorld, newWorld, loading, loadError, loadError, worlds,];
        }
    }
    const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(worlds, {})));
    for (const [world] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            key: (`panel-${world.id}`),
            ...{ class: "panel" },
        });
        /** @type {__VLS_StyleScopedClasses['panel']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (world.name);
        if (world.status === 'creating') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "creating-note" },
            });
            /** @type {__VLS_StyleScopedClasses['creating-note']} */ ;
            (__VLS_ctx.$t('adminWorlds.creatingNote'));
        }
        else if (world.status === 'failed') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "error" },
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (__VLS_ctx.$t('adminWorlds.failedNote', { reason: world.creationError ?? '' }));
        }
        if (hasMap(world)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "fields" },
            });
            /** @type {__VLS_StyleScopedClasses['fields']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: (`name-${world.id}`),
            });
            (__VLS_ctx.$t('adminWorlds.fields.name'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                id: (`name-${world.id}`),
                value: (drafts.value[world.id].name),
                type: "text",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: (`speed-${world.id}`),
            });
            (__VLS_ctx.$t('adminWorlds.fields.speedFactor'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                id: (`speed-${world.id}`),
                type: "number",
                min: "0.01",
                step: "0.1",
            });
            (drafts.value[world.id].speedFactor);
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: (`starts-${world.id}`),
            });
            (__VLS_ctx.$t('adminWorlds.fields.startsAt'));
            const __VLS_2 = DateTimeField;
            // @ts-ignore
            const __VLS_3 = __VLS_asFunctionalComponent1(__VLS_2, new __VLS_2({
                // @ts-ignore
                id: (`starts-${world.id}`), modelValue: (drafts.value[world.id].startsAt),
            }));
            const __VLS_4 = __VLS_3({
                id: (`starts-${world.id}`),
                modelValue: (drafts.value[world.id].startsAt),
            }, ...__VLS_functionalComponentArgsRest(__VLS_3));
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: (`closed-${world.id}`),
            });
            (__VLS_ctx.$t('adminWorlds.fields.closedToNewPlayers'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                id: (`closed-${world.id}`),
                type: "checkbox",
            });
            (drafts.value[world.id].joinsClosed);
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: (`frozen-${world.id}`),
            });
            (__VLS_ctx.$t('adminWorlds.fields.frozenIslesEnabled'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                id: (`frozen-${world.id}`),
                type: "checkbox",
            });
            (drafts.value[world.id].frozenIslesEnabled);
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: (`hidden-${world.id}`),
            });
            (__VLS_ctx.$t('adminWorlds.fields.hidden'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                id: (`hidden-${world.id}`),
                type: "checkbox",
            });
            (drafts.value[world.id].hidden);
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: (`endboss-${world.id}`),
            });
            (__VLS_ctx.$t('adminWorlds.fields.endbossAt'));
            const __VLS_7 = DateTimeField;
            // @ts-ignore
            const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
                // @ts-ignore
                id: (`endboss-${world.id}`), modelValue: (drafts.value[world.id].endbossAt),
            }));
            const __VLS_9 = __VLS_8({
                id: (`endboss-${world.id}`),
                modelValue: (drafts.value[world.id].endbossAt),
            }, ...__VLS_functionalComponentArgsRest(__VLS_8));
        }
        if (hasMap(world) && drafts.value[world.id]?.error) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "error" },
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (drafts.value[world.id].error);
        }
        if (hasMap(world)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "actions" },
            });
            /** @type {__VLS_StyleScopedClasses['actions']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(hasMap(world)))
                            throw 0;
                        return (saveSettings(world));
                        // @ts-ignore
                        [$t, $t, $t, $t, $t, $t, $t, $t, $t, worlds, drafts, drafts, drafts, drafts, drafts, drafts, drafts, drafts, drafts,];
                    } },
                disabled: (drafts.value[world.id]?.saving),
            });
            (drafts.value[world.id]?.saving ? __VLS_ctx.$t('adminWorlds.saving') : __VLS_ctx.$t('adminWorlds.saveSettings'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "run-state" },
            });
            /** @type {__VLS_StyleScopedClasses['run-state']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "run-state-since" },
            });
            /** @type {__VLS_StyleScopedClasses['run-state-since']} */ ;
            (runStateSinceText(world));
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                value: (drafts.value[world.id].runState),
                'aria-label': (__VLS_ctx.$t('adminWorlds.columns.runState')),
            });
            const __VLS_12 = __VLS_tryAsConstant((__VLS_unwrap(RUN_STATES, {})));
            for (const [state] of __VLS_vFor(__VLS_nonNull(__VLS_12))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (state),
                    value: (state),
                });
                (runStateName(state));
                // @ts-ignore
                [$t, $t, $t, drafts, drafts, drafts, RUN_STATES,];
            }
            if (showsGrace(world)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                    ...{ class: "grace" },
                });
                /** @type {__VLS_StyleScopedClasses['grace']} */ ;
                (__VLS_ctx.$t('adminWorlds.graceMinutes'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    type: "number",
                    min: "0",
                    step: "1",
                });
                (drafts.value[world.id].graceMinutes);
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(hasMap(world)))
                            throw 0;
                        return (applyRunState(world));
                        // @ts-ignore
                        [$t, drafts,];
                    } },
                ...{ class: "apply-run-state" },
                disabled: (drafts.value[world.id]?.saving || drafts.value[world.id]?.runState === world.runState),
            });
            /** @type {__VLS_StyleScopedClasses['apply-run-state']} */ ;
            (__VLS_ctx.$t('adminWorlds.applyRunState'));
            let __VLS_13;
            /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
            routerLink;
            // @ts-ignore
            const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
                // @ts-ignore
                ...{ class: "reseed-link" }, to: (`/admin/worlds/${world.id}/reseed`),
            }));
            const __VLS_15 = __VLS_14({
                ...{ class: "reseed-link" },
                to: (`/admin/worlds/${world.id}/reseed`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_14));
            /** @type {__VLS_StyleScopedClasses['reseed-link']} */ ;
            var __VLS_16;
            const { default: __VLS_18 } = __VLS_nonNull(__VLS_16.slots);
            (__VLS_ctx.$t('adminWorlds.reseedLink'));
            // @ts-ignore
            [$t, $t, drafts, drafts,];
        }
        // @ts-ignore
        [];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
