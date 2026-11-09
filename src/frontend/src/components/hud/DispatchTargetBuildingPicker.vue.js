/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The target-building picker of the order being composed: a fleet attack must name one building on the target's shore, a land attack may
// name one for its siege engines. One component for every surface that composes an attack (ArmyPanel.vue, MobileDispatchSheet.vue and
// SendArmyPicker.vue); the rows and rules come from useDispatchTargetBuilding.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useDispatchTargetBuilding } from '../../composables/useDispatchTargetBuilding';
const { defineProps, } = {};
const props = defineProps();
const world = useWorldStore();
const { t } = useI18n({ useScope: 'global' });
const picker = useDispatchTargetBuilding(computed(() => props.hasTarget));
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
    __VLS_withDotValue(picker, {});
    __VLS_withDotValue(world, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['target-row']} */ ;
    if (picker.value.showPicker.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "building-picker" },
        });
        /** @type {__VLS_StyleScopedClasses['building-picker']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status-subtext building-picker-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
        /** @type {__VLS_StyleScopedClasses['building-picker-hint']} */ ;
        (__VLS_unwrap(t, {})(picker.value.isRequired.value ? 'hud.armyPanel.fleetBuildingPickerHint' : 'hud.armyPanel.buildingPickerHint'));
        if (!picker.value.isRequired.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "status-subtext" },
                'data-testid': "engine-reach",
            });
            /** @type {__VLS_StyleScopedClasses['status-subtext']} */ ;
            (__VLS_unwrap(t, {})('hud.armyPanel.engineReach'));
        }
        if (picker.value.selectedLabel.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "target-selected" },
            });
            /** @type {__VLS_StyleScopedClasses['target-selected']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_unwrap(t, {})('hud.armyPanel.target'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (picker.value.selectedLabel.value);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (picker.value.clear) },
                type: "button",
                ...{ class: "secondary change-target" },
            });
            /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
            /** @type {__VLS_StyleScopedClasses['change-target']} */ ;
            (__VLS_unwrap(t, {})('hud.armyPanel.clear'));
        }
        if (picker.value.selectedUnreachable.value) {
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
                (__VLS_unwrap(t, {})(picker.value.isRequired.value ? 'hud.armyPanel.fleetLayoutLoadError' : 'hud.armyPanel.layoutLoadError'));
            }
            else if (picker.value.rows.value.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "target-list building-list" },
                });
                /** @type {__VLS_StyleScopedClasses['target-list']} */ ;
                /** @type {__VLS_StyleScopedClasses['building-list']} */ ;
                const __VLS_0 = __VLS_tryAsConstant((picker.value.rows.value));
                for (const [b] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!(picker.value.showPicker.value))
                                    throw 0;
                                if (!!(picker.value.selectedUnreachable.value))
                                    throw 0;
                                if (!!(world.value.dispatchTargetBuildingsLoading))
                                    throw 0;
                                if (!!(world.value.dispatchTargetBuildingsError))
                                    throw 0;
                                if (!(picker.value.rows.value.length))
                                    throw 0;
                                return (picker.value.pick(b.q, b.r));
                                // @ts-ignore
                                [picker, picker, picker, picker, picker, picker, picker, picker, picker, picker, picker, t, t, t, t, t, t, t, world, world,];
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
                (__VLS_unwrap(t, {})(picker.value.isRequired.value ? 'hud.armyPanel.fleetNoShoreBuilding' : 'hud.armyPanel.noPreference'));
            }
        }
    }
    // @ts-ignore
    [picker, t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
