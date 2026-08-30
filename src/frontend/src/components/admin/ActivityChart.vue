<script setup lang="ts">
// Thin wrapper around vue-chartjs's <Line> — props in, chart out. No data
// fetching here; AdminActivityView owns the fetch and passes buckets down.
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { ActivityBucket } from '../../api/types';

// Only register what this single chart actually uses — not `...registerables`.
ChartJS.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const props = defineProps<{
  buckets: ActivityBucket[];
  /** Controls label granularity — 'hour' shows a time-of-day, 'day' doesn't. */
  bucketUnit?: 'day' | 'hour';
}>();

function formatLabel(iso: string): string {
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
      label: 'Active users',
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
</script>

<template>
  <div class="activity-chart">
    <p v-if="buckets.length === 0" class="empty">No activity data for this range.</p>
    <div v-else class="canvas-wrap">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<style scoped>
.activity-chart {
  width: 100%;
}
.canvas-wrap {
  position: relative;
  height: 260px;
}
.empty {
  color: var(--muted);
  font-size: 14px;
}
</style>
