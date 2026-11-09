/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Thin wrapper around vue-chartjs's <Line> — props in, chart out. No data
// fetching here; AdminActivityView owns the fetch and passes buckets down.
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import { useI18n } from 'vue-i18n';
import { CategoryScale, Chart as ChartJS, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip, } from 'chart.js';
const { defineProps, } = {};
const { t } = useI18n({ useScope: 'global' });
// Only register what this single chart actually uses — not `...registerables`.
ChartJS.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
const props = defineProps();
function formatLabel(iso) {
    const date = new Date(iso);
    if (props.bucketUnit === 'hour') {
        return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' });
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const chartData = computed(() => ({
    labels: props.buckets.map((b) => formatLabel(b.bucketStart)),
    datasets: [
        {
            label: t('adminActivityChart.activeUsers'),
            data: props.buckets.map((b) => b.activeUserCount),
            borderColor: '#ffc55c',
            backgroundColor: 'rgba(255, 197, 92, 0.2)',
            pointRadius: 2,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: true,
        },
    ],
}));
const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
    },
    scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
    },
};
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
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "activity-chart" },
    });
    /** @type {__VLS_StyleScopedClasses['activity-chart']} */ ;
    if (__VLS_ctx.buckets.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "empty" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        (__VLS_ctx.$t('adminActivityChart.empty'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "canvas-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['canvas-wrap']} */ ;
        let __VLS_0;
        /** @ts-ignore @type { | typeof Line} */
        Line;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            data: (__VLS_unwrap(chartData, {})), options: (__VLS_unwrap(chartOptions, {})),
        }));
        const __VLS_2 = __VLS_1({
            data: (__VLS_unwrap(chartData, {})),
            options: (__VLS_unwrap(chartOptions, {})),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    }
    // @ts-ignore
    [buckets, $t, chartData, chartOptions,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
