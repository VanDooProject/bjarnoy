<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { WorldReviewFinding, WorldReviewResponse } from '../../api/types';
import {
  filterFindings,
  findingKey,
  summaryRows,
  visibleFindings,
  type SeverityFilter,
} from '../../views/admin/worldReview';

// The world review of a candidate seed (AdminWorldReseedView): its summary counts and the findings table. Clicking a
// finding emits `select`, which the view answers by centring the preview map on the finding's hex.
const props = defineProps<{ review: WorldReviewResponse; selected?: WorldReviewFinding | null }>();
const emit = defineEmits<{ select: [finding: WorldReviewFinding] }>();

const filter = ref<SeverityFilter>('all');
const showAll = ref(false);

// A new review (another seed) starts from the top again.
watch(
  () => props.review,
  () => {
    filter.value = 'all';
    showAll.value = false;
  },
);

const filtered = computed(() => filterFindings(props.review.findings, filter.value));
const rows = computed(() => visibleFindings(filtered.value, showAll.value));
const summary = computed(() => summaryRows(props.review.summary));

const FILTERS: { value: SeverityFilter; labelKey: 'filterAll' | 'filterError' | 'filterWarn' | 'filterInfo' }[] = [
  { value: 'all', labelKey: 'filterAll' },
  { value: 'error', labelKey: 'filterError' },
  { value: 'warn', labelKey: 'filterWarn' },
  { value: 'info', labelKey: 'filterInfo' },
];
</script>

<template>
  <section class="review" data-testid="world-review">
    <h2>{{ $t('adminWorldReview.heading') }}</h2>
    <p class="hint">{{ $t('adminWorldReview.hint') }}</p>

    <div class="badges">
      <span class="badge error" data-testid="review-errors">{{ $t('adminWorldReview.errors', { count: review.summary.errors }) }}</span>
      <span class="badge warn" data-testid="review-warnings">{{ $t('adminWorldReview.warnings', { count: review.summary.warnings }) }}</span>
      <span class="badge info" data-testid="review-infos">{{ $t('adminWorldReview.infos', { count: review.summary.infos }) }}</span>
    </div>

    <dl class="summary">
      <template v-for="row in summary" :key="row.key">
        <dt>{{ $t(`adminWorldReview.${row.key}`) }}</dt>
        <dd :class="{ flagged: row.flagged }" :data-testid="`review-${row.key}`">{{ row.value }}</dd>
      </template>
    </dl>

    <div class="filter">
      <label for="review-filter">{{ $t('adminWorldReview.filterLabel') }}</label>
      <select id="review-filter" v-model="filter" data-testid="review-filter">
        <option v-for="f in FILTERS" :key="f.value" :value="f.value">{{ $t(`adminWorldReview.${f.labelKey}`) }}</option>
      </select>
    </div>

    <p v-if="filtered.length === 0" class="empty" data-testid="review-empty">{{ $t('adminWorldReview.noFindings') }}</p>
    <div v-else class="table-wrap">
      <table class="findings">
        <thead>
          <tr>
            <th>{{ $t('adminWorldReview.colSeverity') }}</th>
            <th>{{ $t('adminWorldReview.colKind') }}</th>
            <th>{{ $t('adminWorldReview.colIsland') }}</th>
            <th>{{ $t('adminWorldReview.colMessage') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(f, i) in rows"
            :key="findingKey(f, i)"
            class="finding"
            :class="{ selected: selected === f }"
            data-testid="review-finding"
            tabindex="0"
            @click="emit('select', f)"
            @keydown.enter="emit('select', f)"
          >
            <td><span class="sev" :class="f.severity">{{ $t(`adminWorldReview.severity.${f.severity}`) }}</span></td>
            <td>{{ $t(`adminWorldReview.kind.${f.kind}`) }}</td>
            <td class="num">{{ f.island }}</td>
            <td>{{ f.message }} <span class="hex">({{ f.q }}, {{ f.r }})</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!showAll && filtered.length > rows.length" class="more">
      {{ $t('adminWorldReview.showingFirst', { shown: rows.length, total: filtered.length }) }}
      <button class="secondary" data-testid="review-show-all" @click="showAll = true">{{ $t('adminWorldReview.showAll') }}</button>
    </p>
  </section>
</template>

<style scoped>
.review {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.review h2 {
  margin: 0 0 4px;
  font-size: 16px;
}
.hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--muted);
}
.badges {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.badge {
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 10px;
  border: 1px solid var(--panel-border);
}
.badge.error,
.sev.error {
  color: var(--rival);
}
.badge.warn,
.sev.warn {
  color: var(--gold);
}
.badge.info,
.sev.info {
  color: var(--muted);
}
.summary {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 12px;
  margin: 0 0 12px;
  font-size: 12px;
}
.summary dt {
  color: var(--muted);
}
.summary dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.summary dd.flagged {
  color: var(--gold);
  font-weight: 600;
}
.filter {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  margin-bottom: 8px;
}
.filter label {
  color: var(--muted);
}
.table-wrap {
  overflow: auto;
  min-height: 0;
  flex: 1;
}
.findings {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.findings th {
  text-align: left;
  color: var(--muted);
  font-weight: 500;
  position: sticky;
  top: 0;
  background: var(--panel-bg);
  padding: 4px 6px;
}
.findings td {
  padding: 4px 6px;
  border-top: 1px solid var(--panel-border);
  vertical-align: top;
}
.finding {
  cursor: pointer;
}
.finding:hover,
.finding:focus-visible,
.finding.selected {
  background: rgba(255, 197, 92, 0.12);
  outline: none;
}
.sev {
  font-weight: 600;
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.hex {
  color: var(--muted);
}
.empty,
.more {
  font-size: 12px;
  color: var(--muted);
}
button.secondary {
  background: none;
  border: 1px solid var(--panel-border);
  color: var(--text);
  border-radius: 8px;
  padding: 2px 10px;
  cursor: pointer;
}
</style>
