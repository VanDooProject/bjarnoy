/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// A building's training window, opened from the building's ring ('train'
// action) the same way BuildingModal is: training belongs to a building (it
// trains one order at a time, the rest wait behind it), so this lists only the
// units that building type trains, with a quantity picker per unit, rather
// than BuildingModal's single-target cost/duration/action layout. With several
// buildings of the type the order can also be distributed over all of them.
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildingName, unitName } from '../../i18n/catalogueNames';
import { apiErrorMessage } from '../../i18n/apiErrors';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { useAuthStore } from '../../stores/auth';
import { DEMO_MODE } from '../../config';
import { MAX_TRAINING_ORDERS_PER_BUILDING, canAfford, distributedTrainingSeconds, formatCostLine, formatTrainingDuration, isUnitAvailable, totalTrainingCost, trainingBonusPercent, trainingBuildingsOfType, unitTrainingSeconds, } from '../../lib/units/trainingEconomy';
import { hasShorelineInTerritory } from '../../lib/map/shoreline';
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const world = useWorldStore();
const auth = useAuthStore();
const catalogue = useUnitCatalogueStore();
const { t } = useI18n({ useScope: 'global' });
onMounted(() => {
    void catalogue.load();
});
// One quantity input per unit type, defaulting to 1 — keyed by wire type
// name so it survives the catalogue's own array ordering.
const quantities = ref({});
function quantityFor(type) {
    return quantities.value[type] ?? 1;
}
function setQuantity(type, value) {
    const n = Math.floor(Number(value));
    quantities.value[type] = Number.isFinite(n) && n > 0 ? n : 1;
}
const longhouseLevel = computed(() => world.hud.level);
// The settlement's functioning buildings of this type (standing, inside the realm) — what "Distribute" spreads an order over.
const siblings = computed(() => trainingBuildingsOfType(world.hud.buildings, props.building.type));
// With only one such building there is nothing to choose, so no selector is shown.
const canDistribute = computed(() => siblings.value.length > 1);
const mode = ref('here');
const distributeSplit = ref('evenly');
const split = computed(() => (canDistribute.value && mode.value === 'distribute' ? distributeSplit.value : 'here'));
// Fastest splits by time — premium only; shown locked for everyone else (docs/design/premium-gating-ux.md).
const fastestLocked = computed(() => !auth.isPremium);
// How many orders this building already holds (the running one plus those waiting), against its cap.
const ordersHere = computed(() => world.hud.trainingQueue.filter((o) => o.q === props.building.q && o.r === props.building.r).length);
const fullHere = computed(() => split.value === 'here' && ordersHere.value >= MAX_TRAINING_ORDERS_PER_BUILDING);
// Issue #40 phase 6 §4: whether this settlement's own claimed territory
// touches the sea — Ship-class units (Karve, Longship) need it, mirroring
// `Settlement.PlanTrain`'s `hasShoreline` gate (`TrainRejection.SettlementNotCoastal`).
// Computed client-side from the same deterministic terrain the map already
// renders (see `lib/map/shoreline.ts`'s own comment on why that's safe)
// rather than a new backend flag. Checks the settlement's *full* claimed
// territory — the centre disc plus every placed Tower's own satellite disc
// (see `claimDiscs`) — not just the centre disc, since a Tower can reach the
// coast even when the centre disc alone never does; the player's own Tower
// positions/levels are already available via `world.hud.buildings`
// (`PlacedBuildingResponse`, refreshed alongside everything else in
// `refreshLiveSettlement`), so this needs no extra backend field. `null` (no
// settlement selected yet, e.g. demo mode's landing page) reads as "unknown"
// — treated as available below so a Ship row isn't wrongly greyed out before
// there's anything to check against; the Train button still enforces the
// real rule server-side either way.
const isCoastal = computed(() => {
    const settlement = world.selectedSettlementId ? world.model.getSettlement(world.selectedSettlementId) : undefined;
    if (!settlement)
        return null;
    // `model` is markRaw, so the buildings and level are read here only to re-run this when a poll changes them. The discs
    // themselves come from the model: only towers connected to a longhouse claim ground (`WorldModel.claimDiscsOf`).
    void world.hud.buildings;
    void longhouseLevel.value;
    const discs = world.model.claimDiscsOf(settlement.id);
    // Giant-aware, same as `WorldModel`'s own territory painting: a hex that
    // only geometrically overlaps a disc but belongs to a giant whose 7-hex
    // footprint isn't fully covered by these discs must not count toward
    // coastal access either (mirrors `SettlementService.PlanTrainAsync`).
    return hasShorelineInTerritory(discs, world.model, (c) => world.model.giantAnchorAt(c));
});
// Mirrors `Settlement.PlanTrain`'s own `buildingLevelOf` lookup — a
// settlement's level of a given building type, 0 if it has none — so
// `isUnitAvailable` can gate a row on its training building the same way
// the backend gates the actual order (e.g. Thrall needs a standing
// Barracks now, not the longhouse alone).
function buildingLevelOf(buildingType) {
    return world.hud.buildings.find((b) => b.type === buildingType)?.level ?? 0;
}
const rows = computed(() => catalogue.definitions.filter((d) => d.requiredBuildingType === props.building.type).map((definition) => {
    const count = quantityFor(definition.type);
    const cost = totalTrainingCost(definition, count);
    const meetsLevel = longhouseLevel.value >= definition.requiredLonghouseLevel;
    const meetsPrerequisites = isUnitAvailable(definition.type, longhouseLevel.value, catalogue.byType, buildingLevelOf);
    const needsCoast = definition.class === 'ship';
    const coastal = isCoastal.value !== false; // unknown (null) treated as coastal, see isCoastal's comment
    const available = meetsPrerequisites && (!needsCoast || coastal);
    // Issue #158: available (stock minus what the waiting build queue has
    // reserved), not raw stock — a reservation the player could still train
    // troops with would not be a reservation. `hud.available` mirrors
    // `hud.resources` in demo mode (no reservation concept there), so this
    // degrades to the old plain-stock check for free.
    const affordable = canAfford(cost, world.hud.available);
    return {
        definition,
        count,
        cost,
        costText: formatCostLine(cost),
        durationText: formatTrainingDuration(split.value === 'here'
            ? unitTrainingSeconds(definition, props.building.level) * count
            : distributedTrainingSeconds(definition, count, siblings.value.map((b) => b.level), split.value), 1),
        available,
        meetsLevel,
        // Only true once the *other* requirements are already met — no point
        // telling the player "also, no shoreline" on a unit whose longhouse
        // level they haven't reached yet either.
        needsCoastReason: meetsLevel && needsCoast && !coastal,
        affordable,
        // Training only works against the live backend; demo mode has no
        // TrainingOrder/garrison concept in the local WorldModel yet.
        trainable: available && affordable && !DEMO_MODE && !fullHere.value,
    };
}));
const training = ref(null);
const errorText = ref(null);
// Issue #158: a note when something is actually reserved, so a training
// rejection that's really "some of that is spoken for" reads as expected
// rather than a mystery insufficient-resources error.
const reservedTotal = computed(() => {
    const r = world.hud.reserved;
    return r.wood + r.stone + r.food + r.iron;
});
async function train(type, count) {
    errorText.value = null;
    training.value = type;
    try {
        await world.trainUnitsLive(type, count, props.building, split.value);
        emit('trained');
    }
    catch (err) {
        errorText.value = apiErrorMessage(err, t('hud.trainingModal.trainingFailed'));
    }
    finally {
        training.value = null;
    }
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
    __VLS_withDotValue(DEMO_MODE, {});
    __VLS_withDotValue(errorText, {});
    __VLS_withDotValue(reservedTotal, {});
    __VLS_withDotValue(canDistribute, {});
    __VLS_withDotValue(mode, {});
    __VLS_withDotValue(siblings, {});
    __VLS_withDotValue(distributeSplit, {});
    __VLS_withDotValue(fastestLocked, {});
    __VLS_withDotValue(fullHere, {});
    __VLS_withDotValue(training, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    /** @type {__VLS_StyleScopedClasses['close']} */ ;
    /** @type {__VLS_StyleScopedClasses['seg']} */ ;
    /** @type {__VLS_StyleScopedClasses['seg']} */ ;
    /** @type {__VLS_StyleScopedClasses['unit-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['unit-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['unit-cost']} */ ;
    /** @type {__VLS_StyleScopedClasses['unit-action']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (__VLS_unwrap(emit, {})('close'));
                // @ts-ignore
                [emit,];
            } },
        ...{ class: "backdrop" },
    });
    /** @type {__VLS_StyleScopedClasses['backdrop']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal panel" },
    });
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "head" },
    });
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "name" },
    });
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    (__VLS_unwrap(buildingName, {})(__VLS_ctx.building.type));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "sub" },
    });
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    (__VLS_unwrap(t, {})('hud.trainingModal.subtitle', { level: __VLS_ctx.building.level, percent: __VLS_unwrap(trainingBonusPercent, {})(__VLS_ctx.building.level) }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (__VLS_unwrap(emit, {})('close'));
                // @ts-ignore
                [emit, buildingName, building, building, building, t, trainingBonusPercent,];
            } },
        ...{ class: "close" },
    });
    /** @type {__VLS_StyleScopedClasses['close']} */ ;
    (__VLS_unwrap(t, {})('hud.trainingModal.close'));
    if (DEMO_MODE.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "desc demo-note" },
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        /** @type {__VLS_StyleScopedClasses['demo-note']} */ ;
        (__VLS_unwrap(t, {})('hud.trainingModal.demoNote'));
    }
    if (errorText.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "desc error-note" },
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        /** @type {__VLS_StyleScopedClasses['error-note']} */ ;
        (errorText.value);
    }
    if (reservedTotal.value > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "desc reserved-note" },
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        /** @type {__VLS_StyleScopedClasses['reserved-note']} */ ;
        (__VLS_unwrap(t, {})('hud.trainingModal.reservedNote', { amount: reservedTotal.value.toFixed(0) }));
    }
    if (canDistribute.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "selectors" },
        });
        /** @type {__VLS_StyleScopedClasses['selectors']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "selector" },
            role: "group",
            'aria-label': (__VLS_unwrap(t, {})('hud.trainingModal.trainIn')),
        });
        /** @type {__VLS_StyleScopedClasses['selector']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "selector-label" },
        });
        /** @type {__VLS_StyleScopedClasses['selector-label']} */ ;
        (__VLS_unwrap(t, {})('hud.trainingModal.trainIn'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(canDistribute.value))
                        throw 0;
                    return (mode.value = 'here');
                    // @ts-ignore
                    [t, t, t, t, t, DEMO_MODE, errorText, errorText, reservedTotal, reservedTotal, canDistribute, mode,];
                } },
            type: "button",
            ...{ class: "seg" },
            ...{ class: ({ active: mode.value === 'here' }) },
            'aria-pressed': (mode.value === 'here'),
        });
        /** @type {__VLS_StyleScopedClasses['seg']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (__VLS_unwrap(t, {})('hud.trainingModal.thisBuilding'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(canDistribute.value))
                        throw 0;
                    return (mode.value = 'distribute');
                    // @ts-ignore
                    [t, mode, mode, mode,];
                } },
            type: "button",
            ...{ class: "seg" },
            ...{ class: ({ active: mode.value === 'distribute' }) },
            'aria-pressed': (mode.value === 'distribute'),
        });
        /** @type {__VLS_StyleScopedClasses['seg']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (__VLS_unwrap(t, {})('hud.trainingModal.distribute', { count: siblings.value.length }));
        if (mode.value === 'distribute') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "selector" },
                role: "group",
                'aria-label': (__VLS_unwrap(t, {})('hud.trainingModal.splitLabel')),
            });
            /** @type {__VLS_StyleScopedClasses['selector']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "selector-label" },
            });
            /** @type {__VLS_StyleScopedClasses['selector-label']} */ ;
            (__VLS_unwrap(t, {})('hud.trainingModal.splitLabel'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(canDistribute.value))
                            throw 0;
                        if (!(mode.value === 'distribute'))
                            throw 0;
                        return (distributeSplit.value = 'evenly');
                        // @ts-ignore
                        [t, t, t, mode, mode, mode, siblings, distributeSplit,];
                    } },
                type: "button",
                ...{ class: "seg" },
                ...{ class: ({ active: distributeSplit.value === 'evenly' }) },
                'aria-pressed': (distributeSplit.value === 'evenly'),
            });
            /** @type {__VLS_StyleScopedClasses['seg']} */ ;
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            (__VLS_unwrap(t, {})('hud.trainingModal.evenly'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(canDistribute.value))
                            throw 0;
                        if (!(mode.value === 'distribute'))
                            throw 0;
                        return (distributeSplit.value = 'fastest');
                        // @ts-ignore
                        [t, distributeSplit, distributeSplit, distributeSplit,];
                    } },
                type: "button",
                ...{ class: "seg fastest" },
                ...{ class: ({ active: distributeSplit.value === 'fastest' }) },
                'aria-pressed': (distributeSplit.value === 'fastest'),
                disabled: (fastestLocked.value),
            });
            /** @type {__VLS_StyleScopedClasses['seg']} */ ;
            /** @type {__VLS_StyleScopedClasses['fastest']} */ ;
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            if (fastestLocked.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    'aria-hidden': "true",
                });
            }
            (__VLS_unwrap(t, {})('hud.trainingModal.fastest'));
        }
        if (mode.value === 'distribute' && fastestLocked.value) {
            let __VLS_0;
            /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
            i18nT;
            // @ts-ignore
            const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
                // @ts-ignore
                keypath: "hud.trainingModal.fastestPremium", tag: "p", ...{ class: "desc premium-note" },
            }));
            const __VLS_2 = __VLS_1({
                keypath: "hud.trainingModal.fastestPremium",
                tag: "p",
                ...{ class: "desc premium-note" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_1));
            /** @type {__VLS_StyleScopedClasses['desc']} */ ;
            /** @type {__VLS_StyleScopedClasses['premium-note']} */ ;
            var __VLS_3;
            const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
            {
                const { premium: __VLS_6 } = __VLS_nonNull(__VLS_3.slots);
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                (__VLS_unwrap(t, {})('hud.trainingModal.premium'));
                // @ts-ignore
                [t, t, mode, distributeSplit, distributeSplit, fastestLocked, fastestLocked, fastestLocked,];
            }
            // @ts-ignore
            [];
        }
    }
    if (fullHere.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "desc error-note" },
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        /** @type {__VLS_StyleScopedClasses['error-note']} */ ;
        (__VLS_unwrap(t, {})('hud.trainingModal.full', { used: __VLS_unwrap(ordersHere, {}), max: __VLS_unwrap(MAX_TRAINING_ORDERS_PER_BUILDING, {}) }));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "roster" },
    });
    /** @type {__VLS_StyleScopedClasses['roster']} */ ;
    const __VLS_7 = __VLS_tryAsConstant((__VLS_unwrap(rows, {})));
    for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_7))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (row.definition.type),
            ...{ class: "unit-row" },
            ...{ class: ({ unavailable: !row.available }) },
        });
        /** @type {__VLS_StyleScopedClasses['unit-row']} */ ;
        /** @type {__VLS_StyleScopedClasses['unavailable']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "unit-info" },
        });
        /** @type {__VLS_StyleScopedClasses['unit-info']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "unit-name" },
        });
        /** @type {__VLS_StyleScopedClasses['unit-name']} */ ;
        (__VLS_unwrap(unitName, {})(row.definition.type));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "unit-stats" },
        });
        /** @type {__VLS_StyleScopedClasses['unit-stats']} */ ;
        (__VLS_unwrap(t, {})('hud.trainingModal.attackDefense', { attack: row.definition.attack, defense: row.definition.defense }));
        if (row.needsCoastReason) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_unwrap(t, {})('hud.trainingModal.requiresCoastal'));
        }
        else if (!row.meetsLevel) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_unwrap(t, {})('hud.trainingModal.requiresLonghouse', { level: row.definition.requiredLonghouseLevel }));
            if (row.definition.requiredUnitType) {
                (__VLS_unwrap(t, {})('hud.trainingModal.requiresUnit', { unit: __VLS_unwrap(unitName, {})(row.definition.requiredUnitType) }));
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "unit-cost" },
            ...{ class: ({ unaffordable: row.available && !row.affordable }) },
        });
        /** @type {__VLS_StyleScopedClasses['unit-cost']} */ ;
        /** @type {__VLS_StyleScopedClasses['unaffordable']} */ ;
        (row.costText);
        (row.durationText);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "unit-action" },
        });
        /** @type {__VLS_StyleScopedClasses['unit-action']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onInput: (...[$event]) => {
                    void $event;
                    return (setQuantity(row.definition.type, $event.target.value));
                    // @ts-ignore
                    [t, t, t, t, t, fullHere, ordersHere, MAX_TRAINING_ORDERS_PER_BUILDING, rows, unitName, unitName,];
                } },
            type: "number",
            min: "1",
            ...{ class: "qty" },
            disabled: (!row.available),
            value: (row.count),
        });
        /** @type {__VLS_StyleScopedClasses['qty']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (train(row.definition.type, row.count));
                    // @ts-ignore
                    [];
                } },
            ...{ class: "primary" },
            disabled: (!row.trainable || training.value === row.definition.type),
        });
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        (training.value === row.definition.type ? __VLS_unwrap(t, {})('hud.trainingModal.training') : __VLS_unwrap(t, {})('hud.trainingModal.train'));
        // @ts-ignore
        [t, t, training, training,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
