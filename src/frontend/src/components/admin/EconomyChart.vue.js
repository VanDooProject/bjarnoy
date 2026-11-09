/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Thin vue-chartjs wrapper for the economy lab: numeric x axis, any number of
// series, optional logarithmic y. Props in, chart out — no data logic here.
import { computed } from 'vue';
import { Bar, Line } from 'vue-chartjs';
import { BarController, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineController, LineElement, LogarithmicScale, PointElement, Tooltip, } from 'chart.js';
const { defineProps, withDefaults, } = {};
ChartJS.register(LineController, BarController, BarElement, CategoryScale, LinearScale, LogarithmicScale, PointElement, LineElement, Tooltip, Legend);
const props = withDefaults(defineProps(), { kind: 'line', xTitle: '', yTitle: '', logY: false, integerX: false, stepped: false, legend: true });
const lineData = computed(() => ({
    datasets: props.series.map((s) => ({
        label: s.label,
        data: s.points,
        borderColor: s.color,
        backgroundColor: s.color,
        pointRadius: props.stepped ? 0 : s.dashed ? 2 : 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        borderDash: s.dashed ? [6, 4] : [],
        tension: 0,
        stepped: props.stepped ? 'before' : false,
        spanGaps: false,
    })),
}));
const barData = computed(() => {
    const xs = [...new Set(props.series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
    return {
        labels: xs.map(String),
        datasets: props.series.map((s) => ({
            label: s.label,
            data: xs.map((x) => s.points.find((p) => p.x === x)?.y ?? 0),
            backgroundColor: s.color,
            ...(s.dashed ? { borderColor: s.color, borderWidth: 1, borderDash: [4, 3] } : {}),
        })),
    };
});
const scaleTitle = (text) => ({ display: text !== '', text });
const lineOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: { legend: { display: props.legend, labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 } } },
    scales: {
        x: {
            type: 'linear',
            title: scaleTitle(props.xTitle),
            ticks: props.integerX ? { stepSize: 1, precision: 0 } : {},
            grid: { display: false },
        },
        y: {
            type: props.logY ? 'logarithmic' : 'linear',
            title: scaleTitle(props.yTitle),
            beginAtZero: !props.logY,
        },
    },
}));
const barOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: props.legend, labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 } } },
    scales: {
        x: { title: scaleTitle(props.xTitle), grid: { display: false } },
        y: { title: scaleTitle(props.yTitle), beginAtZero: true, ticks: { precision: 0, stepSize: 1 } },
    },
}));
const __VLS_defaults = { kind: 'line', xTitle: '', yTitle: '', logY: false, integerX: false, stepped: false, legend: true };
void __VLS_defaults;
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
        ...{ class: "economy-chart" },
    });
    /** @type {__VLS_StyleScopedClasses['economy-chart']} */ ;
    if (__VLS_ctx.kind === 'bar') {
        let __VLS_0;
        /** @ts-ignore @type { | typeof Bar} */
        Bar;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            data: (__VLS_unwrap(barData, {})), options: (__VLS_unwrap(barOptions, {})),
        }));
        const __VLS_2 = __VLS_1({
            data: (__VLS_unwrap(barData, {})),
            options: (__VLS_unwrap(barOptions, {})),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    }
    else {
        let __VLS_5;
        /** @ts-ignore @type { | typeof Line} */
        Line;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
            // @ts-ignore
            data: (__VLS_unwrap(lineData, {})), options: (__VLS_unwrap(lineOptions, {})),
        }));
        const __VLS_7 = __VLS_6({
            data: (__VLS_unwrap(lineData, {})),
            options: (__VLS_unwrap(lineOptions, {})),
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    }
    // @ts-ignore
    [kind, barData, barOptions, lineData, lineOptions,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
