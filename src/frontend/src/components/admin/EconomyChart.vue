<script setup lang="ts">
// Thin vue-chartjs wrapper for the economy lab: numeric x axis, any number of
// series, optional logarithmic y. Props in, chart out — no data logic here.
import { computed } from 'vue';
import { Bar, Line } from 'vue-chartjs';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  LogarithmicScale,
  PointElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(
  LineController,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

export interface EconomySeries {
  label: string;
  color: string;
  /** Draw dashed: the what-if twin of a live series. */
  dashed?: boolean;
  /** Points; a null y leaves a gap. */
  points: { x: number; y: number | null }[];
}

const props = withDefaults(
  defineProps<{
    kind?: 'line' | 'bar';
    series: EconomySeries[];
    xTitle?: string;
    yTitle?: string;
    logY?: boolean;
    /** Force whole-number x ticks (levels). */
    integerX?: boolean;
    /** Render x tick labels as days from minutes-derived days already; callback-free. */
    stepped?: boolean;
    legend?: boolean;
  }>(),
  { kind: 'line', xTitle: '', yTitle: '', logY: false, integerX: false, stepped: false, legend: true },
);

const lineData = computed(() => ({
  datasets: props.series.map((s) => ({
    label: s.label,
    data: s.points as unknown as { x: number; y: number }[],
    borderColor: s.color,
    backgroundColor: s.color,
    pointRadius: props.stepped ? 0 : s.dashed ? 2 : 3,
    pointHoverRadius: 5,
    borderWidth: 2,
    borderDash: s.dashed ? [6, 4] : [],
    tension: 0,
    stepped: props.stepped ? ('before' as const) : false,
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

const scaleTitle = (text: string) => ({ display: text !== '', text });

const lineOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'nearest' as const, intersect: false },
  plugins: { legend: { display: props.legend, labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 } } },
  scales: {
    x: {
      type: 'linear' as const,
      title: scaleTitle(props.xTitle),
      ticks: props.integerX ? { stepSize: 1, precision: 0 } : {},
      grid: { display: false },
    },
    y: {
      type: props.logY ? ('logarithmic' as const) : ('linear' as const),
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
</script>

<template>
  <div class="economy-chart">
    <Bar v-if="kind === 'bar'" :data="barData" :options="barOptions" />
    <Line v-else :data="lineData" :options="lineOptions" />
  </div>
</template>

<style scoped>
.economy-chart {
  position: relative;
  height: 280px;
  width: 100%;
}
</style>
