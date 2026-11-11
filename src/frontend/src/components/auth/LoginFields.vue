<script setup lang="ts">
// The login form shared by LoginView.vue and ReturningLoginPanel.vue: inputs,
// submit button with per-phase label and spinner, slow-server hint and error
// block. Its state (phase, slow, error) comes from the login flow store, so
// the busy/slow/error behaviour is written once; the views only pass their
// element ids/test ids and wire `submit`.
import { nextTick, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useLoginFlowStore } from '../../stores/loginFlow';
import type { MessageSchema } from '../../i18n/schema';

withDefaults(
  defineProps<{
    userNameId: string;
    passwordId: string;
    passwordTestid?: string;
    submitTestid?: string;
    errorTestid?: string;
    /** `start` keeps the button at its natural width instead of stretching. */
    align?: 'stretch' | 'start';
  }>(),
  { passwordTestid: undefined, submitTestid: undefined, errorTestid: undefined, align: 'stretch' },
);
const userName = defineModel<string>('userName', { required: true });
const password = defineModel<string>('password', { required: true });
const emit = defineEmits<{ submit: [] }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const flow = useLoginFlowStore();
const { phase, slow, error, credentialsRejected } = storeToRefs(flow);

const passwordInput = ref<HTMLInputElement | null>(null);

// The store outlives the form: an error from an attempt on another screen is
// not this form's error.
onMounted(() => {
  if (phase.value === 'idle') flow.clearError();
});

// A new error sends the player straight back to the password to retype it.
watch(
  error,
  (next) => {
    if (!next) return;
    void nextTick(() => {
      passwordInput.value?.focus();
      passwordInput.value?.select();
    });
  },
  { flush: 'post' },
);
</script>

<template>
  <form class="login-fields" @submit.prevent="emit('submit')">
    <fieldset class="fields" :disabled="phase !== 'idle'">
      <label :for="userNameId">{{ t('login.usernameLabel') }}</label>
      <input
        :id="userNameId"
        v-model="userName"
        type="text"
        autocomplete="username"
        required
        :aria-invalid="credentialsRejected || undefined"
      />

      <label :for="passwordId">{{ t('login.passwordLabel') }}</label>
      <input
        :id="passwordId"
        ref="passwordInput"
        v-model="password"
        type="password"
        autocomplete="current-password"
        required
        :aria-invalid="credentialsRejected || undefined"
        :data-testid="passwordTestid"
      />
    </fieldset>

    <p v-if="error" class="error" role="alert" :data-testid="errorTestid">{{ error }}</p>

    <button
      class="submit"
      :class="{ 'submit--start': align === 'start' }"
      type="submit"
      :disabled="phase !== 'idle'"
      :data-testid="submitTestid"
    >
      <span v-if="phase !== 'idle'" class="spinner" aria-hidden="true" />
      <template v-if="phase === 'auth'">{{ t('login.checking') }}</template>
      <template v-else-if="phase === 'restore'">{{ t('login.loadingRealm') }}</template>
      <template v-else>{{ t('login.submit') }}</template>
    </button>
    <p class="slow" aria-live="polite">{{ slow ? t('login.slow') : '' }}</p>
  </form>
</template>

<style scoped>
.login-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: none;
  margin: 0;
  padding: 0;
  min-width: 0;
}
label {
  font-size: 13px;
  color: var(--muted);
  margin-top: 8px;
}
input {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--text);
  font: inherit;
}
input[aria-invalid='true'] {
  border-color: var(--rival);
}
.error {
  color: var(--rival);
  font-size: 13px;
  margin: 4px 0 0;
}
.submit {
  margin-top: 16px;
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
.submit--start {
  align-self: flex-start;
}
.submit:disabled {
  opacity: 0.6;
  cursor: default;
}
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: login-spin 0.8s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
@keyframes login-spin {
  to {
    transform: rotate(360deg);
  }
}
/* The live region stays in the DOM so screen readers announce its text when
   it appears; while empty it cancels the form's gap so it takes no room. */
.slow {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}
.slow:empty {
  margin-top: -6px;
}
</style>
