<script setup lang="ts">
// The guest-army rows shared by GarrisonList.vue (and so by TrainingQueuePanel.vue and
// QueueDrawer.vue) — the host's view of who is stationed here: an owner line with the army's
// food per hour and "Send home", and the army's units as indented rows below it. The food column
// follows the shown state of the garrison list around it (`.is-rates-shown` / pointer hover).
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useGuestRows } from '../../composables/useGuestRows';
import GarrisonUnitRow from './GarrisonUnitRow.vue';

const { t, n } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const { guests, sendingId, error, sendHome } = useGuestRows();
</script>

<template>
  <div class="guests-grid">
    <div v-for="g in guests" :key="g.key" class="guest-army">
      <div class="guest-row">
        <span class="guest-owner">{{ g.ownerName }}</span>
        <span class="guest-rate">{{ t('hud.trainingQueue.foodPerHour', { amount: n(g.foodPerHour, 'integer') }) }}</span>
        <button
          type="button"
          class="guest-send-home"
          :disabled="sendingId === g.key"
          @click="sendHome(g.key)"
        >
          {{ sendingId === g.key ? t('hud.trainingQueue.sendingHome') : t('hud.trainingQueue.sendHome') }}
        </button>
      </div>
      <div class="guest-units">
        <GarrisonUnitRow v-for="u in g.units" :key="u.key" :label="u.label" :count="u.count" :food-per-hour="u.foodPerHour" />
      </div>
    </div>
    <p v-if="error" class="status-subtext error-note">{{ error }}</p>
  </div>
</template>

<style scoped>
.guests-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.guest-army {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.guest-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.guest-owner {
  flex: 1;
  min-width: 0;
  color: var(--text);
  font-weight: 600;
}
/* The army's total shares the show/hide of the unit rows' column: collapsed to nothing until shown. */
.guest-rate {
  flex: none;
  overflow: hidden;
  white-space: nowrap;
  text-align: right;
  font-size: 11px;
  color: var(--food);
  max-width: 0;
  opacity: 0;
  transition: max-width 160ms ease, opacity 160ms ease;
}
.guest-units {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 12px;
  border-left: 1px solid var(--panel-border);
}
html[data-hud-motion='reduced'] .guest-rate {
  transition: none;
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
