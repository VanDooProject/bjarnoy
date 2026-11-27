<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import type { GarrisonSpotResponse, SettlementResponse, UnitStackResponse } from '../../api/types';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import type { MessageSchema } from '../../i18n/schema';
import { useUnsavedInput } from '../../composables/useUnsavedInput';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// Troop creation via admin (issue #105): units land straight in the garrison,
// free of cost and training time, and are ordinary units from then on —
// dispatchable, feedable, starvable.
const props = defineProps<{ settlementId: string; garrison: UnitStackResponse[]; spots: GarrisonSpotResponse[] }>();
const emit = defineEmits<{ changed: [settlement: SettlementResponse] }>();

const catalogue = useUnitCatalogueStore();
void catalogue.load();

const unit = ref('');
const count = ref(10);
useUnsavedInput(() => count.value !== 10);
// The garrison spot the units are created at or removed from, as "q,r"; the longhouse (listed first) until another is picked.
const spot = ref('');
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

watch(
  () => props.spots,
  (spots) => {
    if (!spots.some((s) => spotKey(s) === spot.value)) spot.value = spots[0] ? spotKey(spots[0]) : '';
  },
  { immediate: true },
);

function spotKey(s: { q: number; r: number }): string {
  return `${s.q},${s.r}`;
}

async function submit(sign: 1 | -1) {
  if (saving.value || !unit.value || !spot.value) return;
  const [q, r] = spot.value.split(',').map(Number);

  saving.value = true;
  error.value = null;
  try {
    const updated = await api.adminAdjustGarrison(props.settlementId, {
      unit: unit.value,
      spot: { q, r },
      count: sign * Math.abs(count.value),
    });
    emit('changed', updated);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : t('garrisonForm.changeError');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="garrison-form" @submit.prevent="submit(1)">
    <h3>{{ $t('garrisonForm.title') }}</h3>

    <p class="standing">
      <template v-if="garrison.length === 0">{{ $t('garrisonForm.empty') }}</template>
      <template v-else>
        <span v-for="stack in garrison" :key="stack.unit" class="stack">
          {{ stack.unit }} {{ stack.count }}
        </span>
      </template>
    </p>

    <div class="fields">
      <label>
        {{ $t('garrisonForm.unit') }}
        <select v-model="unit">
          <option v-for="name in options" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label>
        {{ $t('garrisonForm.spot') }}
        <select v-model="spot" class="spot-select">
          <option v-for="s in spots" :key="spotKey(s)" :value="spotKey(s)">
            {{ $t(`garrisonForm.spots.${s.kind}`) }} {{ s.q }},{{ s.r }}
          </option>
        </select>
      </label>
      <label>
        {{ $t('garrisonForm.count') }}
        <input v-model.number="count" type="number" min="1" step="1" />
      </label>
    </div>

    <div class="actions">
      <button type="submit" :disabled="saving || !unit || !spot">
        {{ saving ? $t('garrisonForm.working') : $t('garrisonForm.create') }}
      </button>
      <button type="button" class="danger" :disabled="saving || !unit || !spot" @click="submit(-1)">
        {{ $t('garrisonForm.remove') }}
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="options.length === 0" class="hint">{{ $t('garrisonForm.loadingRoster') }}</p>
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
