/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The troop slots of a dispatch that includes ships: what the land units aboard need against what the ships offer. Shared
// by the desktop panel (ArmyPanel.vue) and the phone sheet (MobileDispatchSheet.vue); the same check blocks sending there
// (`exceedsShipCapacity`), mirroring the backend's `InsufficientShipCapacity`. Nothing shows for a land army.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { shipSlotUsage } from '../../lib/units/armyDispatch';
const { defineProps, } = {};
const props = defineProps();
const catalogue = useUnitCatalogueStore();
const { t } = useI18n({ useScope: 'global' });
const usage = computed(() => shipSlotUsage(props.unitCounts, catalogue.byType));
const over = computed(() => !!usage.value && usage.value.needed > usage.value.offered);
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
    __VLS_withDotValue(usage, {});
    __VLS_withDotValue(over, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['dispatch-slots']} */ ;
    /** @type {__VLS_StyleScopedClasses['dispatch-slots']} */ ;
    /** @type {__VLS_StyleScopedClasses['slots-line']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dispatch-slots-slot" },
    });
    /** @type {__VLS_StyleScopedClasses['dispatch-slots-slot']} */ ;
    if (usage.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "dispatch-slots" },
            ...{ class: ({ over: over.value }) },
            'data-testid': "ship-slots",
        });
        /** @type {__VLS_StyleScopedClasses['dispatch-slots']} */ ;
        /** @type {__VLS_StyleScopedClasses['over']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "slots-line" },
        });
        /** @type {__VLS_StyleScopedClasses['slots-line']} */ ;
        (__VLS_unwrap(t, {})('hud.armyPanel.shipSlots', { used: usage.value.needed, offered: usage.value.offered }));
        if (over.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "slots-over" },
                role: "alert",
            });
            /** @type {__VLS_StyleScopedClasses['slots-over']} */ ;
            (__VLS_unwrap(t, {})('hud.armyPanel.shipSlotsOver'));
        }
    }
    // @ts-ignore
    [usage, usage, usage, over, over, t, t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
