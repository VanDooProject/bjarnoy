<script setup lang="ts" generic="T extends string | number">
// One row of pill buttons under a docs entry (a look, a stage, a facing).
defineProps<{
  label: string;
  options: { value: T; label: string }[];
  modelValue: T;
}>();
defineEmits<{ 'update:modelValue': [value: T] }>();
</script>

<template>
  <div class="variants">
    <span class="variants-label">{{ label }}</span>
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="variant-button"
      :class="{ active: modelValue === option.value }"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.variants {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 12px;
}
.variants-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-right: 4px;
}
.variant-button {
  background: var(--panel, #1c1710);
  border: 1px solid var(--panel-border);
  color: var(--muted);
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.variant-button:hover {
  color: var(--text);
  border-color: var(--gold);
}
.variant-button.active {
  color: #20160a;
  background: var(--gold);
  border-color: var(--gold);
}
</style>
