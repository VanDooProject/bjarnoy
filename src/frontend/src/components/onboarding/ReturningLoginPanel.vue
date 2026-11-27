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
import { useLoginFlowStore } from '../../stores/loginFlow';
import { useWorldStore } from '../../stores/world';
import LoginFields from '../auth/LoginFields.vue';
import AuthPrimaryButton from '../auth/AuthPrimaryButton.vue';
import { useUnsavedInput } from '../../composables/useUnsavedInput';
import type { MessageSchema } from '../../i18n/schema';

const player = usePlayerStore();
const world = useWorldStore();
const flow = useLoginFlowStore();
const router = useRouter();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const { userName, password, submit, restoreRealmIfAny } = useLoginForm();

// Prefilled from `lastAccount` but still editable — the device might be
// shared, or the visitor might actually want a different account's login
// form rather than the one this browser last remembered.
userName.value = player.lastAccount ?? '';
// The prefilled account name alone is not input worth keeping.
useUnsavedInput(() => password.value !== '' || userName.value !== (player.lastAccount ?? ''));

function onSubmit() {
  let restored = false;
  return submit({
    restore: async () => {
      restored = await restoreRealmIfAny();
    },
    done: async () => {
      // Straight to the settlement, not `router.push('/')`: this panel already
      // lives on '/', and vue-router treats a push to the current location as a
      // duplicate navigation that never re-runs the guard (router/index.ts) that
      // would otherwise forward a founded player to /settlement — so the player
      // stayed on the landing page after a successful login.
      if (player.hasFoundedSettlement) {
        await router.push({ name: 'settlement' });
      } else if (restored) {
        // The restore ran and found no realm of this account in this world:
        // say so (LandingView keeps the gate up while this is set) instead of
        // the panel just vanishing. Demo mode runs no restore: no notice.
        flow.noRealm = { worldId: world.worldId ?? '', worldName: world.worldName ?? '' };
      }
    },
  });
}

// "Start a realm here" after the no-realm notice: ends the gate so the normal
// founding hero shows (forgetting `lastAccount` is what ends it).
function startHere() {
  flow.reset();
  player.forgetLastAccount();
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
    <template v-if="flow.noRealm !== null">
      <h1 data-testid="returning-login-no-realm-title">
        {{ t('onboarding.returningLogin.noRealmTitle', { world: flow.noRealm.worldName }) }}
      </h1>
      <p class="lede">{{ t('onboarding.returningLogin.noRealmBody') }}</p>
      <div class="notice-actions">
        <AuthPrimaryButton data-testid="returning-login-start-here" @click="startHere">
          {{ t('onboarding.returningLogin.startHere') }}
        </AuthPrimaryButton>
        <RouterLink
          class="pick-world"
          :to="{ name: 'worlds' }"
          data-testid="returning-login-pick-world"
          @click="flow.reset()"
        >
          {{ t('onboarding.returningLogin.pickWorld') }}
        </RouterLink>
      </div>
    </template>
    <template v-else>
      <div class="eyebrow">{{ t('onboarding.returningLogin.eyebrow') }}</div>
      <h1>{{ t('onboarding.returningLogin.title', { name: player.lastAccount }) }}</h1>
      <p class="lede">{{ t('onboarding.returningLogin.body') }}</p>
      <LoginFields
        v-model:user-name="userName"
        v-model:password="password"
        class="form"
        align="start"
        user-name-id="returning-login-username"
        password-id="returning-login-password"
        password-testid="returning-login-password"
        submit-testid="returning-login-submit"
        error-testid="returning-login-error"
        @submit="onSubmit"
      />
      <button type="button" class="new-realm" data-testid="returning-login-new-realm" @click="startNewRealm">
        {{ t('onboarding.returningLogin.newRealm') }}
      </button>
    </template>
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
  margin-top: 20px;
  max-width: 320px;
}
.notice-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 20px;
}
.pick-world {
  color: var(--gold);
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
