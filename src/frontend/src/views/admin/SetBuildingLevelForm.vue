<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, ApiError } from '../../api/client';
import type { PlacedBuildingResponse, SettlementResponse } from '../../api/types';

const props = defineProps<{ settlementId: string; buildings: PlacedBuildingResponse[] }>();
const emit = defineEmits<{ updated: [settlement: SettlementResponse] }>();

const selectedKey = ref('');
const level = ref(1);
const saving = ref(false);
const error = ref<string | null>(null);

function keyOf(building: PlacedBuildingResponse): string {
  return `${building.q},${building.r}`;
}

watch(
  () => props.buildings,
  (buildings) => {
    if (buildings.length > 0 && !buildings.some((b) => keyOf(b) === selectedKey.value)) {
      selectedKey.value = keyOf(buildings[0]);
      level.value = buildings[0].level;
    }
  },
  { immediate: true },
);

function onSelect() {
  const building = props.buildings.find((b) => keyOf(b) === selectedKey.value);
  if (building) level.value = building.level;
}

async function submit() {
  if (saving.value || !selectedKey.value) return;
  const [q, r] = selectedKey.value.split(',').map(Number);

  saving.value = true;
  error.value = null;
  try {
    const updated = await api.adminSetBuildingLevel(props.settlementId, q, r, { level: level.value });
    emit('updated', updated);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not set the building level.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="level-form" @submit.prevent="submit">
    <h3>Set building level</h3>
    <div class="fields">
      <label>
        Building
        <select v-model="selectedKey" @change="onSelect">
          <option v-for="building in buildings" :key="keyOf(building)" :value="keyOf(building)">
            {{ building.type }} ({{ building.q }}, {{ building.r }}) — level {{ building.level }}
          </option>
        </select>
      </label>
      <label>
        Level
        <input v-model.number="level" type="number" min="1" step="1" />
      </label>
    </div>
    <button type="submit" :disabled="saving || !selectedKey">{{ saving ? 'Applying…' : 'Apply' }}</button>
    <p v-if="error" class="error">{{ error }}</p>
  </form>
</template>

<style scoped>
.level-form h3 {
  margin: 0 0 12px;
  font-size: 15px;
}
.fields {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  align-items: flex-end;
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
