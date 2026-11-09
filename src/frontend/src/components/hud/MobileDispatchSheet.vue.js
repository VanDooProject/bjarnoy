/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Issue: mobile army dispatch. Phones hide ArmyPanel entirely (a 260px card
// eats too much of a small screen), so this bottom sheet is the only way to
// compose or edit a dispatch/field-order draft there — mounted by MapView
// whenever `world.dispatchDraft` or `world.fieldOrderDraft` is set. Reuses
// the same store actions and derived-state helpers ArmyPanel.vue does (unit
// class lock-out, target/building pickers, waypoint rows); it does not
// duplicate their rules, just their presentation as a compact sheet instead
// of a right-anchored card.
//
// Units are picked manually here — no default selection (see the PR's own
// notes): the common path is tap tile -> pick units -> Start, not tap ->
// Start.
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { useAuthStore } from '../../stores/auth';
import { DEMO_MODE } from '../../config';
import HuntTargetSummary from './HuntTargetSummary.vue';
import DispatchSlots from './DispatchSlots.vue';
import { useDispatchUnitPicker } from '../../composables/useDispatchUnitPicker';
import { campName, missionName, unitName } from '../../i18n/catalogueNames';
import { maxAffordableProvisions, } from '../../lib/units/armyDispatch';
import DispatchTargetBuildingPicker from './DispatchTargetBuildingPicker.vue';
import SendArmyPicker from './SendArmyPicker.vue';
import { useDispatchTargetBuilding } from '../../composables/useDispatchTargetBuilding';
import { useUnsavedInput } from '../../composables/useUnsavedInput';
const world = useWorldStore();
const auth = useAuthStore();
const catalogue = useUnitCatalogueStore();
const { t } = useI18n({ useScope: 'global' });
const draft = computed(() => world.dispatchDraft);
const fieldDraft = computed(() => world.fieldOrderDraft);
// A dispatch draft always wins if somehow both are set (they're mutually
// exclusive at the store level — see startDispatch/startFieldOrder — this
// is just a defensive tie-break for the template below).
const isFieldOrder = computed(() => !draft.value && !!fieldDraft.value);
// An open order being composed would be lost by a reload.
useUnsavedInput(() => !!draft.value || !!fieldDraft.value);
// Dispatch opens the sheet expanded (units still need picking); a field
// order opens collapsed (route only, and the free "move on" hex is usually
// already plotted by the tap that started it).
const expanded = ref(!!world.dispatchDraft);
// The source picker hands the home garrison over to a dispatch draft: that form opens expanded, units still need picking.
watch(() => world.dispatchDraft, (d) => {
    if (d)
        expanded.value = true;
});
function toggleExpanded() {
    expanded.value = !expanded.value;
}
const garrisonRows = computed(() => world.hud.garrison
    .filter((g) => g.count > 0)
    .map((g) => ({ unit: g.unit, label: unitName(g.unit), available: g.count })));
const picker = useDispatchUnitPicker(garrisonRows);
const { isRowSelectable, hasLockedOutUnits } = picker;
function quantityFor(unit) {
    return draft.value?.unitCounts[unit] ?? 0;
}
function applyQuantity(unit, value, max) {
    const clamped = Number.isFinite(value) ? Math.max(0, Math.min(Math.floor(value), max)) : 0;
    world.setDispatchUnitCount(unit, clamped);
    // Same re-proposal ArmyPanel's setQuantity does — the carry capacity
    // changed, so the previous provisions figure may no longer be the
    // sensible default (the player can still edit it after).
    if (draft.value) {
        world.setDispatchProvisions(maxAffordableProvisions(draft.value.unitCounts, catalogue.byType, world.hud.available.food));
    }
}
function decrement(unit, max) {
    applyQuantity(unit, quantityFor(unit) - 1, max);
}
function increment(unit, max) {
    applyQuantity(unit, quantityFor(unit) + 1, max);
}
function setAll(unit, max) {
    applyQuantity(unit, max, max);
}
const routeLength = computed(() => draft.value?.route.length ?? 0);
const routeRows = computed(() => (draft.value?.route ?? []).map((c, i) => ({
    index: i,
    label: `${i + 1}. (${c.q}, ${c.r})`,
    isDestination: draft.value?.mission === 'move' && i === (draft.value?.route.length ?? 0) - 1,
})));
const hasUnitsSelected = computed(() => !!draft.value && Object.values(draft.value.unitCounts).some((c) => c > 0));
const hasDestination = computed(() => draft.value?.mission === 'attack' || draft.value?.mission === 'support'
    ? !!draft.value.targetSettlementId
    : draft.value?.mission === 'hunt'
        ? !!draft.value.targetCamp
        : routeLength.value > 0);
const canConfirm = computed(() => !DEMO_MODE && hasUnitsSelected.value && hasDestination.value && picker.selectionSendable.value && !buildingPicker.isMissingRequiredPick.value && !draft.value?.submitting);
function setMission(mission) {
    world.setDispatchMission(mission);
}
const targetSearch = ref('');
const attackTargets = computed(() => {
    const all = world.listAttackableSettlements();
    const query = targetSearch.value.trim().toLowerCase();
    const filtered = query
        ? all.filter((s) => s.name.toLowerCase().includes(query) || s.ownerName.toLowerCase().includes(query))
        : all;
    return filtered.slice(0, 25);
});
const selectedTarget = computed(() => draft.value?.targetSettlementId
    ? world.listAttackableSettlements().find((s) => s.id === draft.value?.targetSettlementId) ?? null
    : null);
function pickTarget(settlementId) {
    world.setDispatchTarget(settlementId);
}
function clearTarget() {
    world.setDispatchTarget(null);
}
const buildingPicker = useDispatchTargetBuilding(computed(() => !!selectedTarget.value));
async function startDispatch() {
    await world.confirmDispatch();
}
const fieldOrderRouteLength = computed(() => fieldDraft.value?.route.length ?? 0);
const fieldOrderRouteRows = computed(() => (fieldDraft.value?.route ?? []).map((c, i) => ({
    index: i,
    label: `${i + 1}. (${c.q}, ${c.r})`,
    isDestination: i === (fieldDraft.value?.route.length ?? 0) - 1,
})));
const canConfirmFieldOrder = computed(() => !DEMO_MODE && fieldOrderRouteLength.value > 0 && !fieldDraft.value?.submitting);
async function startFieldOrder() {
    await world.confirmFieldOrder();
}
function cancel() {
    if (isFieldOrder.value)
        world.cancelFieldOrder();
    else
        world.cancelDispatch();
}
function undo() {
    if (isFieldOrder.value)
        world.removeLastFieldOrderWaypoint();
    else
        world.removeLastWaypoint();
}
const summaryText = computed(() => {
    if (isFieldOrder.value) {
        const n = fieldOrderRouteLength.value;
        return t('hud.dispatchSheet.stopsSummary', { count: n, stopWord: t('hud.dispatchSheet.stopWord', n) });
    }
    if (!draft.value)
        return '';
    if (draft.value.mission === 'hunt') {
        const camp = draft.value.targetCamp ? world.model.campAt(draft.value.targetCamp) : undefined;
        if (camp)
            return t('hud.dispatchSheet.toTarget', { name: campName(camp.family) });
    }
    if (draft.value.mission !== 'move' && selectedTarget.value) {
        return t('hud.dispatchSheet.toTarget', { name: selectedTarget.value.name });
    }
    const n = routeLength.value;
    return t('hud.dispatchSheet.stopsSummary', { count: n, stopWord: t('hud.dispatchSheet.stopWord', n) });
});
const missionLabel = computed(() => isFieldOrder.value ? t('hud.dispatchSheet.fieldOrderTitle') : missionName(draft.value?.mission ?? 'move'));
const undoDisabled = computed(() => isFieldOrder.value ? fieldOrderRouteLength.value === 0 : routeLength.value === 0);
const middleButtonLabel = computed(() => isFieldOrder.value
    ? t('hud.dispatchSheet.stops', { count: fieldOrderRouteLength.value })
    : t('hud.dispatchSheet.units', { count: Object.values(draft.value?.unitCounts ?? {}).reduce((sum, c) => sum + Math.max(0, c), 0) }));
const startLabel = computed(() => {
    if (isFieldOrder.value)
        return fieldDraft.value?.submitting ? t('hud.dispatchSheet.starting') : t('hud.dispatchSheet.start');
    return draft.value?.submitting ? t('hud.dispatchSheet.starting') : t('hud.dispatchSheet.start');
});
const startDisabled = computed(() => (isFieldOrder.value ? !canConfirmFieldOrder.value : !canConfirm.value));
function onStart() {
    if (isFieldOrder.value)
        void startFieldOrder();
    else
        void startDispatch();
}
const errorMessage = computed(() => (isFieldOrder.value ? fieldDraft.value?.error : draft.value?.error));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(world, {});
    __VLS_withDotValue(errorMessage, {});
    __VLS_withDotValue(DEMO_MODE, {});
    __VLS_withDotValue(expanded, {});
    __VLS_withDotValue(isFieldOrder, {});
    __VLS_withDotValue(draft, {});
    __VLS_withDotValue(selectedTarget, {});
    __VLS_withDotValue(attackTargets, {});
    __VLS_withDotValue(routeRows, {});
    __VLS_withDotValue(hasLockedOutUnits, {});
    __VLS_withDotValue(garrisonRows, {});
    __VLS_withDotValue(fieldDraft, {});
    __VLS_withDotValue(auth, {});
    __VLS_withDotValue(fieldOrderRouteRows, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['dispatch-sheet-row2']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
    /** @type {__VLS_StyleScopedClasses['mission-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['mission-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    /** @type {__VLS_StyleScopedClasses['mission-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    /** @type {__VLS_StyleScopedClasses['unit-stepper-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['stepper-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['stepper-all']} */ ;
    /** @type {__VLS_StyleScopedClasses['provisions-field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dispatch-sheet" },
        ...{ class: ({ 'is-expanded': expanded.value }) },
    });
    /** @type {__VLS_StyleScopedClasses['dispatch-sheet']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-expanded']} */ ;
    if (world.value.sendPicker) {
        const __VLS_0 = SendArmyPicker;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        }));
        const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "dispatch-sheet-collapsed" },
        });
        /** @type {__VLS_StyleScopedClasses['dispatch-sheet-collapsed']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "dispatch-sheet-row1" },
        });
        /** @type {__VLS_StyleScopedClasses['dispatch-sheet-row1']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "mission-chip" },
        });
        /** @type {__VLS_StyleScopedClasses['mission-chip']} */ ;
        (__VLS_unwrap(missionLabel, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "summary-text" },
        });
        /** @type {__VLS_StyleScopedClasses['summary-text']} */ ;
        (__VLS_unwrap(summaryText, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (cancel) },
            type: "button",
            ...{ class: "sheet-cancel" },
            'aria-label': (__VLS_unwrap(t, {})('hud.dispatchSheet.cancel')),
        });
        /** @type {__VLS_StyleScopedClasses['sheet-cancel']} */ ;
        if (errorMessage.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "status-subtext error-note" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['error-note']} */ ;
            (errorMessage.value);
        }
        if (DEMO_MODE.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "status-subtext demo-note" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['demo-note']} */ ;
            (__VLS_unwrap(t, {})('hud.armyPanel.demoNote'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "dispatch-sheet-row2" },
        });
        /** @type {__VLS_StyleScopedClasses['dispatch-sheet-row2']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (undo) },
            type: "button",
            ...{ class: "secondary" },
            disabled: (__VLS_unwrap(undoDisabled, {})),
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_unwrap(t, {})('hud.armyPanel.undoWaypoint'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (toggleExpanded) },
            type: "button",
            ...{ class: "secondary grip" },
            'aria-label': (expanded.value ? __VLS_unwrap(t, {})('hud.dispatchSheet.collapse') : __VLS_unwrap(t, {})('hud.dispatchSheet.expand')),
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        /** @type {__VLS_StyleScopedClasses['grip']} */ ;
        (__VLS_unwrap(middleButtonLabel, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (onStart) },
            type: "button",
            ...{ class: "primary" },
            disabled: (__VLS_unwrap(startDisabled, {})),
        });
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        (__VLS_unwrap(startLabel, {}));
    }
    if (expanded.value && !world.value.sendPicker) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "dispatch-sheet-expanded" },
        });
        /** @type {__VLS_StyleScopedClasses['dispatch-sheet-expanded']} */ ;
        if (!isFieldOrder.value && draft.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "mission-tabs" },
            });
            /** @type {__VLS_StyleScopedClasses['mission-tabs']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(expanded.value && !world.value.sendPicker))
                            throw 0;
                        if (!(!isFieldOrder.value && draft.value))
                            throw 0;
                        return (setMission('move'));
                        // @ts-ignore
                        [expanded, expanded, expanded, world, world, missionLabel, summaryText, t, t, t, t, t, errorMessage, errorMessage, DEMO_MODE, undoDisabled, middleButtonLabel, startDisabled, startLabel, isFieldOrder, draft,];
                    } },
                type: "button",
                ...{ class: "mission-tab" },
                ...{ class: ({ active: draft.value.mission === 'move' }) },
            });
            /** @type {__VLS_StyleScopedClasses['mission-tab']} */ ;
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            (__VLS_unwrap(missionName, {})('move'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(expanded.value && !world.value.sendPicker))
                            throw 0;
                        if (!(!isFieldOrder.value && draft.value))
                            throw 0;
                        return (setMission('attack'));
                        // @ts-ignore
                        [draft, missionName,];
                    } },
                type: "button",
                ...{ class: "mission-tab attack" },
                ...{ class: ({ active: draft.value.mission === 'attack' }) },
            });
            /** @type {__VLS_StyleScopedClasses['mission-tab']} */ ;
            /** @type {__VLS_StyleScopedClasses['attack']} */ ;
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            (__VLS_unwrap(missionName, {})('attack'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(expanded.value && !world.value.sendPicker))
                            throw 0;
                        if (!(!isFieldOrder.value && draft.value))
                            throw 0;
                        return (setMission('support'));
                        // @ts-ignore
                        [draft, missionName,];
                    } },
                type: "button",
                ...{ class: "mission-tab support" },
                ...{ class: ({ active: draft.value.mission === 'support' }) },
            });
            /** @type {__VLS_StyleScopedClasses['mission-tab']} */ ;
            /** @type {__VLS_StyleScopedClasses['support']} */ ;
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            (__VLS_unwrap(missionName, {})('support'));
            if (draft.value.mission === 'hunt') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    type: "button",
                    ...{ class: "mission-tab attack active" },
                });
                /** @type {__VLS_StyleScopedClasses['mission-tab']} */ ;
                /** @type {__VLS_StyleScopedClasses['attack']} */ ;
                /** @type {__VLS_StyleScopedClasses['active']} */ ;
                (__VLS_unwrap(missionName, {})('hunt'));
            }
            if (draft.value.mission === 'hunt') {
                const __VLS_5 = HuntTargetSummary;
                // @ts-ignore
                const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
                    // @ts-ignore
                    target: (draft.value.targetCamp), unitCounts: (draft.value.unitCounts),
                }));
                const __VLS_7 = __VLS_6({
                    target: (draft.value.targetCamp),
                    unitCounts: (draft.value.unitCounts),
                }, ...__VLS_functionalComponentArgsRest(__VLS_6));
            }
            else if (draft.value.mission !== 'move') {
                if (selectedTarget.value) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "target-selected" },
                    });
                    /** @type {__VLS_StyleScopedClasses['target-selected']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (__VLS_unwrap(t, {})('hud.armyPanel.target'));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                    (selectedTarget.value.name);
                    (selectedTarget.value.ownerName);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (clearTarget) },
                        type: "button",
                        ...{ class: "secondary change-target" },
                    });
                    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                    /** @type {__VLS_StyleScopedClasses['change-target']} */ ;
                    (__VLS_unwrap(t, {})('hud.armyPanel.change'));
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "target-picker" },
                    });
                    /** @type {__VLS_StyleScopedClasses['target-picker']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                        value: (__VLS_unwrap(targetSearch, {})),
                        type: "text",
                        ...{ class: "target-search" },
                        placeholder: (__VLS_unwrap(t, {})('hud.armyPanel.searchSettlements', { mission: draft.value.mission })),
                    });
                    /** @type {__VLS_StyleScopedClasses['target-search']} */ ;
                    if (attackTargets.value.length) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "target-list" },
                        });
                        /** @type {__VLS_StyleScopedClasses['target-list']} */ ;
                        const __VLS_10 = __VLS_tryAsConstant((attackTargets.value));
                        for (const [target] of __VLS_vFor(__VLS_nonNull(__VLS_10))) {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                                ...{ onClick: (...[$event]) => {
                                        void $event;
                                        if (!(expanded.value && !world.value.sendPicker))
                                            throw 0;
                                        if (!(!isFieldOrder.value && draft.value))
                                            throw 0;
                                        if (!!(draft.value.mission === 'hunt'))
                                            throw 0;
                                        if (!(draft.value.mission !== 'move'))
                                            throw 0;
                                        if (!!(selectedTarget.value))
                                            throw 0;
                                        if (!(attackTargets.value.length))
                                            throw 0;
                                        return (pickTarget(target.id));
                                        // @ts-ignore
                                        [t, t, t, draft, draft, draft, draft, draft, draft, draft, missionName, missionName, selectedTarget, selectedTarget, selectedTarget, targetSearch, attackTargets, attackTargets,];
                                    } },
                                key: (target.id),
                                type: "button",
                                ...{ class: "target-row" },
                            });
                            /** @type {__VLS_StyleScopedClasses['target-row']} */ ;
                            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                ...{ class: "target-name" },
                            });
                            /** @type {__VLS_StyleScopedClasses['target-name']} */ ;
                            (target.name);
                            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                ...{ class: "target-owner" },
                            });
                            /** @type {__VLS_StyleScopedClasses['target-owner']} */ ;
                            (target.ownerName);
                            // @ts-ignore
                            [];
                        }
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                            ...{ class: "status-subtext" },
                        });
                        /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                        (__VLS_unwrap(t, {})('hud.armyPanel.noSettlementsFound'));
                    }
                }
                const __VLS_11 = DispatchTargetBuildingPicker;
                // @ts-ignore
                const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
                    // @ts-ignore
                    hasTarget: (!!selectedTarget.value),
                }));
                const __VLS_13 = __VLS_12({
                    hasTarget: (!!selectedTarget.value),
                }, ...__VLS_functionalComponentArgsRest(__VLS_12));
            }
            if (routeRows.value.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "waypoint-list" },
                });
                /** @type {__VLS_StyleScopedClasses['waypoint-list']} */ ;
                const __VLS_16 = __VLS_tryAsConstant((routeRows.value));
                for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_16))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        key: (row.index),
                        ...{ class: "waypoint-row" },
                    });
                    /** @type {__VLS_StyleScopedClasses['waypoint-row']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "waypoint-label" },
                    });
                    /** @type {__VLS_StyleScopedClasses['waypoint-label']} */ ;
                    (row.label);
                    if (row.isDestination) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "waypoint-tag" },
                        });
                        /** @type {__VLS_StyleScopedClasses['waypoint-tag']} */ ;
                        (__VLS_unwrap(t, {})('hud.armyPanel.destinationTag'));
                    }
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!(expanded.value && !world.value.sendPicker))
                                    throw 0;
                                if (!(!isFieldOrder.value && draft.value))
                                    throw 0;
                                if (!(routeRows.value.length))
                                    throw 0;
                                return (world.value.removeWaypoint(row.index));
                                // @ts-ignore
                                [world, t, t, selectedTarget, routeRows, routeRows,];
                            } },
                        type: "button",
                        ...{ class: "waypoint-remove" },
                        'aria-label': (__VLS_unwrap(t, {})('hud.armyPanel.removeWaypoint', { n: row.index + 1 })),
                    });
                    /** @type {__VLS_StyleScopedClasses['waypoint-remove']} */ ;
                    // @ts-ignore
                    [t,];
                }
            }
            if (hasLockedOutUnits.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "status-subtext fleet-note" },
                });
                /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                /** @type {__VLS_StyleScopedClasses['fleet-note']} */ ;
                (__VLS_unwrap(t, {})('hud.armyPanel.huntLandOnlyNote'));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "unit-steppers" },
            });
            /** @type {__VLS_StyleScopedClasses['unit-steppers']} */ ;
            const __VLS_17 = __VLS_tryAsConstant((garrisonRows.value));
            for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_17))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (row.unit),
                    ...{ class: "unit-stepper-row" },
                    ...{ class: ({ 'is-locked-out': !__VLS_unwrap(isRowSelectable, {})(row.unit) }) },
                });
                /** @type {__VLS_StyleScopedClasses['unit-stepper-row']} */ ;
                /** @type {__VLS_StyleScopedClasses['is-locked-out']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "unit-stepper-name" },
                });
                /** @type {__VLS_StyleScopedClasses['unit-stepper-name']} */ ;
                (row.label);
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "unit-stepper-controls" },
                });
                /** @type {__VLS_StyleScopedClasses['unit-stepper-controls']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(expanded.value && !world.value.sendPicker))
                                throw 0;
                            if (!(!isFieldOrder.value && draft.value))
                                throw 0;
                            return (decrement(row.unit, row.available));
                            // @ts-ignore
                            [t, hasLockedOutUnits, garrisonRows, isRowSelectable,];
                        } },
                    type: "button",
                    ...{ class: "stepper-btn" },
                    disabled: (!__VLS_unwrap(isRowSelectable, {})(row.unit) || quantityFor(row.unit) === 0),
                });
                /** @type {__VLS_StyleScopedClasses['stepper-btn']} */ ;
                (__VLS_unwrap(t, {})('hud.dispatchSheet.decrement'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "stepper-count" },
                });
                /** @type {__VLS_StyleScopedClasses['stepper-count']} */ ;
                (quantityFor(row.unit));
                (row.available);
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(expanded.value && !world.value.sendPicker))
                                throw 0;
                            if (!(!isFieldOrder.value && draft.value))
                                throw 0;
                            return (increment(row.unit, row.available));
                            // @ts-ignore
                            [t, isRowSelectable,];
                        } },
                    type: "button",
                    ...{ class: "stepper-btn" },
                    disabled: (!__VLS_unwrap(isRowSelectable, {})(row.unit) || quantityFor(row.unit) >= row.available),
                });
                /** @type {__VLS_StyleScopedClasses['stepper-btn']} */ ;
                (__VLS_unwrap(t, {})('hud.dispatchSheet.increment'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(expanded.value && !world.value.sendPicker))
                                throw 0;
                            if (!(!isFieldOrder.value && draft.value))
                                throw 0;
                            return (setAll(row.unit, row.available));
                            // @ts-ignore
                            [t, isRowSelectable,];
                        } },
                    type: "button",
                    ...{ class: "stepper-all" },
                    disabled: (!__VLS_unwrap(isRowSelectable, {})(row.unit)),
                });
                /** @type {__VLS_StyleScopedClasses['stepper-all']} */ ;
                (__VLS_unwrap(t, {})('hud.dispatchSheet.allButton'));
                // @ts-ignore
                [t, isRowSelectable,];
            }
            if (!garrisonRows.value.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "status-subtext" },
                });
                /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                (__VLS_unwrap(t, {})('hud.armyPanel.noUnitsAvailable'));
            }
            const __VLS_18 = DispatchSlots;
            // @ts-ignore
            const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
                // @ts-ignore
                unitCounts: (draft.value.unitCounts),
            }));
            const __VLS_20 = __VLS_19({
                unitCounts: (draft.value.unitCounts),
            }, ...__VLS_functionalComponentArgsRest(__VLS_19));
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                ...{ class: "provisions-field" },
            });
            /** @type {__VLS_StyleScopedClasses['provisions-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_unwrap(t, {})('hud.armyPanel.provisions'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: (...[$event]) => {
                        void $event;
                        if (!(expanded.value && !world.value.sendPicker))
                            throw 0;
                        if (!(!isFieldOrder.value && draft.value))
                            throw 0;
                        return (world.value.setDispatchProvisions(Number($event.target.value)));
                        // @ts-ignore
                        [world, t, t, draft, garrisonRows,];
                    } },
                type: "number",
                min: "0",
                value: (draft.value.provisions),
            });
        }
        else if (isFieldOrder.value && fieldDraft.value) {
            if (!auth.value.isPremium) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "status-subtext waypoint-hint" },
                });
                /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                /** @type {__VLS_StyleScopedClasses['waypoint-hint']} */ ;
                (__VLS_unwrap(t, {})('hud.armyPanel.freeAccountWaypoints'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                (__VLS_unwrap(t, {})('hud.armyPanel.premium'));
                (__VLS_unwrap(t, {})('hud.armyPanel.premiumWaypointsNeeded'));
            }
            if (fieldOrderRouteRows.value.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "waypoint-list" },
                });
                /** @type {__VLS_StyleScopedClasses['waypoint-list']} */ ;
                const __VLS_23 = __VLS_tryAsConstant((fieldOrderRouteRows.value));
                for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_23))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        key: (row.index),
                        ...{ class: "waypoint-row" },
                    });
                    /** @type {__VLS_StyleScopedClasses['waypoint-row']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "waypoint-label" },
                    });
                    /** @type {__VLS_StyleScopedClasses['waypoint-label']} */ ;
                    (row.label);
                    if (row.isDestination) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "waypoint-tag" },
                        });
                        /** @type {__VLS_StyleScopedClasses['waypoint-tag']} */ ;
                        (__VLS_unwrap(t, {})('hud.armyPanel.destinationTag'));
                    }
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!(expanded.value && !world.value.sendPicker))
                                    throw 0;
                                if (!!(!isFieldOrder.value && draft.value))
                                    throw 0;
                                if (!(isFieldOrder.value && fieldDraft.value))
                                    throw 0;
                                if (!(fieldOrderRouteRows.value.length))
                                    throw 0;
                                return (world.value.removeFieldOrderWaypoint(row.index));
                                // @ts-ignore
                                [world, t, t, t, t, isFieldOrder, draft, fieldDraft, auth, fieldOrderRouteRows, fieldOrderRouteRows,];
                            } },
                        type: "button",
                        ...{ class: "waypoint-remove" },
                        'aria-label': (__VLS_unwrap(t, {})('hud.armyPanel.removeWaypoint', { n: row.index + 1 })),
                    });
                    /** @type {__VLS_StyleScopedClasses['waypoint-remove']} */ ;
                    // @ts-ignore
                    [t,];
                }
            }
        }
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
