/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The source picker behind the ring's "Send army here" / Attack / Support / Hunt bubbles: lists the home garrison and every army already
// out in the field, home first and then the armies that can go, quickest first; the ones that cannot stay in the list, dimmed, with
// the reason. One component for both surfaces: ArmyPanel.vue on desktop and MobileDispatchSheet.vue on phones. Tapping a row (or the
// army's marker on the map, MapView) selects it: the map frames the target and the armies that can go and draws the route, and the row
// expands to pick the units (a standing army can be split) and send. Home hands over to the dispatch form for the garrison.
// Which sources can go is decided in lib/units/sendSources.ts, the same answer the ring menu used to enable its bubble.
import { computed, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { DEMO_MODE } from '../../config';
import { campName, missionName, unitName } from '../../i18n/catalogueNames';
import { motionEnabled } from '../../lib/motion';
import { isHuntUnit } from '../../lib/units/armyDispatch';
import { stackCounts } from '../../lib/units/fieldOrderFeasibility';
import { useSendBlockText, useSendPickerRows } from '../../composables/useSendSources';
import { useDispatchTargetBuilding } from '../../composables/useDispatchTargetBuilding';
import DispatchTargetBuildingPicker from './DispatchTargetBuildingPicker.vue';
import flagIconUrl from '../../assets/icons/flag.svg?url';
import shipIconUrl from '../../assets/icons/ship.svg?url';
const world = useWorldStore();
const catalogue = useUnitCatalogueStore();
const { t } = useI18n({ useScope: 'global' });
// The home row's icon: a house glyph, no art needed.
const HOME_GLYPH = '\u2302';
const picker = computed(() => world.sendPicker);
const { target, rows, verdictFor } = useSendPickerRows();
const draft = computed(() => world.fieldOrderDraft);
const buildingPicker = useDispatchTargetBuilding(computed(() => !!picker.value?.targetSettlementId));
const targetName = computed(() => {
    const p = picker.value;
    if (!p)
        return '';
    if (p.targetSettlementId)
        return world.model.getSettlement(p.targetSettlementId)?.name ?? '';
    if (p.mission === 'hunt') {
        const camp = world.model.campAt(p.coord);
        if (camp)
            return campName(camp.family);
    }
    return t('hud.sendPicker.hex', { q: p.coord.q, r: p.coord.r });
});
const title = computed(() => t('hud.sendPicker.title', { mission: missionName(picker.value?.mission ?? 'move'), target: targetName.value }));
function countUnits(stacks) {
    return stacks.reduce((sum, s) => sum + Math.max(0, s.count), 0);
}
function unitsLabel(n) {
    return t('hud.sendPicker.units', { count: n }, n);
}
function formatTravel(minutes) {
    return minutes < 60
        ? t('hud.sendPicker.etaMinutes', { minutes })
        : t('hud.sendPicker.etaHours', { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, '0') });
}
const blockText = useSendBlockText();
function reasonFor(source) {
    return blockText(source, target.value);
}
const pickerRows = computed(() => rows.value.map((source) => {
    const army = source.army;
    const home = source.kind === 'home';
    const isFleet = !!army && army.stacks.some((s) => s.count > 0 && catalogue.byType[s.unit]?.class === 'ship');
    const standingAt = army?.movement ? army.movement.path[army.movement.path.length - 1] : army?.position;
    const sub = source.ok
        ? home
            ? t('hud.sendPicker.garrison')
            : t(source.standing ? 'hud.sendPicker.standingAt' : 'hud.sendPicker.marchingTo', { q: standingAt?.q ?? 0, r: standingAt?.r ?? 0 })
        : reasonFor(source);
    return {
        source,
        title: home ? t('hud.sendPicker.home') : unitsLabel(countUnits(army?.stacks ?? [])),
        sub,
        eta: source.travelMinutes !== null && (source.ok || source.locked) ? formatTravel(source.travelMinutes) : null,
        icon: home ? null : isFleet ? shipIconUrl : flagIconUrl,
        selected: picker.value?.selectedId === source.id,
    };
}));
function toggle(row) {
    if (!row.source.ok)
        return;
    if (row.selected) {
        world.selectSendSource(null);
        return;
    }
    world.selectSendSource(row.source.id);
}
const selectedRow = computed(() => pickerRows.value.find((r) => r.selected) ?? null);
const selectedArmy = computed(() => selectedRow.value?.source.army ?? null);
const leaving = computed(() => {
    const army = selectedArmy.value;
    if (!army)
        return {};
    return draft.value?.units ?? stackCounts(army.stacks);
});
const leavingCount = computed(() => Object.values(leaving.value).reduce((sum, c) => sum + Math.max(0, c), 0));
const wholeCount = computed(() => countUnits(selectedArmy.value?.stacks ?? []));
const canSplit = computed(() => !!draft.value?.units);
// What the order would cost with the units chosen now: the pace is the slowest leaving unit's, the food share is theirs.
const verdict = computed(() => {
    const army = selectedArmy.value;
    if (!army || !target.value || leavingCount.value === 0)
        return null;
    return verdictFor(army, target.value, canSplit.value ? leaving.value : undefined);
});
const splitNote = computed(() => {
    if (!canSplit.value)
        return t('hud.sendPicker.wholeArmy');
    if (leavingCount.value === 0)
        return t('hud.sendPicker.pickOne');
    if (leavingCount.value >= wholeCount.value)
        return t('hud.sendPicker.wholeArmy');
    return t('hud.sendPicker.splits', { go: leavingCount.value, stay: wholeCount.value - leavingCount.value });
});
const verdictNote = computed(() => {
    const v = verdict.value;
    if (!v || v.ok)
        return '';
    return v.reason === 'noFood' ? t('hud.sendPicker.reasons.noFood') : v.reason === 'unreachable' ? t('hud.sendPicker.reasons.unreachable') : '';
});
const canSend = computed(() => !DEMO_MODE &&
    !!draft.value &&
    !draft.value.submitting &&
    leavingCount.value > 0 &&
    !!verdict.value?.ok &&
    !buildingPicker.isMissingRequiredPick.value);
