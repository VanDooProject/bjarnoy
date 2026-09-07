<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { usePlayerStore } from '../stores/player';
import type { MessageSchema } from '../i18n/schema';

const auth = useAuthStore();
const player = usePlayerStore();
const router = useRouter();
const route = useRoute();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const userName = ref('');
const password = ref('');
const confirmPassword = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);

async function onSubmit() {
  if (submitting.value) return;
  error.value = null;

  if (password.value !== confirmPassword.value) {
    error.value = t('register.errors.passwordMismatch');
    return;
  }

  submitting.value = true;
  try {
    // Passing the local player id lets the backend claim any settlement
    // still founded under it (AuthService.RegisterAsync's claim loop) — an
    // anonymous player who registers keeps the settlement they already
    // built instead of starting over.
    await auth.register(userName.value, password.value, player.id);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.push(redirect);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      error.value = t('register.errors.usernameTaken');
    } else if (err instanceof ApiError && err.status === 400) {
      error.value = t('register.errors.validation');
    } else {
      error.value = t('register.errors.generic');
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="register">
    <header class="topbar">
      <span class="brand">{{ t('register.brand') }}</span>
    </header>
    <main class="body">
      <h1>{{ t('register.title') }}</h1>
      <p class="hint">
        {{ t('register.hint') }}
      </p>
      <form class="form" @submit.prevent="onSubmit">
        <label for="userName">{{ t('register.usernameLabel') }}</label>
        <input
          id="userName"
          v-model="userName"
          type="text"
          autocomplete="username"
          minlength="3"
          maxlength="50"
          required
        />

        <label for="password">{{ t('register.passwordLabel') }}</label>
        <input
          id="password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="200"
          required
        />

        <label for="confirmPassword">{{ t('register.confirmPasswordLabel') }}</label>
        <input
          id="confirmPassword"
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="200"
          required
        />

        <p v-if="error" class="error">{{ error }}</p>

        <button class="submit" type="submit" :disabled="submitting">
          {{ submitting ? t('register.submitting') : t('register.submit') }}
        </button>
      </form>
      <button class="link" @click="router.push({ path: '/login', query: route.query })">
        {{ t('register.loginLink') }}
      </button>
      <button class="back" @click="router.push('/')">{{ t('register.back') }}</button>
    </main>
  </div>
</template>

<style scoped>
.register {
  width: 100vw;
  height: 100vh;
  overflow: auto;
  background: var(--shell);
}
.topbar {
  padding: 20px 28px;
}
.brand {
  font-weight: 600;
  font-size: 20px;
  color: var(--text);
}
.body {
  max-width: 40ch;
  margin: 0 auto;
  padding: 24px 28px 60px;
  color: var(--text);
}
.hint {
  color: var(--muted);
  font-size: 13px;
  margin: 8px 0 0;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 20px;
}
.form label {
  font-size: 13px;
  color: var(--muted);
  margin-top: 8px;
}
.form input {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--text);
  font: inherit;
}
.error {
  color: var(--rival);
  font-size: 13px;
  margin: 4px 0 0;
}
.submit {
  margin-top: 16px;
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-weight: 600;
  cursor: pointer;
}
.submit:disabled {
  opacity: 0.6;
  cursor: default;
}
.link {
  margin-top: 20px;
  background: none;
  border: none;
  color: var(--gold);
  cursor: pointer;
  padding: 0;
  display: block;
  font: inherit;
}
.back {
  margin-top: 12px;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 0;
}
</style>
