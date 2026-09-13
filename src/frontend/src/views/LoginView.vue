<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useWorldStore } from '../stores/world';
import type { MessageSchema } from '../i18n/schema';
import LocaleSwitcher from '../components/LocaleSwitcher.vue';

const auth = useAuthStore();
const world = useWorldStore();
const router = useRouter();
const route = useRoute();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const userName = ref('');
const password = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);

// Login↔world linkage (docs/plans/returning-player-world-switching.md):
// arriving here from ReturningPlayerMenu.vue's "Log in" link, in the
// context of a specific world, carries that world along so this page can
// found/return to it immediately after authenticating instead of dropping
// back to a generic landing page. `worldName` rides along in the query too
// (see that component's own comment) purely for display here — no second
// API round-trip needed just to show a name.
const linkedWorldId = computed(() => (typeof route.query.worldId === 'string' ? route.query.worldId : null));
const linkedWorldName = computed(() => (typeof route.query.worldName === 'string' ? route.query.worldName : null));

async function onSubmit() {
  if (submitting.value) return;
  submitting.value = true;
  error.value = null;

  try {
    await auth.login(userName.value, password.value);
    if (linkedWorldId.value) {
      // Same mechanism WorldPickerView.vue's own `joinOrReturn` uses: joins
      // (or returns to) the linked world, then lands in the
      // founding/settlement flow for it.
      await world.joinWorld(linkedWorldId.value);
      await router.push('/');
    } else {
      const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
      await router.push(redirect);
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      error.value = t('login.errors.banned');
    } else if (err instanceof ApiError && err.status === 401) {
      error.value = t('login.errors.invalidCredentials');
    } else {
      error.value = t('login.errors.generic');
    }
  } finally {
    submitting.value = false;
  }
}

// Lets the Aspire dashboard's "Log in as admin" dev-only link carry the
// generated bootstrap credentials straight through as a one-click login,
// instead of a dev having to copy a username/password out of the dashboard
// and paste them in by hand.
onMounted(() => {
  const queryUserName = route.query.username;
  const queryPassword = route.query.password;
  if (typeof queryUserName === 'string' && typeof queryPassword === 'string') {
    userName.value = queryUserName;
    password.value = queryPassword;
    void onSubmit();
  }
});
</script>

<template>
  <div class="login">
    <header class="topbar">
      <span class="brand">{{ t('login.brand') }}</span>
      <LocaleSwitcher />
    </header>
    <main class="body">
      <h1>{{ t('login.title') }}</h1>
      <p v-if="linkedWorldId" class="world-linked">
        {{
          linkedWorldName
            ? t('login.continueInWorld', { worldName: linkedWorldName })
            : t('login.continueInWorldGeneric')
        }}
      </p>
      <form class="form" @submit.prevent="onSubmit">
        <label for="userName">{{ t('login.usernameLabel') }}</label>
        <input id="userName" v-model="userName" type="text" autocomplete="username" required />

        <label for="password">{{ t('login.passwordLabel') }}</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" required />

        <p v-if="error" class="error">{{ error }}</p>

        <button class="submit" type="submit" :disabled="submitting">
          {{ submitting ? t('login.submitting') : t('login.submit') }}
        </button>
      </form>
      <button class="link" @click="router.push({ path: '/register', query: route.query })">
        {{ t('login.registerLink') }}
      </button>
      <button class="back" @click="router.push('/')">{{ t('login.back') }}</button>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
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
.world-linked {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.4;
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
