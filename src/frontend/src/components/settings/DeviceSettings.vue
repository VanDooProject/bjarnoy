<script setup lang="ts">
// The per-device settings (HUD, ring size, graphics) as one block. They live
// on this device, not on an account, so SettingsModal.vue shows them to
// anonymous players too.
import HudPreferences from './HudPreferences.vue';
import RingSizePreferences from './RingSizePreferences.vue';
import AnimationPreferences from './AnimationPreferences.vue';
</script>

<template>
  <div class="settings-tab" data-testid="device-settings">
    <HudPreferences />
    <RingSizePreferences />
    <AnimationPreferences />
  </div>
</template>

<style scoped>
.settings-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
</style>
