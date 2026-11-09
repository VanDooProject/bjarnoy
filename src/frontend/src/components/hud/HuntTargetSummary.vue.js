/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The wildlife camp a hunt dispatch is aimed at: family, level, garrison per tier with the
// beasts' names, whether it is calm / aggressive / empty, the loot a hunt can pay (before the
// army's carry cap) and how the selected army's attack compares with the camp's defense. Shared by
// ArmyPanel.vue and MobileDispatchSheet.vue.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { beastName, campName, resourceName } from '../../i18n/catalogueNames';
import { armyAttackPower, huntOutlook, huntSummaryFor } from '../../lib/units/huntSummary';
const { defineProps, } = {};
const props = defineProps();
const world = useWorldStore();
const catalogue = useUnitCatalogueStore();
const { t, d } = useI18n({ useScope: 'global' });
const summary = computed(() => {
    if (!props.target)
        return null;
    void world.campStatesVersion; // re-read the live camp state when a refresh lands
    const camp = world.model.campAt(props.target);
    return camp ? huntSummaryFor(camp, Date.now()) : null;
});
const attack = computed(() => armyAttackPower(props.unitCounts, catalogue.byType));
const outlook = computed(() => (summary.value ? huntOutlook(attack.value, summary.value) : null));
const lootChips = computed(() => summary.value
    ? ['food', 'wood', 'stone', 'iron']
        .filter((kind) => summary.value.loot[kind] > 0)
        .map((kind) => ({ kind, label: resourceName(kind), amount: summary.value.loot[kind] }))
    : []);
const statusText = computed(() => {
    const s = summary.value;
    if (!s)
        return '';
    if (s.status === 'calm' && s.calmUntil)
        return t('hud.huntTarget.calmUntil', { time: d(new Date(s.calmUntil), 'long') });
    return t(`hud.huntTarget.status.${s.status}`);
});
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
    __VLS_withDotValue(summary, {});
    __VLS_withDotValue(lootChips, {});
    __VLS_withDotValue(outlook, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['hunt-status']} */ ;
    /** @type {__VLS_StyleScopedClasses['hunt-status']} */ ;
    /** @type {__VLS_StyleScopedClasses['hunt-garrison']} */ ;
    /** @type {__VLS_StyleScopedClasses['hunt-outlook']} */ ;
    /** @type {__VLS_StyleScopedClasses['hunt-outlook']} */ ;
    if (summary.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "hunt-target" },
            'data-testid': "hunt-target",
        });
        /** @type {__VLS_StyleScopedClasses['hunt-target']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "hunt-head" },
        });
        /** @type {__VLS_StyleScopedClasses['hunt-head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (__VLS_unwrap(campName, {})(summary.value.family));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "hunt-level" },
        });
        /** @type {__VLS_StyleScopedClasses['hunt-level']} */ ;
        (__VLS_unwrap(t, {})('hud.hoverTooltip.level', { level: summary.value.effectiveLevel }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hunt-status" },
            ...{ class: (summary.value.status) },
            'data-testid': "hunt-status",
        });
        /** @type {__VLS_StyleScopedClasses['hunt-status']} */ ;
        (__VLS_unwrap(statusText, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "hunt-garrison" },
        });
        /** @type {__VLS_StyleScopedClasses['hunt-garrison']} */ ;
        const __VLS_0 = __VLS_tryAsConstant((summary.value.tiers));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                key: (row.tier),
                'data-tier': (row.tier),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_unwrap(beastName, {})(summary.value.family, row.tier));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (row.count);
            (row.full);
            // @ts-ignore
            [summary, summary, summary, summary, summary, summary, campName, t, statusText, beastName,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hunt-loot" },
            'data-testid': "hunt-loot",
        });
        /** @type {__VLS_StyleScopedClasses['hunt-loot']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "hunt-label" },
        });
        /** @type {__VLS_StyleScopedClasses['hunt-label']} */ ;
        (__VLS_unwrap(t, {})('hud.huntTarget.loot'));
        const __VLS_1 = __VLS_tryAsConstant((lootChips.value));
        for (const [chip] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                key: (chip.kind),
                ...{ class: "hunt-chip" },
            });
            /** @type {__VLS_StyleScopedClasses['hunt-chip']} */ ;
            (chip.amount);
            (chip.label);
            // @ts-ignore
            [t, lootChips,];
        }
        if (!lootChips.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (__VLS_unwrap(t, {})('hud.huntTarget.noLoot'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hunt-outlook" },
            ...{ class: (outlook.value) },
            'data-testid': "hunt-outlook",
        });
        /** @type {__VLS_StyleScopedClasses['hunt-outlook']} */ ;
        (__VLS_unwrap(t, {})('hud.huntTarget.power', { attack: __VLS_unwrap(attack, {}), defense: summary.value.campDefense }));
        if (outlook.value) {
            (__VLS_unwrap(t, {})(`hud.huntTarget.outlook.${outlook.value}`));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hunt-note" },
        });
        /** @type {__VLS_StyleScopedClasses['hunt-note']} */ ;
        (__VLS_unwrap(t, {})('hud.huntTarget.estimateNote'));
    }
    // @ts-ignore
    [summary, t, t, t, t, lootChips, outlook, outlook, outlook, attack,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
