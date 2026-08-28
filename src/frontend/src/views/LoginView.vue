<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const userName = ref('');
const password = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);

async function onSubmit() {
  if (submitting.value) return;
  submitting.value = true;
  error.value = null;

  try {
    await auth.login(userName.value, password.value);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.push(redirect);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      error.value = 'This account has been banned.';
    } else if (err instanceof ApiError && err.status === 401) {
      error.value = 'Wrong username or password.';
    } else {
      error.value = 'Could not log in. Try again.';
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login">
    <header class="topbar">
      <span class="brand">Fjørdhold</span>
    </header>
    <main class="body">
      <h1>Log in</h1>
      <form class="form" @submit.prevent="onSubmit">
        <label for="userName">Username</label>
        <input id="userName" v-model="userName" type="text" autocomplete="username" required />

        <label for="password">Password</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" required />

        <p v-if="error" class="error">{{ error }}</p>

        <button class="submit" type="submit" :disabled="submitting">
          {{ submitting ? 'Logging in…' : 'Log in' }}
        </button>
      </form>
      <button class="back" @click="router.push('/')">← Back</button>
    </main>
  </div>
</template>

<style scoped>
.login {
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
.back {
  margin-top: 20px;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 0;
}
</style>