// A hunt on land cannot take ships along: their rows are locked at 0 (see trimToHuntUnits).
function unitLocked(unit) {
    return draft.value?.mission === 'hunt' && !isHuntUnit(unit, catalogue.byType, !!target.value?.campAtSea);
}
const sendLabel = computed(() => {
    if (draft.value?.submitting)
        return t('hud.dispatchSheet.starting');
    const time = verdict.value?.ok ? ` · ${formatTravel(verdict.value.travelMinutes)}` : '';
    return `${missionName(picker.value?.mission ?? 'move')} · ${unitsLabel(leavingCount.value)}${time}`;
});
function step(max) {
    return max > 10 ? 5 : 1;
}
function change(unit, delta) {
    world.setFieldOrderUnitCount(unit, (leaving.value[unit] ?? 0) + delta);
}
async function send() {
    await world.confirmFieldOrder();
}
function close() {
    world.closeSendPicker();
}
// A marker tap on the map selects the row too: bring it into view.
watch(() => picker.value?.selectedId, async (id) => {
    if (!id)
        return;
    await nextTick();
    const el = document.querySelector('.send-picker .send-row.is-selected');
    el?.scrollIntoView?.({ block: 'nearest', behavior: motionEnabled() ? 'smooth' : 'auto' });
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(picker, {});
    __VLS_withDotValue(DEMO_MODE, {});
    __VLS_withDotValue(draft, {});
    __VLS_withDotValue(canSplit, {});
    __VLS_withDotValue(leaving, {});
    __VLS_withDotValue(world, {});
    __VLS_withDotValue(verdictNote, {});
    __VLS_withDotValue(canSend, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['send-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['send-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['send-row-head']} */ ;
    /** @type {__VLS_StyleScopedClasses['send-row-icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['send-stepper']} */ ;
    /** @type {__VLS_StyleScopedClasses['stepper-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['stepper-all']} */ ;
    /** @type {__VLS_StyleScopedClasses['send-go']} */ ;
    if (picker.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "send-picker" },
        });
        /** @type {__VLS_StyleScopedClasses['send-picker']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "send-picker-title" },
        });
        /** @type {__VLS_StyleScopedClasses['send-picker-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "send-picker-title-text" },
        });
        /** @type {__VLS_StyleScopedClasses['send-picker-title-text']} */ ;
        (__VLS_unwrap(title, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (close) },
            type: "button",
            ...{ class: "send-picker-close" },
            'aria-label': (__VLS_unwrap(t, {})('hud.sendPicker.close')),
        });
        /** @type {__VLS_StyleScopedClasses['send-picker-close']} */ ;
        if (DEMO_MODE.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "send-picker-note" },
            });
            /** @type {__VLS_StyleScopedClasses['send-picker-note']} */ ;
            (__VLS_unwrap(t, {})('hud.armyPanel.demoNote'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "send-picker-list" },
        });
        /** @type {__VLS_StyleScopedClasses['send-picker-list']} */ ;
        const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(pickerRows, {})));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (row.source.id),
                ...{ class: "send-row" },
                ...{ class: ({ 'is-home': row.source.kind === 'home', 'is-selected': row.selected, 'is-off': !row.source.ok }) },
                'data-source': (row.source.id),
            });
            /** @type {__VLS_StyleScopedClasses['send-row']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-home']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-selected']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-off']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(picker.value))
                            throw 0;
                        return (toggle(row));
                        // @ts-ignore
                        [picker, title, t, t, DEMO_MODE, pickerRows,];
                    } },
                type: "button",
                ...{ class: "send-row-head" },
                disabled: (!row.source.ok),
                'aria-pressed': (row.selected),
            });
            /** @type {__VLS_StyleScopedClasses['send-row-head']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "send-row-icon" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['send-row-icon']} */ ;
            if (row.icon) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                    src: (row.icon),
                    alt: "",
                });
            }
            else {
                (__VLS_unwrap(HOME_GLYPH, {}));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "send-row-text" },
            });
            /** @type {__VLS_StyleScopedClasses['send-row-text']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "send-row-title" },
            });
            /** @type {__VLS_StyleScopedClasses['send-row-title']} */ ;
            if (row.source.locked) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    'aria-hidden': "true",
                });
            }
            (row.title);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "send-row-sub" },
            });
            /** @type {__VLS_StyleScopedClasses['send-row-sub']} */ ;
            (row.sub);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "send-row-eta" },
            });
            /** @type {__VLS_StyleScopedClasses['send-row-eta']} */ ;
            (row.eta ?? '');
            if (row.selected && draft.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "send-row-body" },
                });
                /** @type {__VLS_StyleScopedClasses['send-row-body']} */ ;
                if (canSplit.value) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "send-steppers" },
                    });
                    /** @type {__VLS_StyleScopedClasses['send-steppers']} */ ;
                    const __VLS_1 = __VLS_tryAsConstant((row.source.army?.stacks.filter((s) => s.count > 0)));
                    for (const [stack] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            key: (stack.unit),
                            ...{ class: "send-stepper" },
                            ...{ class: ({ 'is-locked-out': unitLocked(stack.unit) }) },
                        });
                        /** @type {__VLS_StyleScopedClasses['send-stepper']} */ ;
                        /** @type {__VLS_StyleScopedClasses['is-locked-out']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "send-stepper-name" },
                        });
                        /** @type {__VLS_StyleScopedClasses['send-stepper-name']} */ ;
                        (__VLS_unwrap(unitName, {})(stack.unit));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    void $event;
                                    if (!(picker.value))
                                        throw 0;
                                    if (!(row.selected && draft.value))
                                        throw 0;
                                    if (!(canSplit.value))
                                        throw 0;
                                    return (change(stack.unit, -step(stack.count)));
                                    // @ts-ignore
                                    [HOME_GLYPH, draft, canSplit, unitName,];
                                } },
                            type: "button",
                            ...{ class: "stepper-btn" },
                            'aria-label': (__VLS_unwrap(t, {})('hud.dispatchSheet.decrement')),
                            disabled: ((leaving.value[stack.unit] ?? 0) <= 0),
                        });
                        /** @type {__VLS_StyleScopedClasses['stepper-btn']} */ ;
                        (__VLS_unwrap(t, {})('hud.dispatchSheet.decrement'));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "stepper-count" },
                        });
                        /** @type {__VLS_StyleScopedClasses['stepper-count']} */ ;
                        (leaving.value[stack.unit] ?? 0);
                        (stack.count);
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    void $event;
                                    if (!(picker.value))
                                        throw 0;
                                    if (!(row.selected && draft.value))
                                        throw 0;
                                    if (!(canSplit.value))
                                        throw 0;
                                    return (change(stack.unit, step(stack.count)));
                                    // @ts-ignore
                                    [t, t, leaving, leaving,];
                                } },
                            type: "button",
                            ...{ class: "stepper-btn" },
                            'aria-label': (__VLS_unwrap(t, {})('hud.dispatchSheet.increment')),
                            disabled: ((leaving.value[stack.unit] ?? 0) >= stack.count || unitLocked(stack.unit)),
                        });
                        /** @type {__VLS_StyleScopedClasses['stepper-btn']} */ ;
                        (__VLS_unwrap(t, {})('hud.dispatchSheet.increment'));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                            ...{ onClick: (...[$event]) => {
                                    void $event;
                                    if (!(picker.value))
                                        throw 0;
                                    if (!(row.selected && draft.value))
                                        throw 0;
                                    if (!(canSplit.value))
                                        throw 0;
                                    return (world.value.setFieldOrderUnitCount(stack.unit, stack.count));
                                    // @ts-ignore
                                    [t, t, leaving, world,];
                                } },
                            type: "button",
                            ...{ class: "stepper-all" },
                            disabled: (unitLocked(stack.unit)),
                        });
                        /** @type {__VLS_StyleScopedClasses['stepper-all']} */ ;
                        (__VLS_unwrap(t, {})('hud.dispatchSheet.allButton'));
                        // @ts-ignore
                        [t,];
                    }
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "send-split-note" },
                    'data-testid': "split-note",
                });
                /** @type {__VLS_StyleScopedClasses['send-split-note']} */ ;
                (__VLS_unwrap(splitNote, {}));
                if (verdictNote.value) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                        ...{ class: "send-error" },
                    });
                    /** @type {__VLS_StyleScopedClasses['send-error']} */ ;
                    (verdictNote.value);
                }
                const __VLS_2 = DispatchTargetBuildingPicker;
                // @ts-ignore
                const __VLS_3 = __VLS_asFunctionalComponent1(__VLS_2, new __VLS_2({
                    // @ts-ignore
                    hasTarget: (!!picker.value.targetSettlementId),
                }));
                const __VLS_4 = __VLS_3({
                    hasTarget: (!!picker.value.targetSettlementId),
                }, ...__VLS_functionalComponentArgsRest(__VLS_3));
                if (draft.value.error) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                        ...{ class: "send-error" },
                    });
                    /** @type {__VLS_StyleScopedClasses['send-error']} */ ;
                    (draft.value.error);
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (send) },
                    type: "button",
                    ...{ class: "send-go" },
                    disabled: (!canSend.value),
                });
                /** @type {__VLS_StyleScopedClasses['send-go']} */ ;
                (__VLS_unwrap(sendLabel, {}));
            }
            // @ts-ignore
            [picker, draft, draft, splitNote, verdictNote, verdictNote, canSend, sendLabel,];
        }
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
