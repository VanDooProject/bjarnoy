/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Settlement expansion (issue #55): renown, training settlers, and
// dispatching/recalling/retargeting a founding convoy.
//
// Deliberately a small, self-contained panel that polls the API directly
// rather than being woven into `stores/world.ts`'s existing WorldModel/HUD
// sync loop (`syncHud`) the way BuildQueuePanel/ResourceBar are: this repo's
// troop system (issue #40, phases 1-7) shipped its domain/persistence/API
// layers but never got a frontend at all — no unit-training UI, no army-
// dispatch UI, no garrison display existed anywhere in `src/frontend`
// before this file. Rather than first building a whole general-purpose
// army/garrison UI this issue doesn't ask for, this panel talks to the
// settler-specific and generic-but-reusable endpoints directly. A future
// pass that builds out the rest of the troop system's frontend (raids,
// support, the world map's army markers) should fold this panel's polling
// into that same live-sync mechanism rather than leave two parallel ones.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useAuthStore } from '../../stores/auth';
import { api } from '../../api/client';
import { apiErrorMessage } from '../../i18n/apiErrors';
import { DEMO_MODE } from '../../config';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { useUnsavedInput } from '../../composables/useUnsavedInput';
import { SETTLERS_PER_FOUNDING } from '../../lib/founding';
import { trainingBuildingsOfType } from '../../lib/units/trainingEconomy';
const world = useWorldStore();
const auth = useAuthStore();
const { t } = useI18n({ useScope: 'global' });
const visible = computed(() => !DEMO_MODE && auth.isAuthenticated && !!world.selectedSettlementId);
const renown = ref(null);
const settlement = ref(null);
const convoys = ref([]);
const error = ref(null);
const busy = ref(false);
const settlerCount = computed(() => settlement.value?.garrison.find((g) => g.unit === 'settler')?.count ?? 0);
const foundingConvoys = computed(() => convoys.value.filter((a) => a.mission === 'found'));
// Founding-dispatch form.
const destQ = ref(0);
const destR = ref(0);
useUnsavedInput(() => destQ.value !== 0 || destR.value !== 0);
// The founding convoy is always 5 settlers (`SETTLERS_PER_FOUNDING`);
// the backend rejects provisions above their combined `foodCarryCapacity`
// (`ProvisionsExceedCarryCapacity`), so the form defaults to and is capped at
// that total, read from the unit catalogue rather than hard-coded.
const unitCatalogue = useUnitCatalogueStore();
const maxProvisions = computed(() => (unitCatalogue.byType['settler']?.foodCarryCapacity ?? 0) * SETTLERS_PER_FOUNDING);
const provisionsInput = ref(null);
const provisions = computed(() => Math.min(Math.max(provisionsInput.value ?? maxProvisions.value, 0), maxProvisions.value));
function onProvisionsInput(e) {
    const el = e.target;
    const raw = el.valueAsNumber;
    if (Number.isNaN(raw))
        return;
    provisionsInput.value = Math.min(Math.max(raw, 0), maxProvisions.value);
    if (provisionsInput.value !== raw)
        el.value = String(provisionsInput.value);
}
const retargetFor = ref(null);
async function refresh() {
    if (!visible.value || !world.worldId || !world.selectedSettlementId)
        return;
    try {
        const [r, s, a] = await Promise.all([
            api.getRenown(world.worldId),
            api.getSettlement(world.selectedSettlementId, world.ownerId ?? undefined),
            api.getSettlementArmies(world.selectedSettlementId),
        ]);
        renown.value = r;
        settlement.value = s;
        convoys.value = a;
    }
    catch {
        // Transient/auth hiccups are not worth surfacing every poll tick — the
        // panel just shows whatever it last had.
    }
}
let timer = null;
onMounted(() => {
    void unitCatalogue.load();
    refresh();
    timer = setInterval(refresh, 5000);
});
onUnmounted(() => {
    if (timer)
        clearInterval(timer);
});
// Settlers are trained in a building now (the settler's `requiredBuildingType`); the button spreads the five over every
// functioning one of that type, starting from the first.
const settlerBuildings = computed(() => trainingBuildingsOfType(world.hud.buildings, unitCatalogue.byType['settler']?.requiredBuildingType ?? ''));
async function trainSettlers() {
    const site = settlerBuildings.value[0];
    if (!world.selectedSettlementId || !site)
        return;
    busy.value = true;
    error.value = null;
    try {
        await api.trainUnits(world.selectedSettlementId, {
            unit: 'settler',
            count: SETTLERS_PER_FOUNDING,
            q: site.q,
            r: site.r,
            split: 'evenly',
        });
        await refresh();
    }
    catch (e) {
        error.value = apiErrorMessage(e, t('hud.expansionPanel.trainingFailed'));
    }
    finally {
        busy.value = false;
    }
}
async function dispatchFounding() {
    if (!world.selectedSettlementId)
        return;
    busy.value = true;
    error.value = null;
    try {
        await api.dispatchArmy(world.selectedSettlementId, {
            units: [{ unit: 'settler', count: SETTLERS_PER_FOUNDING }],
            destination: { q: destQ.value, r: destR.value },
            provisions: provisions.value,
            mission: 'found',
        });
        await refresh();
    }
    catch (e) {
        error.value = apiErrorMessage(e, t('hud.expansionPanel.dispatchFailed'));
    }
    finally {
        busy.value = false;
    }
}
async function recall(armyId) {
    busy.value = true;
    error.value = null;
    try {
        await api.recallArmy(armyId);
        await refresh();
    }
    catch (e) {
        error.value = apiErrorMessage(e, t('hud.expansionPanel.recallFailed'));
    }
    finally {
        busy.value = false;
    }
}
function beginRetarget(armyId) {
    retargetFor.value = armyId;
}
async function confirmRetarget() {
    if (!retargetFor.value)
        return;
    busy.value = true;
    error.value = null;
    try {
        await api.retargetFounding(retargetFor.value, { target: { q: destQ.value, r: destR.value } });
        retargetFor.value = null;
        await refresh();
    }
    catch (e) {
        error.value = apiErrorMessage(e, t('hud.expansionPanel.retargetFailed'));
    }
    finally {
        busy.value = false;
    }
}
async function switchTo(settlementId) {
    if (settlementId === world.selectedSettlementId)
        return;
    await world.switchToSettlement(settlementId);
    await refresh();
}
const mySettlements = ref([]);
async function loadMySettlements() {
    // Same auth gate as refresh() — this hits an authorized endpoint, so an
    // anonymous/demo player must never even attempt the request (it 401s,
    // and the caught error still surfaces as a console error in tests that
    // assert a clean console).
    if (!visible.value || !world.worldId)
        return;
    try {
        mySettlements.value = await api.listMySettlements(world.worldId);
    }
    catch {
        // Best-effort — the switcher just shows only the current settlement then.
    }
}
onMounted(loadMySettlements);
watch(visible, (isVisible) => {
    if (isVisible)
        loadMySettlements();
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(visible, {});
    __VLS_withDotValue(renown, {});
    __VLS_withDotValue(mySettlements, {});
    __VLS_withDotValue(world, {});
    __VLS_withDotValue(busy, {});
    __VLS_withDotValue(settlerBuildings, {});
    __VLS_withDotValue(foundingConvoys, {});
    __VLS_withDotValue(retargetFor, {});
    __VLS_withDotValue(error, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['expansion-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['expansion-switcher']} */ ;
    /** @type {__VLS_StyleScopedClasses['expansion-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['expansion-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['expansion-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['expansion-form-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['expansion-form-row']} */ ;
    if (visible.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "status-card expansion-card" },
        });
        /** @type {__VLS_StyleScopedClasses['status-card']} */ ;
        /** @type {__VLS_StyleScopedClasses['expansion-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "status-card-header" },
        });
        /** @type {__VLS_StyleScopedClasses['status-card-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "status-card-title" },
        });
        /** @type {__VLS_StyleScopedClasses['status-card-title']} */ ;
        (__VLS_unwrap(t, {})('hud.expansionPanel.title'));
        if (renown.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "status-card-count" },
            });
            /** @type {__VLS_StyleScopedClasses['status-card-count']} */ ;
            (__VLS_unwrap(t, {})('hud.expansionPanel.renown', { total: Math.floor(renown.value.total), required: Math.round(renown.value.requiredForNextSettlement) }));
        }
        if (mySettlements.value.length > 1) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "expansion-switcher" },
            });
            /** @type {__VLS_StyleScopedClasses['expansion-switcher']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: "settlement-switcher",
            });
            (__VLS_unwrap(t, {})('hud.expansionPanel.settlement'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                ...{ onChange: (...[$event]) => {
                        void $event;
                        if (!(visible.value))
                            throw 0;
                        if (!(mySettlements.value.length > 1))
                            throw 0;
                        return (switchTo($event.target.value));
                        // @ts-ignore
                        [visible, t, t, t, renown, renown, renown, mySettlements,];
                    } },
                id: "settlement-switcher",
                value: (world.value.selectedSettlementId),
            });
            const __VLS_0 = __VLS_tryAsConstant((mySettlements.value));
            for (const [s] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (s.id),
                    value: (s.id),
                });
                (s.name);
                // @ts-ignore
                [mySettlements, world,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "expansion-row" },
        });
        /** @type {__VLS_StyleScopedClasses['expansion-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_unwrap(t, {})('hud.expansionPanel.settlersInGarrison'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_unwrap(settlerCount, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (trainSettlers) },
            type: "button",
            ...{ class: "expansion-button" },
            disabled: (busy.value || settlerBuildings.value.length === 0),
        });
        /** @type {__VLS_StyleScopedClasses['expansion-button']} */ ;
        (__VLS_unwrap(t, {})('hud.expansionPanel.trainSettlers'));
        if (renown.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "expansion-row" },
            });
            /** @type {__VLS_StyleScopedClasses['expansion-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_unwrap(t, {})('hud.expansionPanel.canFoundAnother'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (renown.value.canFoundAnother ? __VLS_unwrap(t, {})('hud.expansionPanel.yes') : __VLS_unwrap(t, {})('hud.expansionPanel.notYet'));
        }
        if (__VLS_unwrap(settlerCount, {}) >= __VLS_unwrap(SETTLERS_PER_FOUNDING, {}) && renown.value?.canFoundAnother) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "expansion-form" },
            });
            /** @type {__VLS_StyleScopedClasses['expansion-form']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "expansion-form-row" },
            });
            /** @type {__VLS_StyleScopedClasses['expansion-form-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_unwrap(t, {})('hud.expansionPanel.targetHex'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "number",
                'aria-label': "Target Q",
            });
            (__VLS_unwrap(destQ, {}));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "number",
                'aria-label': "Target R",
            });
            (__VLS_unwrap(destR, {}));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "expansion-form-row" },
            });
            /** @type {__VLS_StyleScopedClasses['expansion-form-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
            (__VLS_unwrap(t, {})('hud.expansionPanel.provisions', { max: __VLS_unwrap(maxProvisions, {}) }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: (onProvisionsInput) },
                value: (__VLS_unwrap(provisions, {})),
                type: "number",
                min: "0",
                max: (__VLS_unwrap(maxProvisions, {})),
                'aria-label': "Provisions",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (dispatchFounding) },
                type: "button",
                ...{ class: "expansion-button" },
                disabled: (busy.value),
            });
            /** @type {__VLS_StyleScopedClasses['expansion-button']} */ ;
            (__VLS_unwrap(t, {})('hud.expansionPanel.foundHere'));
        }
        if (foundingConvoys.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "expansion-convoys" },
            });
            /** @type {__VLS_StyleScopedClasses['expansion-convoys']} */ ;
            const __VLS_1 = __VLS_tryAsConstant((foundingConvoys.value));
            for (const [c] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (c.id),
                    ...{ class: "status-row" },
                });
                /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "status-row-top" },
                });
                /** @type {__VLS_StyleScopedClasses['status-row-top']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "status-row-name" },
                });
                /** @type {__VLS_StyleScopedClasses['status-row-name']} */ ;
                (__VLS_unwrap(t, {})('hud.expansionPanel.settlerConvoy'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "status-row-time" },
                });
                /** @type {__VLS_StyleScopedClasses['status-row-time']} */ ;
                (c.position.q);
                (c.position.r);
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "expansion-form-row" },
                });
                /** @type {__VLS_StyleScopedClasses['expansion-form-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(visible.value))
                                throw 0;
                            if (!(foundingConvoys.value.length))
                                throw 0;
                            return (recall(c.id));
                            // @ts-ignore
                            [t, t, t, t, t, t, t, t, t, renown, renown, renown, settlerCount, settlerCount, busy, busy, settlerBuildings, SETTLERS_PER_FOUNDING, destQ, destR, maxProvisions, maxProvisions, provisions, foundingConvoys, foundingConvoys,];
                        } },
                    type: "button",
                    ...{ class: "expansion-button-small" },
                    disabled: (busy.value),
                });
                /** @type {__VLS_StyleScopedClasses['expansion-button-small']} */ ;
                (__VLS_unwrap(t, {})('hud.expansionPanel.recall'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(visible.value))
                                throw 0;
                            if (!(foundingConvoys.value.length))
                                throw 0;
                            return (beginRetarget(c.id));
                            // @ts-ignore
                            [t, busy,];
                        } },
                    type: "button",
                    ...{ class: "expansion-button-small" },
                    disabled: (busy.value),
                });
                /** @type {__VLS_StyleScopedClasses['expansion-button-small']} */ ;
                (__VLS_unwrap(t, {})('hud.expansionPanel.retarget'));
                if (retargetFor.value === c.id) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "expansion-form-row" },
                    });
                    /** @type {__VLS_StyleScopedClasses['expansion-form-row']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                        type: "number",
                        'aria-label': "New target Q",
                    });
                    (__VLS_unwrap(destQ, {}));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                        type: "number",
                        'aria-label': "New target R",
                    });
                    (__VLS_unwrap(destR, {}));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (confirmRetarget) },
                        type: "button",
                        ...{ class: "expansion-button-small" },
                        disabled: (busy.value),
                    });
                    /** @type {__VLS_StyleScopedClasses['expansion-button-small']} */ ;
                    (__VLS_unwrap(t, {})('hud.expansionPanel.confirm'));
                }
                // @ts-ignore
                [t, t, busy, busy, destQ, destR, retargetFor,];
            }
        }
        if (error.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "expansion-error" },
            });
            /** @type {__VLS_StyleScopedClasses['expansion-error']} */ ;
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
