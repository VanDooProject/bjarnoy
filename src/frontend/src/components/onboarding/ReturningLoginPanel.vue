<script setup lang="ts">
// Player logout/login gate: shown in place of the founding hero
// (LandingView.vue) when this device remembers an account
// (`player.lastAccount`, set by `forgetLocalIdentity` on logout) but the
// visitor is currently anonymous and hasn't founded anything yet — logging
// out drops the local identity that let them found without an account, so
// simply landing back on the founding hero would let them start a brand new
// (throwaway) realm without ever noticing their real one is still there.
// Submitting reuses the same shared login logic LoginView.vue uses
// (useLoginForm) so 403/401 handling and post-login realm restoration stay
// in one place.
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { usePlayerStore } from '../../stores/player';
import { useLoginForm } from '../../composables/useLoginForm';
import type { MessageSchema } from '../../i18n/schema';

const player = usePlayerStore();
const router = useRouter();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const { userName, password, submitting, error, login, restoreRealmIfAny } = useLoginForm();

// Prefilled from `lastAccount` but still editable — the device might be
// shared, or the visitor might actually want a different account's login
// form rather than the one this browser last remembered.
userName.value = player.lastAccount ?? '';

async function onSubmit() {
  if (!(await login(userName.value, password.value))) return;
  await restoreRealmIfAny();
  await router.push('/');
}

// "Start a new realm instead": declines the gate — forgetting `lastAccount`
// makes this panel stop showing (LandingView's own gate condition), so the
// normal founding hero reappears underneath.
function startNewRealm() {
  player.forgetLastAccount();
}
</script>

<template>
  <div class="returning-login" data-testid="returning-login-panel">
    <div class="eyebrow">{{ t('onboarding.returningLogin.eyebrow') }}</div>
    <h1>{{ t('onboarding.returningLogin.title', { name: player.lastAccount }) }}</h1>
    <p class="lede">{{ t('onboarding.returningLogin.body') }}</p>
    <form class="form" @submit.prevent="onSubmit">
      <label for="returning-login-username">{{ t('login.usernameLabel') }}</label>
      <input id="returning-login-username" v-model="userName" type="text" autocomplete="username" required />

      <label for="returning-login-password">{{ t('login.passwordLabel') }}</label>
      <input
        id="returning-login-password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        required
        data-testid="returning-login-password"
      />

      <p v-if="error" class="status error" data-testid="returning-login-error">{{ error }}</p>

      <button class="submit" type="submit" :disabled="submitting" data-testid="returning-login-submit">
        {{ submitting ? t('login.submitting') : t('login.submit') }}
      </button>
    </form>
    <button type="button" class="new-realm" data-testid="returning-login-new-realm" @click="startNewRealm">
      {{ t('onboarding.returningLogin.newRealm') }}
    </button>
  </div>
</template>

<style scoped>
/* Deliberately its own copy of LandingView's `.hero` box geometry (it
   replaces that block 1:1 there) rather than reusing its class — Vue's
   scoped CSS is per-component, so a shared class name alone wouldn't carry
   the styling across. Unlike the copy-only hero, this one is NOT
   `pointer-events: none` — it has real inputs/buttons to click. */
.returning-login {
  position: absolute;
  left: 56px;
  top: 30%;
  max-width: 520px;
  z-index: 5;
}
.eyebrow {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gold);
}
h1 {
  margin: 18px 0 0;
  font-size: clamp(28px, 3.6vw, 44px);
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--text);
}
.lede {
  margin: 14px 0 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--muted);
  max-width: 42ch;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 20px;
  max-width: 320px;
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
}
.submit {
  margin-top: 16px;
  align-self: flex-start;
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
.new-realm {
  margin-top: 16px;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 0;
  display: block;
  font: inherit;
  text-decoration: underline;
}
.new-realm:hover {
  color: var(--text);
}
</style>
