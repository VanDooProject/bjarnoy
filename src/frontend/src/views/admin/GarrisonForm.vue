<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '../../api/client';
import type { SettlementResponse, UnitStackResponse } from '../../api/types';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';

// Troop creation via admin (issue #105): units land straight in the garrison,
// free of cost and training time, and are ordinary units from then on —
// dispatchable, feedable, starvable.
const props = defineProps<{ settlementId: string; garrison: UnitStackResponse[] }>();
const emit = defineEmits<{ changed: [settlement: SettlementResponse] }>();

const catalogue = useUnitCatalogueStore();
void catalogue.load();

const unit = ref('');
const count = ref(10);
const saving = ref(false);
const error = ref<string | null>(null);

const unitNames = computed(() => catalogue.definitions.map((d) => d.type));

// The catalogue arrives asynchronously; until it does, fall back to whatever
// already stands in this garrison so the form is never empty-and-unusable.
const options = computed(() =>
  unitNames.value.length > 0 ? unitNames.value : props.garrison.map((s) => s.unit),
);

// The catalogue lands after mount, so the selection is made when the options
// first exist rather than at setup — otherwise the select renders with a value
// the model does not hold.
watch(
  options,
  (available) => {
    if (!available.includes(unit.value)) unit.value = available[0] ?? '';
  },
  { immediate: true },
);

async function submit(sign: 1 | -1) {
  if (saving.value || !unit.value) return;

  saving.value = true;
  error.value = null;
  try {
    const updated = await api.adminAdjustGarrison(props.settlementId, {
      unit: unit.value,
      count: sign * Math.abs(count.value),
    });
    emit('changed', updated);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not change the garrison.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="garrison-form" @submit.prevent="submit(1)">
    <h3>Create troops</h3>

    <p class="standing">
      <template v-if="garrison.length === 0">Garrison empty.</template>
      <template v-else>
        <span v-for="stack in garrison" :key="stack.unit" class="stack">
          {{ stack.unit }} {{ stack.count }}
        </span>
      </template>
    </p>

    <div class="fields">
      <label>
        Unit
        <select v-model="unit">
          <option v-for="name in options" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label>
        Count
        <input v-model.number="count" type="number" min="1" step="1" />
      </label>
    </div>

    <div class="actions">
      <button type="submit" :disabled="saving || !unit">{{ saving ? 'Working…' : 'Create' }}</button>
      <button type="button" class="danger" :disabled="saving || !unit" @click="submit(-1)">Remove</button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="options.length === 0" class="hint">Loading the unit roster…</p>
  </form>
</template>

<style scoped>
.garrison-form h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
.standing {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--muted);
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.fields {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-end;
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
  width: 80px;
}
.actions {
  display: flex;
  gap: 8px;
}
input,
select {
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
button.danger {
  background: var(--rival);
  color: #fff;
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
.hint {
  color: var(--muted);
  font-size: 13px;
  margin-top: 8px;
}
</style>
