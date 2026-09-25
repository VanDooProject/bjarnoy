<script setup lang="ts">
// Bottom-left stack of dismissible in-game notifications (action failures,
// rejections, ...). Replaces piggybacking those messages onto whichever
// modal happened to be open — see MapView.vue's onRingSelect, which used to
// pop BuildingModal open just to have somewhere to show a failed upgrade.
import { useI18n } from 'vue-i18n';
import { useNotificationsStore } from '../../stores/notifications';
import type { MessageSchema } from '../../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const notifications = useNotificationsStore();
</script>

<template>
  <div class="notification-stack">
    <div v-for="item in notifications.items" :key="item.id" class="notification">
      <span class="message">{{ item.message }}</span>
      <button
        type="button"
        class="dismiss"
        :aria-label="t('hud.notifications.dismiss')"
        @click="notifications.dismiss(item.id)"
      >
        &times;
      </button>
    </div>
  </div>
</template>

<style scoped>
.notification-stack {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  max-width: min(360px, calc(100vw - 32px));
  pointer-events: none;
}

.notification {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(20, 14, 10, 0.92);
  border: 1px solid var(--rival, #b8492f);
  color: #f2e6d8;
  font-size: 13px;
  line-height: 1.4;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}

.message {
  flex: 1;
}

.dismiss {
  flex: none;
  background: transparent;
  border: none;
  color: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  opacity: 0.7;
}

.dismiss:hover {
  opacity: 1;
}
</style>
