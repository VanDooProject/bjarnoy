<script setup lang="ts">
// The guest-army rows (owner, composition, "Send home") shared by
// TrainingQueuePanel.vue and QueueDrawer.vue — the host's view of who is
// stationed here. Each caller keeps its own section header.
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useGuestRows } from '../../composables/useGuestRows';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const { guests, sendingId, error, sendHome } = useGuestRows();
</script>

<template>
  <div class="guests-grid">
    <div v-for="g in guests" :key="g.key" class="guest-row">
      <div class="guest-info">
        <span class="guest-owner">{{ g.ownerName }}</span>
        <span class="guest-composition">{{ g.composition }}</span>
      </div>
      <button
        type="button"
        class="guest-send-home"
        :disabled="sendingId === g.key"
        @click="sendHome(g.key)"
      >
        {{ sendingId === g.key ? t('hud.trainingQueue.sendingHome') : t('hud.trainingQueue.sendHome') }}
      </button>
    </div>
    <p v-if="error" class="status-subtext error-note">{{ error }}</p>
  </div>
</template>

<style scoped>
.guests-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.guest-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}
.guest-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.guest-owner {
  color: var(--text);
  font-weight: 600;
}
.guest-composition {
  color: var(--muted);
  font-size: 11px;
}
.guest-send-home {
  flex: none;
  padding: 5px 10px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: #e08a8a;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.guest-send-home:disabled {
  opacity: 0.5;
  cursor: default;
}
.status-subtext {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}
.error-note {
  color: #e08a8a;
}
@media (pointer: coarse) {
  .guest-send-home {
    min-height: 44px;
    padding: 0 14px;
    font-size: 13px;
  }
}
</style>
