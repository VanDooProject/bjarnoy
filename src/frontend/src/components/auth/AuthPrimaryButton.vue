<script setup lang="ts">
// The gold primary button of the login surfaces (LoginFields' submit, the
// returning-login panel's "Start a realm here"): one style, written once.
withDefaults(defineProps<{ type?: 'button' | 'submit'; disabled?: boolean }>(), {
  type: 'button',
  disabled: false,
});
</script>

<template>
  <button class="auth-primary" :type="type" :disabled="disabled"><slot /></button>
</template>

<style scoped>
.auth-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-weight: 600;
  cursor: pointer;
}
.auth-primary:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
