/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Issue #40 phase 2: dispatching an army (move mission only) and tracking
// armies already on the road. Deliberately separate from
// TrainingQueuePanel.vue's garrison list: that panel shows "who's standing
// at home" (Settlement.Garrison — never an Army record, see stores/world.ts's
// `armies` comment), this one is specifically about dispatched bodies
// (in transit / returning / supporting) plus the flow for creating a new one.
//
// Bottom-right HUD corner: BuildQueuePanel is top-left, TrainingQueuePanel
// top-right (see each panel's own `position: absolute` in their <style>) —
// bottom-left is open since RealmPanel's removal (zoom now drives
// settlement<->world switching, so its manual override button is gone).
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useAuthStore } from '../../stores/auth';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { DEMO_MODE } from '../../config';
import { missionName, unitName } from '../../i18n/catalogueNames';
import { maxAffordableProvisions, } from '../../lib/units/armyDispatch';
import { useDispatchTargetBuilding } from '../../composables/useDispatchTargetBuilding';
import HuntTargetSummary from './HuntTargetSummary.vue';
import DispatchSlots from './DispatchSlots.vue';
import { useDispatchUnitPicker } from '../../composables/useDispatchUnitPicker';
import { useArmyRows } from '../../composables/useArmyRows';
const { defineEmits, } = {};
const emit = defineEmits();
const world = useWorldStore();
const auth = useAuthStore();
const catalogue = useUnitCatalogueStore();
const { t } = useI18n({ useScope: 'global' });
onMounted(() => {
    void catalogue.load();
});
const draft = computed(() => world.dispatchDraft);
// Only garrison units can be sent — the wire-name -> count map the quantity
// inputs below read/write against, filtered to what's actually standing here.
const garrisonRows = computed(() => world.hud.garrison
    .filter((g) => g.count > 0)
    .map((g) => ({ unit: g.unit, label: unitName(g.unit), available: g.count })));
const picker = useDispatchUnitPicker(garrisonRows);
const { isRowSelectable, hasLockedOutUnits } = picker;
function quantityFor(unit) {
    return draft.value?.unitCounts[unit] ?? 0;
}
function setQuantity(unit, value, max) {
    const n = Math.floor(Number(value));
    const clamped = Number.isFinite(n) ? Math.max(0, Math.min(n, max)) : 0;
    world.setDispatchUnitCount(unit, clamped);
    // Re-propose a default provisions amount whenever the selection changes,
    // rather than leaving whatever was typed before a unit count changed the
    // carry capacity out from under it — the player can still edit it after.
    if (draft.value) {
        // Issue #158: provisions come out of `available`, not raw stock — food
        // reserved for the waiting build queue is not free to load onto an army.
        world.setDispatchProvisions(maxAffordableProvisions(draft.value.unitCounts, catalogue.byType, world.hud.available.food));
    }
}
const routeLength = computed(() => draft.value?.route.length ?? 0);
// Issue #93: the plotted route as an editable list. "Undo waypoint" can only
// ever pop the newest one, so a mis-clicked hex in the middle of a route
// previously meant clearing everything after it and re-plotting; this (plus
// dragging the pin on the map itself) makes any waypoint editable in place.
const routeRows = computed(() => (draft.value?.route ?? []).map((c, i) => ({
    index: i,
    label: `${i + 1}. (${c.q}, ${c.r})`,
    isDestination: draft.value?.mission === 'move' && i === (draft.value?.route.length ?? 0) - 1,
})));
const hasUnitsSelected = computed(() => !!draft.value && Object.values(draft.value.unitCounts).some((c) => c > 0));
// A move dispatch needs a plotted route (the last click is the destination);
// an attack/support dispatch needs a target settlement instead — a route is
// optional waypoints along the way (see buildAttackDispatchRequest's own
// comment; buildSupportDispatchRequest mirrors it exactly).
const hasDestination = computed(() => draft.value?.mission === 'attack' || draft.value?.mission === 'support'
    ? !!draft.value.targetSettlementId
    : draft.value?.mission === 'hunt'
        ? !!draft.value.targetCamp
        : routeLength.value > 0);
