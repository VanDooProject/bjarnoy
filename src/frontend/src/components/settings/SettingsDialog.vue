<script setup lang="ts">
// The player's own per-device settings (HUD bar position, map animations),
// opened from their profile's "Settings" button rather than laid out on the
// profile page itself: the profile is what other players see, the settings
// are only ever the viewer's own. Closes on the backdrop, the Close button
// and Escape, like the profile's report dialog.
import { onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import HudPreferences from './HudPreferences.vue';
import AnimationPreferences from './AnimationPreferences.vue';
import type { MessageSchema } from '../../i18n/schema';

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="settings-backdrop" @click.self="emit('close')">
    <div class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
      <h2 id="settings-dialog-title">{{ t('profile.settings.title') }}</h2>
      <HudPreferences />
      <AnimationPreferences />
      <div class="row">
        <button type="button" class="close" @click="emit('close')">{{ t('profile.settings.close') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 50;
}
.settings-dialog {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 20px;
  width: 100%;
  max-width: 420px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.settings-dialog h2 {
  margin: 0;
}
.row {
  display: flex;
  justify-content: flex-end;
}
.close {
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
</style>
