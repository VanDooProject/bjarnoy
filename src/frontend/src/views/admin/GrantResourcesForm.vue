<script setup lang="ts">
import { reactive, ref } from 'vue';
import { api, ApiError } from '../../api/client';
import type { ResourceLine, SettlementResponse } from '../../api/types';

// Issue #98: `before` is the settlement's stock *before* this grant — needed
// to tell a clamped grant (hit storage capacity) apart from one that fully
// applied, since the response alone doesn't say what was requested.
const props = defineProps<{ settlementId: string; before: ResourceLine }>();
const emit = defineEmits<{ granted: [settlement: SettlementResponse] }>();

// Signed deltas: a negative value removes resources (see GrantResourcesRequest).
const deltas = reactive({ wood: 0, stone: 0, food: 0, iron: 0 });
const saving = ref(false);
const error = ref<string | null>(null);
// Issue #98: a positive grant that `ResourcePool.Adjust` clamped to capacity
// server-side used to apply silently, making the admin think most of a
// grant "vanished". Report each clamped resource line instead.
const clampNotice = ref<string | null>(null);

async function submit() {
  if (saving.value) return;
  saving.value = true;
  error.value = null;
  clampNotice.value = null;
  try {
    const requested = { ...deltas };
    const before = { ...props.before };
    const updated = await api.adminGrantResources(props.settlementId, requested);

    const clamped: string[] = [];
    for (const key of Object.keys(requested) as (keyof typeof requested)[]) {
      const requestedDelta = requested[key];
      if (requestedDelta <= 0) continue; // capacity only clamps grants, not removals
      const actualDelta = updated.resources.stock[key] - before[key];
      if (actualDelta < requestedDelta - 0.5) {
        clamped.push(
          `${key}: granted ${Math.floor(actualDelta)} of ${requestedDelta} — storage full at ${Math.floor(updated.resources.capacity[key])}`,
        );
      }
    }
    clampNotice.value = clamped.length > 0 ? clamped.join('; ') : null;

    emit('granted', updated);
    deltas.wood = 0;
    deltas.stone = 0;
    deltas.food = 0;
    deltas.iron = 0;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not grant resources.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="grant-form" @submit.prevent="submit">
    <h3>Grant resources</h3>
    <p class="hint">Positive adds, negative removes. A removal never takes stock below zero.</p>
    <div class="fields">
      <label>
        Wood
        <input v-model.number="deltas.wood" type="number" step="1" />
      </label>
      <label>
        Stone
        <input v-model.number="deltas.stone" type="number" step="1" />
      </label>
      <label>
        Food
        <input v-model.number="deltas.food" type="number" step="1" />
      </label>
      <label>
        Iron
        <input v-model.number="deltas.iron" type="number" step="1" />
      </label>
    </div>
    <button type="submit" :disabled="saving">{{ saving ? 'Applying…' : 'Apply' }}</button>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="clampNotice" class="clamp-notice">{{ clampNotice }}</p>
  </form>
</template>

<style scoped>
.grant-form h3 {
  margin: 0 0 4px;
  font-size: 15px;
}
.hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--muted);
}
.fields {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.fields label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}
.fields input {
  width: 100px;
}
input {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--text);
}
button {
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.error {
  color: var(--rival);
  font-size: 13px;
  margin-top: 8px;
}
.clamp-notice {
  color: var(--gold);
  font-size: 13px;
  margin-top: 8px;
}
</style>
