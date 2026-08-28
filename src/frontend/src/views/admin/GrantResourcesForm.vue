<script setup lang="ts">
import { reactive, ref } from 'vue';
import { api, ApiError } from '../../api/client';
import type { SettlementResponse } from '../../api/types';

const props = defineProps<{ settlementId: string }>();
const emit = defineEmits<{ granted: [settlement: SettlementResponse] }>();

// Signed deltas: a negative value removes resources (see GrantResourcesRequest).
const deltas = reactive({ wood: 0, stone: 0, food: 0, iron: 0 });
const saving = ref(false);
const error = ref<string | null>(null);

async function submit() {
  if (saving.value) return;
  saving.value = true;
  error.value = null;
  try {
    const updated = await api.adminGrantResources(props.settlementId, { ...deltas });
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
</style>
