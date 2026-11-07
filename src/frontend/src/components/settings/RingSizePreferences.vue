<script setup lang="ts">
// Size of the radial (ring) menu, per device (lib/map/ringSize.ts). Same segmented control as HudPreferences.vue.
import { useI18n } from 'vue-i18n';
import { RING_SIZE_SETTINGS, ringSizePreference } from '../../lib/map/ringSize';
import type { MessageSchema } from '../../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
</script>

<template>
  <section class="ring-size-preferences">
    <h3>{{ t('profile.ringMenu.title') }}</h3>
    <p class="hint">{{ t('profile.ringMenu.hint') }}</p>
    <p id="ring-size-label" class="field-label">{{ t('profile.ringMenu.size') }}</p>
    <div class="size-toggle" role="group" aria-labelledby="ring-size-label" data-testid="ring-size">
      <button
        v-for="size in RING_SIZE_SETTINGS"
        :key="size"
        type="button"
        class="option"
        :class="{ active: ringSizePreference.setting === size }"
        :aria-pressed="ringSizePreference.setting === size"
        @click="ringSizePreference.setting = size"
      >
        {{ t(`profile.ringMenu.${size}`) }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.ring-size-preferences h3 {
  margin: 0 0 4px;
  font-size: 16px;
}
.hint {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--muted);
}
.field-label {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 700;
}
.size-toggle {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.option {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--muted);
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  font-family: inherit;
}
.option:hover {
  color: var(--text);
  border-color: var(--gold);
}
.option.active {
  color: #20160a;
  background: var(--gold);
  border-color: var(--gold);
}
</style>