const canConfirm = computed(() => hasUnitsSelected.value && hasDestination.value && picker.selectionSendable.value && !buildingPicker.isMissingRequiredPick.value && !draft.value?.submitting);
function beginDispatch() {
    world.startDispatch();
}
function setMission(mission) {
    world.setDispatchMission(mission);
}
// Target-settlement picker for an Attack/Support dispatch: a searchable list
// rather than a world-map click — see the PR notes for why (WorldMapCanvas's
// hex-click only carries a coordinate, not a settlement id, and teaching the
// renderer a "pick a settlement" selection mode would be a bigger change
// than reusing the settlement list `refreshWorldSettlements` already
// maintains client-side). Support needs a target settlement just like Attack
// does (issue #40 phase 4) — same list, same search box.
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
// Catapult target-building picker (issue #40 phase 5): only worth showing
// once a target settlement is chosen *and* the selection actually includes a
// Catapult — a catapult-free attack does no siege damage regardless of what's
// requested (see `hasSiegeEngineSelected`'s own comment), so there is nothing
// for a preference to apply to. `GET /api/v1/settlements/{id}` carries no
// ownership check (confirmed from SettlementEndpoints.cs — see the PR notes),
// so the enemy's real layout can be fetched and offered as specific hexes to
// pick from, rather than falling back to a mere building-type preference.
const buildingPicker = useDispatchTargetBuilding(computed(() => !!selectedTarget.value));
async function confirm() {
    await world.confirmDispatch();
}
// Armies already dispatched — never AtHome persistently (see stores/world.ts).
// A Supporting army's row (issue #40 phase 4, "armies abroad") shows
// "Supporting <settlement name>" rather than the bare status, and still
// offers Recall — same button, same endpoint, just no active Movement to
// gate it on (see world.model.getSettlement for the name lookup). The row
// derivation itself lives in useArmyRows (issue: mobile army dispatch),
// shared with QueueDrawer's Armies section.
const armyRows = useArmyRows();
function toggleSelect(armyId) {
    if (world.selectedArmyId === armyId) {
        world.clearSelectedArmy();
    }
    else {
        world.selectArmy(armyId);
    }
}
const recallingId = ref(null);
const recalling = computed(() => (id) => recallingId.value === id);
async function recall(armyId) {
    recallingId.value = armyId;
    try {
        await world.recallArmyLive(armyId);
    }
    finally {
        recallingId.value = null;
    }
}
// Issue #156 phase 1: field-order composing — a separate, lighter draft from
// the dispatch one above (no unit picker, just a plotted route against an
// already-existing armyId). See stores/world.ts's `fieldOrderDraft` comment
// for why this shares the same click-to-plot canvas rather than reusing
// `dispatchDraft` outright.
const fieldDraft = computed(() => world.fieldOrderDraft);
const fieldOrderRouteLength = computed(() => fieldDraft.value?.route.length ?? 0);
const fieldOrderRouteRows = computed(() => (fieldDraft.value?.route ?? []).map((c, i) => ({
    index: i,
    label: `${i + 1}. (${c.q}, ${c.r})`,
    isDestination: i === (fieldDraft.value?.route.length ?? 0) - 1,
})));
function beginFieldOrder(armyId) {
    world.startFieldOrder(armyId);
}
async function confirmFieldOrderClick() {
    await world.confirmFieldOrder();
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(armyRows, {});
    __VLS_withDotValue(DEMO_MODE, {});
    __VLS_withDotValue(draft, {});
    __VLS_withDotValue(fieldDraft, {});
    __VLS_withDotValue(garrisonRows, {});
    __VLS_withDotValue(auth, {});
    __VLS_withDotValue(fieldOrderRouteRows, {});
    __VLS_withDotValue(world, {});
    __VLS_withDotValue(fieldOrderRouteLength, {});
    __VLS_withDotValue(selectedTarget, {});
    __VLS_withDotValue(attackTargets, {});
    __VLS_withDotValue(buildingPicker, {});
    __VLS_withDotValue(routeRows, {});
    __VLS_withDotValue(hasLockedOutUnits, {});
    __VLS_withDotValue(routeLength, {});
    __VLS_withDotValue(canConfirm, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['army-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['recall']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
    /** @type {__VLS_StyleScopedClasses['mission-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['mission-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    /** @type {__VLS_StyleScopedClasses['mission-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    /** @type {__VLS_StyleScopedClasses['target-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['target-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['waypoint-remove']} */ ;
    /** @type {__VLS_StyleScopedClasses['unit-picker-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['provisions-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['dispatch-actions']} */ ;
    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
    /** @type {__VLS_StyleScopedClasses['dispatch-actions']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "status-card army-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['status-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['army-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "status-card-header" },
    });
    /** @type {__VLS_StyleScopedClasses['status-card-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "status-card-title" },
    });
    /** @type {__VLS_StyleScopedClasses['status-card-title']} */ ;
    (__VLS_unwrap(t, {})('hud.armyPanel.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "status-card-count" },
    });
    /** @type {__VLS_StyleScopedClasses['status-card-count']} */ ;
    (armyRows.value.length);
    if (DEMO_MODE.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status-subtext demo-note" },
        });
        /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
        /** @type {__VLS_StyleScopedClasses['demo-note']} */ ;
        (__VLS_unwrap(t, {})('hud.armyPanel.demoNote'));
    }
    if (!draft.value && !fieldDraft.value) {
        if (armyRows.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "army-list" },
            });
            /** @type {__VLS_StyleScopedClasses['army-list']} */ ;
            const __VLS_0 = __VLS_tryAsConstant((armyRows.value));
            for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(!draft.value && !fieldDraft.value))
                                throw 0;
                            if (!(armyRows.value.length))
                                throw 0;
                            return (toggleSelect(row.id));
                            // @ts-ignore
                            [t, t, armyRows, armyRows, armyRows, DEMO_MODE, draft, fieldDraft,];
                        } },
                    ...{ onDblclick: (...[$event]) => {
                            void $event;
                            if (!(!draft.value && !fieldDraft.value))
                                throw 0;
                            if (!(armyRows.value.length))
                                throw 0;
                            return (__VLS_unwrap(emit, {})('focus-army', row.id));
                            // @ts-ignore
                            [emit,];
                        } },
                    key: (row.id),
                    ...{ class: "status-row army-row" },
                    ...{ class: ({ 'is-selected': row.selected }) },
                });
                /** @type {__VLS_StyleScopedClasses['status-row']} */ ;
                /** @type {__VLS_StyleScopedClasses['army-row']} */ ;
                /** @type {__VLS_StyleScopedClasses['is-selected']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "status-row-top" },
                });
                /** @type {__VLS_StyleScopedClasses['status-row-top']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "status-row-name" },
                });
                /** @type {__VLS_StyleScopedClasses['status-row-name']} */ ;
                (row.composition);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "status-row-time" },
                });
                /** @type {__VLS_StyleScopedClasses['status-row-time']} */ ;
                (row.eta ?? '—');
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "status-subtext" },
                });
                /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                (row.status);
                if (row.mission) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "mission-tag" },
                    });
                    /** @type {__VLS_StyleScopedClasses['mission-tag']} */ ;
                    (row.mission);
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "army-row-actions" },
                });
                /** @type {__VLS_StyleScopedClasses['army-row-actions']} */ ;
                if (row.canFieldOrder) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!(!draft.value && !fieldDraft.value))
                                    throw 0;
                                if (!(armyRows.value.length))
                                    throw 0;
                                if (!(row.canFieldOrder))
                                    throw 0;
                                return (beginFieldOrder(row.id));
                                // @ts-ignore
                                [];
                            } },
                        ...{ class: "secondary field-order" },
                        disabled: (row.fieldOrderLocked),
                        title: (row.fieldOrderLocked ? __VLS_unwrap(t, {})('hud.armyPanel.premiumRedirectTitle') : undefined),
                    });
                    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                    /** @type {__VLS_StyleScopedClasses['field-order']} */ ;
                    if (row.fieldOrderLocked) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            'aria-hidden': "true",
                        });
                    }
                    (row.fieldOrderLabel);
                }
                if (row.canRecall) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!(!draft.value && !fieldDraft.value))
                                    throw 0;
                                if (!(armyRows.value.length))
                                    throw 0;
                                if (!(row.canRecall))
                                    throw 0;
                                return (recall(row.id));
                                // @ts-ignore
                                [t,];
                            } },
                        ...{ class: "recall" },
                        disabled: (__VLS_unwrap(recalling, {})(row.id)),
                    });
                    /** @type {__VLS_StyleScopedClasses['recall']} */ ;
                    (__VLS_unwrap(recalling, {})(row.id) ? __VLS_unwrap(t, {})('hud.armyPanel.recalling') : __VLS_unwrap(t, {})('hud.armyPanel.recall'));
                }
                // @ts-ignore
                [t, t, recalling, recalling,];
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "status-subtext garrison-empty" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['garrison-empty']} */ ;
            (__VLS_unwrap(t, {})('hud.armyPanel.noArmies'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (beginDispatch) },
            ...{ class: "primary dispatch-btn" },
            disabled: (DEMO_MODE.value || garrisonRows.value.length === 0),
        });
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        /** @type {__VLS_StyleScopedClasses['dispatch-btn']} */ ;
        (__VLS_unwrap(t, {})('hud.armyPanel.dispatchArmy'));
    }
    else if (fieldDraft.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "dispatch-form" },
        });
        /** @type {__VLS_StyleScopedClasses['dispatch-form']} */ ;
        if (fieldDraft.value.error) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "status-subtext error-note" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['error-note']} */ ;
            (fieldDraft.value.error);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status-subtext instructions" },
        });
        /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
        /** @type {__VLS_StyleScopedClasses['instructions']} */ ;
        (__VLS_unwrap(t, {})('hud.armyPanel.fieldOrderInstructions', {
            count: fieldOrderRouteLength.value,
            hexWord: __VLS_unwrap(t, {})('hud.armyPanel.hexWord', fieldOrderRouteLength.value),
        }));
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
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "status-subtext waypoint-hint" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['waypoint-hint']} */ ;
            (__VLS_unwrap(t, {})('hud.armyPanel.dragPinHint'));
            const __VLS_1 = __VLS_tryAsConstant((fieldOrderRouteRows.value));
            for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
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
                            if (!!(!draft.value && !fieldDraft.value))
                                throw 0;
                            if (!(fieldDraft.value))
                                throw 0;
                            if (!(fieldOrderRouteRows.value.length))
                                throw 0;
                            return (world.value.removeFieldOrderWaypoint(row.index));
                            // @ts-ignore
                            [t, t, t, t, t, t, t, t, t, DEMO_MODE, fieldDraft, fieldDraft, fieldDraft, garrisonRows, fieldOrderRouteLength, fieldOrderRouteLength, auth, fieldOrderRouteRows, fieldOrderRouteRows, world,];
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
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "dispatch-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['dispatch-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(!draft.value && !fieldDraft.value))
                        throw 0;
                    if (!(fieldDraft.value))
                        throw 0;
                    return (world.value.removeLastFieldOrderWaypoint());
                    // @ts-ignore
                    [world,];
                } },
            ...{ class: "secondary" },
            disabled: (fieldOrderRouteLength.value === 0),
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_unwrap(t, {})('hud.armyPanel.undoWaypoint'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(!draft.value && !fieldDraft.value))
                        throw 0;
                    if (!(fieldDraft.value))
                        throw 0;
                    return (world.value.clearFieldOrderWaypoints());
                    // @ts-ignore
                    [t, fieldOrderRouteLength, world,];
                } },
            ...{ class: "secondary" },
            disabled: (fieldOrderRouteLength.value === 0),
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_unwrap(t, {})('hud.armyPanel.clearRoute'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "dispatch-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['dispatch-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(!draft.value && !fieldDraft.value))
                        throw 0;
                    if (!(fieldDraft.value))
                        throw 0;
                    return (world.value.cancelFieldOrder());
                    // @ts-ignore
                    [t, fieldOrderRouteLength, world,];
                } },
            ...{ class: "secondary" },
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_unwrap(t, {})('hud.armyPanel.cancel'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (confirmFieldOrderClick) },
            ...{ class: "primary" },
            disabled: (fieldOrderRouteLength.value === 0 || fieldDraft.value.submitting),
        });
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        (fieldDraft.value.submitting ? __VLS_unwrap(t, {})('hud.armyPanel.sending') : __VLS_unwrap(t, {})('hud.armyPanel.confirmOrder'));
    }
    else if (draft.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "dispatch-form" },
        });
        /** @type {__VLS_StyleScopedClasses['dispatch-form']} */ ;
        if (draft.value.error) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "status-subtext error-note" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['error-note']} */ ;
            (draft.value.error);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "mission-tabs" },
        });
        /** @type {__VLS_StyleScopedClasses['mission-tabs']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(!draft.value && !fieldDraft.value))
                        throw 0;
                    if (!!(fieldDraft.value))
                        throw 0;
                    if (!(draft.value))
                        throw 0;
                    return (setMission('move'));
                    // @ts-ignore
                    [t, t, t, draft, draft, draft, fieldDraft, fieldDraft, fieldOrderRouteLength,];
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
                    if (!!(!draft.value && !fieldDraft.value))
                        throw 0;
                    if (!!(fieldDraft.value))
                        throw 0;
                    if (!(draft.value))
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
                    if (!!(!draft.value && !fieldDraft.value))
                        throw 0;
                    if (!!(fieldDraft.value))
                        throw 0;
                    if (!(draft.value))
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
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "status-subtext instructions" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['instructions']} */ ;
            (__VLS_unwrap(t, {})('hud.huntTarget.instructions', { count: routeLength.value, waypointWord: __VLS_unwrap(t, {})('hud.armyPanel.waypointWord', routeLength.value) }));
            const __VLS_2 = HuntTargetSummary;
            // @ts-ignore
            const __VLS_3 = __VLS_asFunctionalComponent1(__VLS_2, new __VLS_2({
                // @ts-ignore
                target: (draft.value.targetCamp), unitCounts: (draft.value.unitCounts),
            }));
            const __VLS_4 = __VLS_3({
                target: (draft.value.targetCamp),
                unitCounts: (draft.value.unitCounts),
            }, ...__VLS_functionalComponentArgsRest(__VLS_3));
        }
        else if (draft.value.mission === 'move') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "status-subtext instructions" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['instructions']} */ ;
            (__VLS_unwrap(t, {})('hud.armyPanel.dispatchInstructions', {
                count: routeLength.value,
                hexWord: __VLS_unwrap(t, {})('hud.armyPanel.hexWord', routeLength.value),
            }));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "status-subtext instructions" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['instructions']} */ ;
            (__VLS_unwrap(t, {})('hud.armyPanel.targetInstructions', {
                mission: draft.value.mission,
                count: routeLength.value,
                waypointWord: __VLS_unwrap(t, {})('hud.armyPanel.waypointWord', routeLength.value),
            }));
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
                    const __VLS_7 = __VLS_tryAsConstant((attackTargets.value));
                    for (const [target] of __VLS_vFor(__VLS_nonNull(__VLS_7))) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    void $event;
                                    if (!!(!draft.value && !fieldDraft.value))
                                        throw 0;
                                    if (!!(fieldDraft.value))
                                        throw 0;
                                    if (!(draft.value))
                                        throw 0;
                                    if (!!(draft.value.mission === 'hunt'))
                                        throw 0;
                                    if (!!(draft.value.mission === 'move'))
                                        throw 0;
                                    if (!!(selectedTarget.value))
                                        throw 0;
                                    if (!(attackTargets.value.length))
                                        throw 0;
                                    return (pickTarget(target.id));
                                    // @ts-ignore
                                    [t, t, t, t, t, t, t, t, t, draft, draft, draft, draft, draft, draft, draft, draft, missionName, missionName, routeLength, routeLength, routeLength, routeLength, routeLength, routeLength, selectedTarget, selectedTarget, selectedTarget, targetSearch, attackTargets, attackTargets,];
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
            if (draft.value.mission === 'support') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "status-subtext support-note" },
                });
                /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                /** @type {__VLS_StyleScopedClasses['support-note']} */ ;
                (__VLS_unwrap(t, {})('hud.armyPanel.supportNote'));
            }
            if (buildingPicker.value.showPicker.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "building-picker" },
                });
                /** @type {__VLS_StyleScopedClasses['building-picker']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "status-subtext building-picker-hint" },
                });
                /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                /** @type {__VLS_StyleScopedClasses['building-picker-hint']} */ ;
                (__VLS_unwrap(t, {})(buildingPicker.value.isRequired.value ? 'hud.armyPanel.fleetBuildingPickerHint' : 'hud.armyPanel.buildingPickerHint'));
                if (!buildingPicker.value.isRequired.value) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                        ...{ class: "status-subtext" },
                        'data-testid': "engine-reach",
                    });
                    /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                    (__VLS_unwrap(t, {})('hud.armyPanel.engineReach'));
                }
                if (buildingPicker.value.selectedLabel.value) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "target-selected" },
                    });
                    /** @type {__VLS_StyleScopedClasses['target-selected']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                    (__VLS_unwrap(t, {})('hud.armyPanel.target'));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                    (buildingPicker.value.selectedLabel.value);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (buildingPicker.value.clear) },
                        type: "button",
                        ...{ class: "secondary change-target" },
                    });
                    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                    /** @type {__VLS_StyleScopedClasses['change-target']} */ ;
                    (__VLS_unwrap(t, {})('hud.armyPanel.clear'));
                }
                if (buildingPicker.value.selectedUnreachable.value) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                        ...{ class: "status-subtext" },
                        'data-testid': "target-unreachable",
                    });
                    /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                    (__VLS_unwrap(t, {})('hud.armyPanel.cannotDamage'));
                }
                else {
                    if (world.value.dispatchTargetBuildingsLoading) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                            ...{ class: "status-subtext" },
                        });
                        /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                        (__VLS_unwrap(t, {})('hud.armyPanel.loadingEnemyLayout'));
                    }
                    else if (world.value.dispatchTargetBuildingsError) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                            ...{ class: "status-subtext" },
                        });
                        /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                        (__VLS_unwrap(t, {})(buildingPicker.value.isRequired.value ? 'hud.armyPanel.fleetLayoutLoadError' : 'hud.armyPanel.layoutLoadError'));
                    }
                    else if (buildingPicker.value.rows.value.length) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "target-list building-list" },
                        });
                        /** @type {__VLS_StyleScopedClasses['target-list']} */ ;
                        /** @type {__VLS_StyleScopedClasses['building-list']} */ ;
                        const __VLS_8 = __VLS_tryAsConstant((buildingPicker.value.rows.value));
                        for (const [b] of __VLS_vFor(__VLS_nonNull(__VLS_8))) {
                            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                                ...{ onClick: (...[$event]) => {
                                        void $event;
                                        if (!!(!draft.value && !fieldDraft.value))
                                            throw 0;
                                        if (!!(fieldDraft.value))
                                            throw 0;
                                        if (!(draft.value))
                                            throw 0;
                                        if (!!(draft.value.mission === 'hunt'))
                                            throw 0;
                                        if (!!(draft.value.mission === 'move'))
                                            throw 0;
                                        if (!(buildingPicker.value.showPicker.value))
                                            throw 0;
                                        if (!!(buildingPicker.value.selectedUnreachable.value))
                                            throw 0;
                                        if (!!(world.value.dispatchTargetBuildingsLoading))
                                            throw 0;
                                        if (!!(world.value.dispatchTargetBuildingsError))
                                            throw 0;
                                        if (!(buildingPicker.value.rows.value.length))
                                            throw 0;
                                        return (buildingPicker.value.pick(b.q, b.r));
                                        // @ts-ignore
                                        [t, t, t, t, t, t, t, t, t, draft, world, world, buildingPicker, buildingPicker, buildingPicker, buildingPicker, buildingPicker, buildingPicker, buildingPicker, buildingPicker, buildingPicker, buildingPicker, buildingPicker,];
                                    } },
                                key: (`${b.q},${b.r}`),
                                type: "button",
                                ...{ class: "target-row" },
                                ...{ class: ({ 'out-of-reach': !b.damageable }) },
                                disabled: (!b.damageable),
                                title: (b.damageable ? undefined : __VLS_unwrap(t, {})('hud.armyPanel.cannotDamage')),
                                'data-testid': "building-target",
                            });
                            /** @type {__VLS_StyleScopedClasses['target-row']} */ ;
                            /** @type {__VLS_StyleScopedClasses['out-of-reach']} */ ;
                            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                ...{ class: "target-name" },
                            });
                            /** @type {__VLS_StyleScopedClasses['target-name']} */ ;
                            (b.label);
                            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                                ...{ class: "target-owner" },
                            });
                            /** @type {__VLS_StyleScopedClasses['target-owner']} */ ;
                            (b.damageable ? __VLS_unwrap(t, {})('hud.armyPanel.buildingLevelCoord', { level: b.level, q: b.q, r: b.r }) : __VLS_unwrap(t, {})('hud.armyPanel.cannotDamage'));
                            // @ts-ignore
                            [t, t, t,];
                        }
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                            ...{ class: "status-subtext" },
                        });
                        /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
                        (__VLS_unwrap(t, {})(buildingPicker.value.isRequired.value ? 'hud.armyPanel.fleetNoShoreBuilding' : 'hud.armyPanel.noPreference'));
                    }
                }
            }
        }
        if (routeRows.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "waypoint-list" },
            });
            /** @type {__VLS_StyleScopedClasses['waypoint-list']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "status-subtext waypoint-hint" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            /** @type {__VLS_StyleScopedClasses['waypoint-hint']} */ ;
            (__VLS_unwrap(t, {})('hud.armyPanel.dragPinHint'));
            const __VLS_9 = __VLS_tryAsConstant((routeRows.value));
            for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_9))) {
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
                            if (!!(!draft.value && !fieldDraft.value))
                                throw 0;
                            if (!!(fieldDraft.value))
                                throw 0;
                            if (!(draft.value))
                                throw 0;
                            if (!(routeRows.value.length))
                                throw 0;
                            return (world.value.removeWaypoint(row.index));
                            // @ts-ignore
                            [t, t, t, world, buildingPicker, routeRows, routeRows,];
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
            ...{ class: "unit-picker" },
        });
        /** @type {__VLS_StyleScopedClasses['unit-picker']} */ ;
        const __VLS_10 = __VLS_tryAsConstant((garrisonRows.value));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_10))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (row.unit),
                ...{ class: "unit-picker-row" },
                ...{ class: ({ 'is-locked-out': !__VLS_unwrap(isRowSelectable, {})(row.unit) }) },
            });
            /** @type {__VLS_StyleScopedClasses['unit-picker-row']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-locked-out']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "unit-picker-name" },
            });
            /** @type {__VLS_StyleScopedClasses['unit-picker-name']} */ ;
            (row.label);
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: (...[$event]) => {
                        void $event;
                        if (!!(!draft.value && !fieldDraft.value))
                            throw 0;
                        if (!!(fieldDraft.value))
                            throw 0;
                        if (!(draft.value))
                            throw 0;
                        return (setQuantity(row.unit, $event.target.value, row.available));
                        // @ts-ignore
                        [t, garrisonRows, hasLockedOutUnits, isRowSelectable,];
                    } },
                type: "number",
                min: "0",
                max: (row.available),
                ...{ class: "qty" },
                disabled: (!__VLS_unwrap(isRowSelectable, {})(row.unit)),
                value: (quantityFor(row.unit)),
            });
            /** @type {__VLS_StyleScopedClasses['qty']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "unit-picker-max" },
            });
            /** @type {__VLS_StyleScopedClasses['unit-picker-max']} */ ;
            (row.available);
            // @ts-ignore
            [isRowSelectable,];
        }
        if (!garrisonRows.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "status-subtext" },
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            (__VLS_unwrap(t, {})('hud.armyPanel.noUnitsAvailable'));
        }
        const __VLS_11 = DispatchSlots;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
            // @ts-ignore
            unitCounts: (draft.value.unitCounts),
        }));
        const __VLS_13 = __VLS_12({
            unitCounts: (draft.value.unitCounts),
        }, ...__VLS_functionalComponentArgsRest(__VLS_12));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "provisions-field" },
        });
        /** @type {__VLS_StyleScopedClasses['provisions-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_unwrap(t, {})('hud.armyPanel.provisions'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onInput: (...[$event]) => {
                    void $event;
                    if (!!(!draft.value && !fieldDraft.value))
                        throw 0;
                    if (!!(fieldDraft.value))
                        throw 0;
                    if (!(draft.value))
                        throw 0;
                    return (world.value.setDispatchProvisions(Number($event.target.value)));
                    // @ts-ignore
                    [t, t, draft, garrisonRows, world,];
                } },
            type: "number",
            min: "0",
            value: (draft.value.provisions),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "dispatch-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['dispatch-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(!draft.value && !fieldDraft.value))
                        throw 0;
                    if (!!(fieldDraft.value))
                        throw 0;
                    if (!(draft.value))
                        throw 0;
                    return (world.value.removeLastWaypoint());
                    // @ts-ignore
                    [draft, world,];
                } },
            ...{ class: "secondary" },
            disabled: (routeLength.value === 0),
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_unwrap(t, {})('hud.armyPanel.undoWaypoint'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(!draft.value && !fieldDraft.value))
                        throw 0;
                    if (!!(fieldDraft.value))
                        throw 0;
                    if (!(draft.value))
                        throw 0;
                    return (world.value.clearWaypoints());
                    // @ts-ignore
                    [t, world, routeLength,];
                } },
            ...{ class: "secondary" },
            disabled: (routeLength.value === 0),
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_unwrap(t, {})('hud.armyPanel.clearRoute'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "dispatch-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['dispatch-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(!draft.value && !fieldDraft.value))
                        throw 0;
                    if (!!(fieldDraft.value))
                        throw 0;
                    if (!(draft.value))
                        throw 0;
                    return (world.value.cancelDispatch());
                    // @ts-ignore
                    [t, world, routeLength,];
                } },
            ...{ class: "secondary" },
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_unwrap(t, {})('hud.armyPanel.cancel'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (confirm) },
            ...{ class: "primary" },
            disabled: (!canConfirm.value),
        });
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        (draft.value.submitting ? __VLS_unwrap(t, {})('hud.armyPanel.dispatching') : __VLS_unwrap(t, {})('hud.armyPanel.confirmDispatch'));
    }
    // @ts-ignore
    [t, t, t, draft, canConfirm,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
});
export default {};
