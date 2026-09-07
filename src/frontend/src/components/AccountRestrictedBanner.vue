<script setup lang="ts">
// Shown whenever any API call comes back 403 { error: "user_locked" } — see
// `authHooks.onAccountLocked` in stores/auth.ts, set from api/client.ts's
// request(). Deliberately minimal: a persistent strip, not a modal — a
// locked account can still look around, it just can't act.
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import type { MessageSchema } from '../i18n/schema';

const auth = useAuthStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
</script>

<template>
  <div v-if="auth.accountLocked" class="banner">
    {{ t('accountRestrictedBanner.message') }}
  </div>
</template>

<style scoped>
.banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: 8px 16px;
  background: var(--rival);
  color: #1a0a08;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}
</style>
