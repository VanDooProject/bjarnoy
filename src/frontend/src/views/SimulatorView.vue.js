/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Issue #40 phase 7: the premium fight simulator. `/simulator` carries
// `meta: { requiresAuth: true }` (router/index.ts) so an unauthenticated
// visitor is redirected to /login before this component even mounts — but
// that only proves they're logged in, not that they're premium.
// `auth.isPremium` (UserResponse now exposes IsPremium — see
// AuthContracts.cs) lets this view show the "Premium feature" notice upfront
// instead of only after a 403. It's advisory only, not a hard gate on the
// button: `PremiumUserEndpointFilter` reads `IsPremium` live from the
// database on every request rather than a token claim, specifically so an
// admin grant takes effect on an already-logged-in account's very next
// request with no re-login needed (see PremiumSimulatorTests) — `auth.user`
// is only ever a login-time snapshot, so disabling Simulate on it would
// permanently lock out exactly the account this design is meant to unblock.
// A successful response self-heals the stale flag (see `runSimulation`) so
// the notice clears without needing a re-login either.
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api } from '../api/client';
import { DEMO_MODE } from '../config';
import { useAuthStore } from '../stores/auth';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import BattleReportCard from '../components/battle/BattleReportCard.vue';
import { buildSimulatorRequest, isPremiumRequiredError } from '../lib/units/simulator';
import LocaleSwitcher from '../components/LocaleSwitcher.vue';
const { t } = useI18n({ useScope: 'global' });
const auth = useAuthStore();
const catalogue = useUnitCatalogueStore();
onMounted(() => catalogue.load());
const attackerCounts = reactive({});
const defenderCounts = reactive({});
const guestCounts = reactive({});
const towerLevel = ref(0);
const landAttackBonusPercent = ref(0);
const shipAttackBonusPercent = ref(0);
const mission = ref('attack');
const seedText = ref('');
const loading = ref(false);
const errorMessage = ref(null);
const premiumRequired = ref(false);
const result = ref(null);
// Shown before any request too, once `auth.user` is known — `premiumRequired`
// only ever flips true after an actual 403, so this also covers a stale flag.
// Advisory only (see the file-top comment) — never used to disable Simulate.
const premiumBlocked = computed(() => !auth.isPremium || premiumRequired.value);
function countFor(bucket, unit) {
    return bucket[unit] ?? 0;
}
function setCount(bucket, unit, raw) {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    bucket[unit] = n;
}
const seed = computed(() => {
    const trimmed = seedText.value.trim();
    if (trimmed === '')
        return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
});
async function runSimulation() {
    errorMessage.value = null;
    premiumRequired.value = false;
    result.value = null;
    const request = buildSimulatorRequest(attackerCounts, defenderCounts, guestCounts, towerLevel.value, mission.value, seed.value, landAttackBonusPercent.value, shipAttackBonusPercent.value);
    if (!request) {
        errorMessage.value = t('simulator.errors.noAttacker');
        return;
    }
    loading.value = true;
    try {
        result.value = await api.simulate(request);
        // The request only ever succeeds for a premium account (see the file-top
        // comment) — self-heal a stale `auth.user.isPremium` snapshot so the
        // proactive notice clears immediately, with no re-login required.
        if (auth.user && !auth.user.isPremium) {
            auth.user.isPremium = true;
        }
    }
    catch (err) {
        if (isPremiumRequiredError(err)) {
            premiumRequired.value = true;
        }
        else {
            errorMessage.value = err instanceof Error ? err.message : t('simulator.errors.simulationFailed');
        }
    }
    finally {
        loading.value = false;
    }
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(DEMO_MODE, {});
    __VLS_withDotValue(premiumBlocked, {});
    __VLS_withDotValue(premiumRequired, {});
    __VLS_withDotValue(catalogue, {});
    __VLS_withDotValue(errorMessage, {});
    __VLS_withDotValue(loading, {});
    __VLS_withDotValue(result, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['back']} */ ;
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    /** @type {__VLS_StyleScopedClasses['premium-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['premium-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['unit-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['option-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['option-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['simulate-btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "simulator-view" },
    });
    /** @type {__VLS_StyleScopedClasses['simulator-view']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "topbar" },
    });
    /** @type {__VLS_StyleScopedClasses['topbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "brand" },
    });
    /** @type {__VLS_StyleScopedClasses['brand']} */ ;
    (__VLS_ctx.$t('common.brand.name'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "topbar-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['topbar-actions']} */ ;
    const __VLS_0 = LocaleSwitcher;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    // @ts-ignore
    }));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
    routerLink;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        // @ts-ignore
        to: "/reports", ...{ class: "back" },
    }));
    const __VLS_7 = __VLS_6({
        to: "/reports",
        ...{ class: "back" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    /** @type {__VLS_StyleScopedClasses['back']} */ ;
    var __VLS_8;
    const { default: __VLS_10 } = __VLS_nonNull(__VLS_8.slots);
    (__VLS_ctx.$t('simulator.back'));
    // @ts-ignore
    [$t, $t,];
    __VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
        ...{ class: "body" },
    });
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.$t('simulator.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "subtitle" },
    });
    /** @type {__VLS_StyleScopedClasses['subtitle']} */ ;
    (__VLS_ctx.$t('simulator.subtitle'));
    if (DEMO_MODE.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('simulator.demoModeHint'));
    }
    else {
        if (premiumBlocked.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "premium-card" },
            });
            /** @type {__VLS_StyleScopedClasses['premium-card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
            (__VLS_ctx.$t('simulator.premium.title'));
            if (premiumRequired.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
                (__VLS_ctx.$t('simulator.premium.rejected'));
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
                (__VLS_ctx.$t('simulator.premium.notPremium'));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "honest-note" },
            });
            /** @type {__VLS_StyleScopedClasses['honest-note']} */ ;
            (__VLS_ctx.$t('simulator.premium.honestNote'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
            ...{ onSubmit: (runSimulation) },
            ...{ class: "sim-form" },
        });
        /** @type {__VLS_StyleScopedClasses['sim-form']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "stack-section" },
        });
        /** @type {__VLS_StyleScopedClasses['stack-section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('simulator.sections.attacker'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "unit-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['unit-grid']} */ ;
        const __VLS_11 = __VLS_tryAsConstant((catalogue.value.definitions));
        for (const [def] of __VLS_vFor(__VLS_nonNull(__VLS_11))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                key: ('a-' + def.type),
                ...{ class: "unit-field" },
            });
            /** @type {__VLS_StyleScopedClasses['unit-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (def.type);
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: (...[$event]) => {
                        void $event;
                        __VLS_withDotValue(DEMO_MODE, {});
                        if (!!(DEMO_MODE.value))
                            throw 0;
                        return (setCount(__VLS_unwrap(attackerCounts, {}), def.type, $event.target.value));
                        // @ts-ignore
                        [$t, $t, $t, $t, $t, $t, $t, $t, DEMO_MODE, premiumBlocked, premiumRequired, catalogue, attackerCounts,];
                    } },
                type: "number",
                min: "0",
                value: (countFor(__VLS_unwrap(attackerCounts, {}), def.type)),
            });
            // @ts-ignore
            [attackerCounts,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "stack-section" },
        });
        /** @type {__VLS_StyleScopedClasses['stack-section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('simulator.sections.defender'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "section-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['section-hint']} */ ;
        (__VLS_ctx.$t('simulator.sections.defenderHint'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "unit-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['unit-grid']} */ ;
        const __VLS_12 = __VLS_tryAsConstant((catalogue.value.definitions));
        for (const [def] of __VLS_vFor(__VLS_nonNull(__VLS_12))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                key: ('d-' + def.type),
                ...{ class: "unit-field" },
            });
            /** @type {__VLS_StyleScopedClasses['unit-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (def.type);
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: (...[$event]) => {
                        void $event;
                        __VLS_withDotValue(DEMO_MODE, {});
                        if (!!(DEMO_MODE.value))
                            throw 0;
                        return (setCount(__VLS_unwrap(defenderCounts, {}), def.type, $event.target.value));
                        // @ts-ignore
                        [$t, $t, catalogue, defenderCounts,];
                    } },
                type: "number",
                min: "0",
                value: (countFor(__VLS_unwrap(defenderCounts, {}), def.type)),
            });
            // @ts-ignore
            [defenderCounts,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "stack-section" },
        });
        /** @type {__VLS_StyleScopedClasses['stack-section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('simulator.sections.guestDefenders'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "section-hint" },
        });
        /** @type {__VLS_StyleScopedClasses['section-hint']} */ ;
        (__VLS_ctx.$t('simulator.sections.guestDefendersHint'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "unit-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['unit-grid']} */ ;
        const __VLS_13 = __VLS_tryAsConstant((catalogue.value.definitions));
        for (const [def] of __VLS_vFor(__VLS_nonNull(__VLS_13))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                key: ('g-' + def.type),
                ...{ class: "unit-field" },
            });
            /** @type {__VLS_StyleScopedClasses['unit-field']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (def.type);
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onInput: (...[$event]) => {
                        void $event;
                        __VLS_withDotValue(DEMO_MODE, {});
                        if (!!(DEMO_MODE.value))
                            throw 0;
                        return (setCount(__VLS_unwrap(guestCounts, {}), def.type, $event.target.value));
                        // @ts-ignore
                        [$t, $t, catalogue, guestCounts,];
                    } },
                type: "number",
                min: "0",
                value: (countFor(__VLS_unwrap(guestCounts, {}), def.type)),
            });
            // @ts-ignore
            [guestCounts,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "options-row" },
        });
        /** @type {__VLS_StyleScopedClasses['options-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "option-field" },
        });
        /** @type {__VLS_StyleScopedClasses['option-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('simulator.options.towerLevel'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "0",
        });
        (__VLS_unwrap(towerLevel, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "option-field" },
        });
        /** @type {__VLS_StyleScopedClasses['option-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('simulator.options.landAttackBonusPercent'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "0",
            max: "100",
        });
        (__VLS_unwrap(landAttackBonusPercent, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "option-field" },
        });
        /** @type {__VLS_StyleScopedClasses['option-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('simulator.options.shipAttackBonusPercent'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "0",
            max: "100",
        });
        (__VLS_unwrap(shipAttackBonusPercent, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "option-field" },
        });
        /** @type {__VLS_StyleScopedClasses['option-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('simulator.options.mission'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            value: (__VLS_unwrap(mission, {})),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "attack",
        });
        (__VLS_ctx.$t('simulator.options.attack'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "raid",
        });
        (__VLS_ctx.$t('simulator.options.raid'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "option-field" },
        });
        /** @type {__VLS_StyleScopedClasses['option-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_ctx.$t('simulator.options.seed'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            placeholder: (__VLS_ctx.$t('simulator.options.seedPlaceholder')),
        });
        (__VLS_unwrap(seedText, {}));
        if (errorMessage.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "hint error" },
            });
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (errorMessage.value);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            type: "submit",
            ...{ class: "simulate-btn" },
            disabled: (loading.value),
        });
        /** @type {__VLS_StyleScopedClasses['simulate-btn']} */ ;
        (loading.value ? __VLS_ctx.$t('simulator.simulating') : __VLS_ctx.$t('simulator.simulate'));
        if (result.value) {
            const __VLS_14 = BattleReportCard;
            // @ts-ignore
            const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({
                // @ts-ignore
                report: (result.value), side: "attacker",
            }));
            const __VLS_16 = __VLS_15({
                report: (result.value),
                side: "attacker",
            }, ...__VLS_functionalComponentArgsRest(__VLS_15));
        }
    }
    // @ts-ignore
    [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, towerLevel, landAttackBonusPercent, shipAttackBonusPercent, mission, seedText, errorMessage, errorMessage, loading, loading, result, result,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
