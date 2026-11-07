/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import EconomyChart from '../../components/admin/EconomyChart.vue';
import { buildingName } from '../../i18n/catalogueNames';
import { curvesFor } from '../../lib/economy/curves';
import { DEFAULT_JOIN_TIME, DEFAULT_PRODUCER_COUNTS, DEFAULT_PRODUCERS_AHEAD, DEFAULT_RENOWN_THRESHOLD, FOUNDING_STOCK, PROFILE_PRESETS, RESOURCES, productionOnDay, settlerCostFrom, simulatePacing, } from '../../lib/economy/pacingSim';
import { applyWhatIf, defaultWhatIf } from '../../lib/economy/whatIf';
import { unlockLadder } from '../../lib/economy/unlocks';
import { useBuildingCatalogueStore } from '../../stores/buildingCatalogue';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
const { t } = useI18n({ useScope: 'global' });
const catalogue = useBuildingCatalogueStore();
const units = useUnitCatalogueStore();
const PALETTE = ['#ffc55c', '#5cb8ff', '#7bd88f', '#ff7a7a', '#c39bff', '#ff9f5c', '#5ce1d6', '#e6e07a', '#ff8fc7', '#a3b1c2'];
const DEFAULT_TYPES = ['longhouse', 'lumberjack', 'quarry', 'reindeerherder', 'storagehouse', 'barracks'];
onMounted(() => {
    void catalogue.load();
    void units.load();
});
const byType = computed(() => catalogue.byType);
const ready = computed(() => catalogue.definitions.length > 0);
// --- Section 1: curves ---------------------------------------------------
const selectedTypes = ref([]);
// Golden-angle hues: every catalogue type gets its own stable, well-spread colour.
const typeColor = (type) => `hsl(${Math.round((Math.max(0, catalogue.types.indexOf(type)) * 137.508) % 360)} 70% 62%)`;
watch(ready, (isReady) => {
    if (isReady && selectedTypes.value.length === 0) {
        selectedTypes.value = DEFAULT_TYPES.filter((type) => byType.value[type]);
    }
}, { immediate: true });
// --- What-if: the same catalogue regenerated from level 1 and the growth knobs ---
const whatIf = reactive(defaultWhatIf());
const whatIfByType = computed(() => applyWhatIf(byType.value, whatIf));
function resetWhatIf() {
    Object.assign(whatIf, defaultWhatIf());
}
const WHAT_IF_FIELDS = [
    'costGrowth',
    'longhouseCostGrowth',
    'timeGrowth',
    'longhouseTimeGrowth',
    'productionGrowth',
    'producerCostScale',
    'longhouseCostScale',
    'timeScale',
];
const curves = computed(() => catalogue.types
    .filter((type) => selectedTypes.value.includes(type))
    .map((type) => ({
    type,
    live: curvesFor(byType.value[type]),
    whatIf: curvesFor(whatIfByType.value[type] ?? byType.value[type]),
})));
/** Live series first (solid), then the what-if twins (dashed, same colour). */
function curveSeries(pick, dropZero) {
    const toPoints = (points) => points.map((p) => {
        const y = pick(p);
        return { x: p.level, y: dropZero && y !== null && y <= 0 ? null : y };
    });
    return [
        ...curves.value.map(({ type, live }) => ({ label: buildingName(type), color: typeColor(type), points: toPoints(live) })),
        ...curves.value.map(({ type, whatIf: w }) => ({
            label: t('adminEconomy.curves.whatIfSuffix', { name: buildingName(type) }),
            color: typeColor(type),
            dashed: true,
            points: toPoints(w),
        })),
    ];
}
const costSeries = computed(() => curveSeries((p) => p.totalCost, true));
const timeSeries = computed(() => curveSeries((p) => p.buildMinutes, true));
const productionSeries = computed(() => curveSeries((p) => p.productionPerHour, false));
const paybackSeries = computed(() => curveSeries((p) => p.paybackHours, false));
// --- Section 2: unlock ladder --------------------------------------------
const ladder = computed(() => unlockLadder(byType.value));
const unlockSeries = computed(() => [
    {
        label: t('adminEconomy.unlocks.count'),
        color: PALETTE[0],
        points: ladder.value.map((l) => ({ x: l.level, y: l.unlocks.length })),
    },
]);
// --- Section 3: pacing ---------------------------------------------------
const producerTypes = computed(() => catalogue.types.filter((type) => {
    if (type === 'longhouse')
        return false;
    const first = byType.value[type]?.find((d) => d.level === 1);
    if (!first)
        return false;
    const p = first.productionPerHour;
    return p.wood + p.stone + p.food + p.iron > 0;
}));
const startStock = reactive({ ...FOUNDING_STOCK });
const producerCounts = reactive({ ...DEFAULT_PRODUCER_COUNTS });
const horizonDays = ref(60);
const storageCount = ref(2);
const joinTime = ref(DEFAULT_JOIN_TIME);
const producersAhead = ref(DEFAULT_PRODUCERS_AHEAD);
const aheadUnlimited = ref(false);
const feasts = ref(false);
const renownThreshold = ref(DEFAULT_RENOWN_THRESHOLD);
// Every producer type gets an explicit count so its input never renders blank.
watch(producerTypes, (types) => {
    for (const type of types)
        producerCounts[type] ??= 0;
}, { immediate: true });
const settlerCost = computed(() => settlerCostFrom(units.byType['settler']?.trainingCost));
const PROFILE_KEYS = ['active', 'checkins4', 'checkins2', 'always24', 'custom'];
const PROFILE_LABEL = {
    active: 'adminEconomy.pacing.profileActive',
    checkins4: 'adminEconomy.pacing.profileCheckins4',
    checkins2: 'adminEconomy.pacing.profileCheckins2',
    always24: 'adminEconomy.pacing.profileAlways24',
    custom: 'adminEconomy.pacing.profileCustom',
};
const selectedProfiles = ref(['active', 'checkins4', 'checkins2']);
const customSessions = ref([
    { start: '08:00', minutes: 10 },
    { start: '13:00', minutes: 10 },
    { start: '19:00', minutes: 10 },
]);
function addSession() {
    customSessions.value.push({ start: '12:00', minutes: 10 });
}
function removeSession(i) {
    customSessions.value.splice(i, 1);
}
const sessionsOf = (key) => key === 'custom' ? customSessions.value.map((s) => ({ ...s })) : PROFILE_PRESETS[key];
const results = ref(null);
/** Profiles the shown results were run for, in display order. */
const ranProfiles = ref([]);
const running = ref(false);
function run() {
    running.value = true;
    const base = {
        horizonDays: Math.max(1, Number(horizonDays.value) || 1),
        producerCounts: { ...producerCounts },
        settlerCost: settlerCost.value,
        settleType: 'cartworkshop',
        storageCount: Math.max(1, Number(storageCount.value) || 1),
        joinTime: joinTime.value || DEFAULT_JOIN_TIME,
        producersAhead: aheadUnlimited.value ? Infinity : Math.max(0, Number(producersAhead.value) || 0),
        feasts: feasts.value,
        renownThreshold: Math.max(0, Number(renownThreshold.value) || 0),
    };
    const keys = PROFILE_KEYS.filter((k) => selectedProfiles.value.includes(k));
    const out = {};
    for (const key of keys) {
        const sessions = sessionsOf(key);
        out[key] = {
            live: simulatePacing(byType.value, { ...base, sessions, startStock: { ...startStock } }),
            whatIf: simulatePacing(whatIfByType.value, { ...base, sessions, startStock: { ...whatIf.foundingStock } }),
        };
    }
    results.value = out;
    ranProfiles.value = keys;
    running.value = false;
}
// One initial run when the catalogue arrives; afterwards only the button runs it.
const ranOnce = ref(false);
watch(ready, (isReady) => {
    if (isReady && !ranOnce.value) {
        ranOnce.value = true;
        run();
    }
}, { immediate: true });
const pacingSeries = computed(() => {
    if (!results.value)
        return [];
    const make = (which) => ranProfiles.value.map((key) => {
        const s = results.value[key][which].series;
        const label = t(PROFILE_LABEL[key]);
        return {
            label: which === 'live' ? label : t('adminEconomy.curves.whatIfSuffix', { name: label }),
            color: PALETTE[PROFILE_KEYS.indexOf(key)],
            dashed: which === 'whatIf',
            points: s.minute.map((m, k) => ({ x: m / 1440, y: s.lh[k] })),
        };
    });
    return [...make('live'), ...make('whatIf')];
});
const MILESTONE_LEVELS = [5, 10, 15, 20, 25, 30];
const PRODUCTION_DAYS = [7, 14, 30];
const lhLevels = computed(() => MILESTONE_LEVELS.filter((l) => l <= Math.max(...ladder.value.map((r) => r.level), 0)));
/** Minutes as `Xd HH:MM`. */
function formatDuration(minutes) {
    if (minutes === null || minutes === undefined)
        return '—';
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    const m = Math.floor(minutes % 60);
    return `${d}d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function levelText(r, level) {
    return r.lhReachedAt[level] === undefined ? t('adminEconomy.pacing.never') : formatDuration(r.lhReachedAt[level]);
}
function productionText(r, day) {
    const p = productionOnDay(r, day);
    return p === null ? '—' : Math.round(p).toLocaleString('en-US');
}
function settlementText(r) {
    return r.secondSettlementAt === null ? t('adminEconomy.pacing.never') : formatDuration(r.secondSettlementAt);
}
function flattenText(r) {
    return r.growthFlattensAt === null ? t('adminEconomy.pacing.never') : String(r.growthFlattensAt);
}
function costText(line) {
    return RESOURCES.map((r) => `${Math.round(line[r])} ${t(`adminEconomy.resources.${r}`)}`).join(' · ');
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(catalogue, {});
    __VLS_withDotValue(ready, {});
    __VLS_withDotValue(whatIf, {});
    __VLS_withDotValue(selectedTypes, {});
    __VLS_withDotValue(startStock, {});
    __VLS_withDotValue(producerCounts, {});
    __VLS_withDotValue(PROFILE_LABEL, {});
    __VLS_withDotValue(selectedProfiles, {});
    __VLS_withDotValue(running, {});
    __VLS_withDotValue(results, {});
    __VLS_withDotValue(ranProfiles, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['economy']} */ ;
    /** @type {__VLS_StyleScopedClasses['economy']} */ ;
    /** @type {__VLS_StyleScopedClasses['type-picker']} */ ;
    /** @type {__VLS_StyleScopedClasses['type-chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['type-chip']} */ ;
    /** @type {__VLS_StyleScopedClasses['ladder-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['ladder-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['inputs']} */ ;
    /** @type {__VLS_StyleScopedClasses['inputs']} */ ;
    /** @type {__VLS_StyleScopedClasses['inputs']} */ ;
    /** @type {__VLS_StyleScopedClasses['inputs']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['whatif']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['table']} */ ;
    /** @type {__VLS_StyleScopedClasses['inputs']} */ ;
    /** @type {__VLS_StyleScopedClasses['inputs']} */ ;
    /** @type {__VLS_StyleScopedClasses['inputs']} */ ;
    /** @type {__VLS_StyleScopedClasses['check']} */ ;
    /** @type {__VLS_StyleScopedClasses['inputs']} */ ;
    /** @type {__VLS_StyleScopedClasses['run']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "economy" },
    });
    /** @type {__VLS_StyleScopedClasses['economy']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.$t('adminEconomy.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_ctx.$t('adminEconomy.intro'));
    if (catalogue.value.source) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "source" },
            'data-testid': "economy-source",
        });
        /** @type {__VLS_StyleScopedClasses['source']} */ ;
        if (catalogue.value.source === 'live') {
            (__VLS_ctx.$t('adminEconomy.source.live'));
        }
        else {
            (__VLS_ctx.$t('adminEconomy.source.fallback', { generatedAt: catalogue.value.generatedAt ?? '—' }));
        }
    }
    if (!ready.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('adminEconomy.loading'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "panel-section" },
        });
        /** @type {__VLS_StyleScopedClasses['panel-section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('adminEconomy.whatIf.title'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('adminEconomy.whatIf.hint'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
            ...{ onSubmit: () => { } },
            ...{ class: "inputs" },
            'data-testid': "whatif-form",
        });
        /** @type {__VLS_StyleScopedClasses['inputs']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.legend, __VLS_intrinsics.legend)({});
        (__VLS_ctx.$t('adminEconomy.whatIf.title'));
        const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(WHAT_IF_FIELDS, {})));
        for (const [f] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                key: (f),
            });
            (__VLS_ctx.$t(`adminEconomy.whatIf.${f}`));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "number",
                min: "0",
                step: "0.01",
                'data-testid': (`whatif-${f}`),
            });
            (whatIf.value[f]);
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, $t, $t, $t, catalogue, catalogue, catalogue, ready, WHAT_IF_FIELDS, whatIf,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.legend, __VLS_intrinsics.legend)({});
        (__VLS_ctx.$t('adminEconomy.whatIf.foundingStock'));
        const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(RESOURCES, {})));
        for (const [r] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                key: (r),
            });
            (__VLS_ctx.$t(`adminEconomy.resources.${r}`));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "number",
                min: "0",
                step: "50",
            });
            (whatIf.value.foundingStock[r]);
            // @ts-ignore
            [$t, $t, whatIf, RESOURCES,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (resetWhatIf) },
            type: "button",
            ...{ class: "secondary" },
            'data-testid': "whatif-reset",
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_ctx.$t('adminEconomy.whatIf.reset'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "panel-section" },
        });
        /** @type {__VLS_StyleScopedClasses['panel-section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('adminEconomy.curves.title'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('adminEconomy.curves.note'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({
            ...{ class: "type-picker" },
        });
        /** @type {__VLS_StyleScopedClasses['type-picker']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.legend, __VLS_intrinsics.legend)({});
        (__VLS_ctx.$t('adminEconomy.curves.pick'));
        const __VLS_2 = __VLS_tryAsConstant((catalogue.value.types));
        for (const [type] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                key: (type),
                ...{ class: "type-chip" },
                ...{ class: ({ on: selectedTypes.value.includes(type) }) },
            });
            /** @type {__VLS_StyleScopedClasses['type-chip']} */ ;
            /** @type {__VLS_StyleScopedClasses['on']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "checkbox",
                value: (type),
            });
            (selectedTypes.value);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "swatch" },
                ...{ style: ({ background: __VLS_unwrap(typeColor, {})(type) }) },
            });
            /** @type {__VLS_StyleScopedClasses['swatch']} */ ;
            (__VLS_unwrap(buildingName, {})(type));
            // @ts-ignore
            [$t, $t, $t, $t, catalogue, selectedTypes, selectedTypes, typeColor, buildingName,];
        }
        if (selectedTypes.value.length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (__VLS_ctx.$t('adminEconomy.curves.empty'));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "chart-grid" },
            });
            /** @type {__VLS_StyleScopedClasses['chart-grid']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "chart-card" },
            });
            /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
            (__VLS_ctx.$t('adminEconomy.curves.totalCost'));
            const __VLS_3 = EconomyChart;
            // @ts-ignore
            const __VLS_4 = __VLS_asFunctionalComponent1(__VLS_3, new __VLS_3({
                // @ts-ignore
                series: (__VLS_unwrap(costSeries, {})), logY: true, integerX: true, xTitle: (__VLS_ctx.$t('adminEconomy.curves.level')), yTitle: (__VLS_ctx.$t('adminEconomy.curves.cost')),
            }));
            const __VLS_5 = __VLS_4({
                series: (__VLS_unwrap(costSeries, {})),
                logY: true,
                integerX: true,
                xTitle: (__VLS_ctx.$t('adminEconomy.curves.level')),
                yTitle: (__VLS_ctx.$t('adminEconomy.curves.cost')),
            }, ...__VLS_functionalComponentArgsRest(__VLS_4));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "chart-card" },
            });
            /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
            (__VLS_ctx.$t('adminEconomy.curves.buildTime'));
            const __VLS_8 = EconomyChart;
            // @ts-ignore
            const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
                // @ts-ignore
                series: (__VLS_unwrap(timeSeries, {})), logY: true, integerX: true, xTitle: (__VLS_ctx.$t('adminEconomy.curves.level')), yTitle: (__VLS_ctx.$t('adminEconomy.curves.minutes')),
            }));
            const __VLS_10 = __VLS_9({
                series: (__VLS_unwrap(timeSeries, {})),
                logY: true,
                integerX: true,
                xTitle: (__VLS_ctx.$t('adminEconomy.curves.level')),
                yTitle: (__VLS_ctx.$t('adminEconomy.curves.minutes')),
            }, ...__VLS_functionalComponentArgsRest(__VLS_9));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "chart-card" },
            });
            /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
            (__VLS_ctx.$t('adminEconomy.curves.production'));
            const __VLS_13 = EconomyChart;
            // @ts-ignore
            const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
                // @ts-ignore
                series: (__VLS_unwrap(productionSeries, {})), integerX: true, xTitle: (__VLS_ctx.$t('adminEconomy.curves.level')), yTitle: (__VLS_ctx.$t('adminEconomy.curves.perHour')),
            }));
            const __VLS_15 = __VLS_14({
                series: (__VLS_unwrap(productionSeries, {})),
                integerX: true,
                xTitle: (__VLS_ctx.$t('adminEconomy.curves.level')),
                yTitle: (__VLS_ctx.$t('adminEconomy.curves.perHour')),
            }, ...__VLS_functionalComponentArgsRest(__VLS_14));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "chart-card" },
            });
            /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
            (__VLS_ctx.$t('adminEconomy.curves.payback'));
            const __VLS_18 = EconomyChart;
            // @ts-ignore
            const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
                // @ts-ignore
                series: (__VLS_unwrap(paybackSeries, {})), integerX: true, xTitle: (__VLS_ctx.$t('adminEconomy.curves.level')), yTitle: (__VLS_ctx.$t('adminEconomy.curves.hours')),
            }));
            const __VLS_20 = __VLS_19({
                series: (__VLS_unwrap(paybackSeries, {})),
                integerX: true,
                xTitle: (__VLS_ctx.$t('adminEconomy.curves.level')),
                yTitle: (__VLS_ctx.$t('adminEconomy.curves.hours')),
            }, ...__VLS_functionalComponentArgsRest(__VLS_19));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "panel-section" },
        });
        /** @type {__VLS_StyleScopedClasses['panel-section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('adminEconomy.unlocks.title'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('adminEconomy.unlocks.hint'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "chart-card" },
        });
        /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
        (__VLS_ctx.$t('adminEconomy.unlocks.chartTitle'));
        const __VLS_23 = EconomyChart;
        // @ts-ignore
        const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
            // @ts-ignore
            kind: "bar", series: (__VLS_unwrap(unlockSeries, {})), legend: (false), xTitle: (__VLS_ctx.$t('adminEconomy.unlocks.lhLevel')), yTitle: (__VLS_ctx.$t('adminEconomy.unlocks.count')),
        }));
        const __VLS_25 = __VLS_24({
            kind: "bar",
            series: (__VLS_unwrap(unlockSeries, {})),
            legend: (false),
            xTitle: (__VLS_ctx.$t('adminEconomy.unlocks.lhLevel')),
            yTitle: (__VLS_ctx.$t('adminEconomy.unlocks.count')),
        }, ...__VLS_functionalComponentArgsRest(__VLS_24));
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "ladder" },
        });
        /** @type {__VLS_StyleScopedClasses['ladder']} */ ;
        const __VLS_28 = __VLS_tryAsConstant((__VLS_unwrap(ladder, {})));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_28))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                key: (row.level),
                ...{ class: "ladder-row" },
                ...{ class: ({ bulk: row.bulk, gap: row.gap }) },
                'data-testid': (`ladder-${row.level}`),
            });
            /** @type {__VLS_StyleScopedClasses['ladder-row']} */ ;
            /** @type {__VLS_StyleScopedClasses['bulk']} */ ;
            /** @type {__VLS_StyleScopedClasses['gap']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ladder-level" },
            });
            /** @type {__VLS_StyleScopedClasses['ladder-level']} */ ;
            (__VLS_ctx.$t('adminEconomy.unlocks.levelRow', { level: row.level }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ladder-items" },
            });
            /** @type {__VLS_StyleScopedClasses['ladder-items']} */ ;
            if (row.unlocks.length === 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "muted" },
                });
                /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                (__VLS_ctx.$t('adminEconomy.unlocks.none'));
            }
            const __VLS_29 = __VLS_tryAsConstant((row.unlocks));
            for (const [u] of __VLS_vFor(__VLS_nonNull(__VLS_29))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    key: (u.type),
                    ...{ class: "unlock" },
                });
                /** @type {__VLS_StyleScopedClasses['unlock']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                (__VLS_unwrap(buildingName, {})(u.type));
                const __VLS_30 = __VLS_tryAsConstant((u.prerequisites));
                for (const [p] of __VLS_vFor(__VLS_nonNull(__VLS_30))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        key: (p.type),
                        ...{ class: "chip" },
                    });
                    /** @type {__VLS_StyleScopedClasses['chip']} */ ;
                    (__VLS_ctx.$t('adminEconomy.prereqChip', { building: __VLS_unwrap(buildingName, {})(p.type), level: p.level }));
                    // @ts-ignore
                    [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, selectedTypes, buildingName, buildingName, costSeries, timeSeries, productionSeries, paybackSeries, unlockSeries, ladder,];
                }
                // @ts-ignore
                [];
            }
            if (row.bulk) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "flag bulk-flag" },
                });
                /** @type {__VLS_StyleScopedClasses['flag']} */ ;
                /** @type {__VLS_StyleScopedClasses['bulk-flag']} */ ;
                (__VLS_ctx.$t('adminEconomy.unlocks.bulk'));
            }
            if (row.gap) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "flag gap-flag" },
                });
                /** @type {__VLS_StyleScopedClasses['flag']} */ ;
                /** @type {__VLS_StyleScopedClasses['gap-flag']} */ ;
                (__VLS_ctx.$t('adminEconomy.unlocks.gap'));
            }
            // @ts-ignore
            [$t, $t,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "panel-section" },
        });
        /** @type {__VLS_StyleScopedClasses['panel-section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('adminEconomy.pacing.title'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('adminEconomy.pacing.hint'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
            ...{ onSubmit: (run) },
            ...{ class: "inputs" },
        });
        /** @type {__VLS_StyleScopedClasses['inputs']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.legend, __VLS_intrinsics.legend)({});
        (__VLS_ctx.$t('adminEconomy.pacing.startStock'));
        const __VLS_31 = __VLS_tryAsConstant((__VLS_unwrap(RESOURCES, {})));
        for (const [r] of __VLS_vFor(__VLS_nonNull(__VLS_31))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                key: (r),
            });
            (__VLS_ctx.$t(`adminEconomy.resources.${r}`));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "number",
                min: "0",
                step: "50",
            });
            (startStock.value[r]);
            // @ts-ignore
            [$t, $t, $t, $t, RESOURCES, startStock,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.legend, __VLS_intrinsics.legend)({});
        (__VLS_ctx.$t('adminEconomy.pacing.producers'));
        const __VLS_32 = __VLS_tryAsConstant((__VLS_unwrap(producerTypes, {})));
        for (const [type] of __VLS_vFor(__VLS_nonNull(__VLS_32))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                key: (type),
            });
            (__VLS_unwrap(buildingName, {})(type));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "number",
                min: "0",
                max: "20",
                step: "1",
                'data-testid': (`producers-${type}`),
            });
            (producerCounts.value[type]);
            // @ts-ignore
            [$t, buildingName, producerTypes, producerCounts,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.legend, __VLS_intrinsics.legend)({});
        (__VLS_ctx.$t('adminEconomy.pacing.settings'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('adminEconomy.pacing.horizon'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "1",
            max: "365",
            step: "1",
        });
        (__VLS_unwrap(horizonDays, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('adminEconomy.pacing.storageCount'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "1",
            max: "10",
            step: "1",
            'data-testid': "storage-count",
        });
        (__VLS_unwrap(storageCount, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('adminEconomy.pacing.joinTime'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "time",
            'data-testid': "join-time",
        });
        (__VLS_unwrap(joinTime, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('adminEconomy.pacing.producersAhead'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "0",
            max: "30",
            step: "1",
            disabled: (__VLS_unwrap(aheadUnlimited, {})),
            'data-testid': "producers-ahead",
        });
        (__VLS_unwrap(producersAhead, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "check" },
        });
        /** @type {__VLS_StyleScopedClasses['check']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
            'data-testid': "ahead-unlimited",
        });
        (__VLS_unwrap(aheadUnlimited, {}));
        (__VLS_ctx.$t('adminEconomy.pacing.aheadUnlimited'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "check" },
        });
        /** @type {__VLS_StyleScopedClasses['check']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
            'data-testid': "feasts",
        });
        (__VLS_unwrap(feasts, {}));
        (__VLS_ctx.$t('adminEconomy.pacing.feasts'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        (__VLS_ctx.$t('adminEconomy.pacing.renownThreshold'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "number",
            min: "0",
            step: "500",
            'data-testid': "renown-threshold",
        });
        (__VLS_unwrap(renownThreshold, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted small note" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        /** @type {__VLS_StyleScopedClasses['note']} */ ;
        (__VLS_ctx.$t('adminEconomy.pacing.renownNote'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted small note" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        /** @type {__VLS_StyleScopedClasses['note']} */ ;
        (__VLS_ctx.$t('adminEconomy.pacing.settlerNote'));
        (costText(__VLS_unwrap(settlerCost, {})));
        __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.legend, __VLS_intrinsics.legend)({});
        (__VLS_ctx.$t('adminEconomy.pacing.profiles'));
        const __VLS_33 = __VLS_tryAsConstant((__VLS_unwrap(PROFILE_KEYS, {})));
        for (const [key] of __VLS_vFor(__VLS_nonNull(__VLS_33))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                key: (key),
                ...{ class: "check" },
            });
            /** @type {__VLS_StyleScopedClasses['check']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                type: "checkbox",
                value: (key),
                'data-testid': (`profile-${key}`),
            });
            (selectedProfiles.value);
            (__VLS_ctx.$t(PROFILE_LABEL.value[key]));
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, horizonDays, storageCount, joinTime, aheadUnlimited, aheadUnlimited, producersAhead, feasts, renownThreshold, settlerCost, PROFILE_KEYS, selectedProfiles, PROFILE_LABEL,];
        }
        if (selectedProfiles.value.includes('custom')) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({
                'data-testid': "custom-schedule",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.legend, __VLS_intrinsics.legend)({});
            (__VLS_ctx.$t('adminEconomy.pacing.customTitle'));
            const __VLS_34 = __VLS_tryAsConstant((__VLS_unwrap(customSessions, {})));
            for (const [s, i] of __VLS_vFor(__VLS_nonNull(__VLS_34))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (i),
                    ...{ class: "session-row" },
                });
                /** @type {__VLS_StyleScopedClasses['session-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
                (__VLS_ctx.$t('adminEconomy.pacing.sessionStart'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    type: "time",
                });
                (s.start);
                __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
                (__VLS_ctx.$t('adminEconomy.pacing.sessionMinutes'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    type: "number",
                    min: "1",
                    max: "1440",
                    step: "1",
                });
                (s.minutes);
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(!ready.value))
                                throw 0;
                            if (!(selectedProfiles.value.includes('custom')))
                                throw 0;
                            return (removeSession(i));
                            // @ts-ignore
                            [$t, $t, $t, selectedProfiles, customSessions,];
                        } },
                    type: "button",
                    ...{ class: "secondary" },
                });
                /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
                (__VLS_ctx.$t('adminEconomy.pacing.removeSession'));
                // @ts-ignore
                [$t,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (addSession) },
                type: "button",
                ...{ class: "secondary" },
                'data-testid': "add-session",
            });
            /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
            (__VLS_ctx.$t('adminEconomy.pacing.addSession'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            type: "submit",
            ...{ class: "run" },
            disabled: (running.value),
            'data-testid': "economy-run",
        });
        /** @type {__VLS_StyleScopedClasses['run']} */ ;
        (running.value ? __VLS_ctx.$t('adminEconomy.pacing.running') : __VLS_ctx.$t('adminEconomy.pacing.run'));
        if (!results.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (__VLS_ctx.$t('adminEconomy.pacing.noRun'));
        }
        else if (ranProfiles.value.length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (__VLS_ctx.$t('adminEconomy.pacing.noProfile'));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "chart-card" },
            });
            /** @type {__VLS_StyleScopedClasses['chart-card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
            (__VLS_ctx.$t('adminEconomy.pacing.chartTitle'));
            const __VLS_35 = EconomyChart;
            // @ts-ignore
            const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({
                // @ts-ignore
                series: (__VLS_unwrap(pacingSeries, {})), stepped: true, xTitle: (__VLS_ctx.$t('adminEconomy.pacing.days')), yTitle: (__VLS_ctx.$t('adminEconomy.pacing.lhLevel')),
            }));
            const __VLS_37 = __VLS_36({
                series: (__VLS_unwrap(pacingSeries, {})),
                stepped: true,
                xTitle: (__VLS_ctx.$t('adminEconomy.pacing.days')),
                yTitle: (__VLS_ctx.$t('adminEconomy.pacing.lhLevel')),
            }, ...__VLS_functionalComponentArgsRest(__VLS_36));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "table" },
                'data-testid': "milestones",
            });
            /** @type {__VLS_StyleScopedClasses['table']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                rowspan: "2",
            });
            (__VLS_ctx.$t('adminEconomy.pacing.colLevel'));
            const __VLS_40 = __VLS_tryAsConstant((ranProfiles.value));
            for (const [key] of __VLS_vFor(__VLS_nonNull(__VLS_40))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    key: (key),
                    colspan: "2",
                    ...{ class: "group" },
                });
                /** @type {__VLS_StyleScopedClasses['group']} */ ;
                (__VLS_ctx.$t(PROFILE_LABEL.value[key]));
                // @ts-ignore
                [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, PROFILE_LABEL, running, running, results, ranProfiles, ranProfiles, pacingSeries,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            const __VLS_41 = __VLS_tryAsConstant((ranProfiles.value));
            for (const [key] of __VLS_vFor(__VLS_nonNull(__VLS_41))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                    key: (key),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ class: "sub" },
                });
                /** @type {__VLS_StyleScopedClasses['sub']} */ ;
                (__VLS_ctx.$t('adminEconomy.pacing.live'));
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    ...{ class: "sub whatif" },
                });
                /** @type {__VLS_StyleScopedClasses['sub']} */ ;
                /** @type {__VLS_StyleScopedClasses['whatif']} */ ;
                (__VLS_ctx.$t('adminEconomy.pacing.whatIf'));
                // @ts-ignore
                [$t, $t, ranProfiles,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            const __VLS_42 = __VLS_tryAsConstant((__VLS_unwrap(lhLevels, {})));
            for (const [level] of __VLS_vFor(__VLS_nonNull(__VLS_42))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (`lh${level}`),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_ctx.$t('adminEconomy.pacing.levelRow', { level }));
                const __VLS_43 = __VLS_tryAsConstant((ranProfiles.value));
                for (const [key] of __VLS_vFor(__VLS_nonNull(__VLS_43))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                        key: (key),
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        'data-testid': (`lh-${level}-${key}-live`),
                    });
                    (levelText(results.value[key].live, level));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "whatif" },
                        'data-testid': (`lh-${level}-${key}-whatif`),
                    });
                    /** @type {__VLS_StyleScopedClasses['whatif']} */ ;
                    (levelText(results.value[key].whatIf, level));
                    // @ts-ignore
                    [$t, results, results, ranProfiles, lhLevels,];
                }
                // @ts-ignore
                [];
            }
            const __VLS_44 = __VLS_tryAsConstant((__VLS_unwrap(PRODUCTION_DAYS, {})));
            for (const [day] of __VLS_vFor(__VLS_nonNull(__VLS_44))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (`p${day}`),
                    ...{ class: "section-row" },
                });
                /** @type {__VLS_StyleScopedClasses['section-row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_ctx.$t('adminEconomy.pacing.production', { day }));
                const __VLS_45 = __VLS_tryAsConstant((ranProfiles.value));
                for (const [key] of __VLS_vFor(__VLS_nonNull(__VLS_45))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                        key: (key),
                    });
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        'data-testid': (`prod-${day}-${key}-live`),
                    });
                    (productionText(results.value[key].live, day));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        ...{ class: "whatif" },
                        'data-testid': (`prod-${day}-${key}-whatif`),
                    });
                    /** @type {__VLS_StyleScopedClasses['whatif']} */ ;
                    (productionText(results.value[key].whatIf, day));
                    // @ts-ignore
                    [$t, results, results, ranProfiles, PRODUCTION_DAYS,];
                }
                // @ts-ignore
                [];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                ...{ class: "section-row" },
            });
            /** @type {__VLS_StyleScopedClasses['section-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.$t('adminEconomy.pacing.secondSettlement'));
            const __VLS_46 = __VLS_tryAsConstant((ranProfiles.value));
            for (const [key] of __VLS_vFor(__VLS_nonNull(__VLS_46))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                    key: (key),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    'data-testid': (`settlement-${key}-live`),
                });
                (settlementText(results.value[key].live));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "whatif" },
                    'data-testid': (`settlement-${key}-whatif`),
                });
                /** @type {__VLS_StyleScopedClasses['whatif']} */ ;
                (settlementText(results.value[key].whatIf));
                // @ts-ignore
                [$t, results, results, ranProfiles,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.$t('adminEconomy.pacing.growthFlattens'));
            const __VLS_47 = __VLS_tryAsConstant((ranProfiles.value));
            for (const [key] of __VLS_vFor(__VLS_nonNull(__VLS_47))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                    key: (key),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    'data-testid': (`flatten-${key}-live`),
                });
                (flattenText(results.value[key].live));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "whatif" },
                    'data-testid': (`flatten-${key}-whatif`),
                });
                /** @type {__VLS_StyleScopedClasses['whatif']} */ ;
                (flattenText(results.value[key].whatIf));
                // @ts-ignore
                [$t, results, results, ranProfiles,];
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
