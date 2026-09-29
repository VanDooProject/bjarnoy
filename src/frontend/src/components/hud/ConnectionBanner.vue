<script setup lang="ts">
// Small pill under the HUD bar while any background poll is failing (see
// stores/connectionStatus.ts). Polls keep retrying on their own, so this is
// information, not a blocking error: dismissing hides the current failure and
// it comes back if a further one arrives; it vanishes by itself once every
// poll succeeds again.
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { describeLoadError } from '../../lib/loadError';
import { useConnectionStatusStore } from '../../stores/connectionStatus';

const status = useConnectionStatusStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// Identifies "this failure": a new failure (any key) changes `failures` or
// `at`, which un-dismisses the banner.
const signature = computed(() => {
  const latest = status.latest;
  return latest ? `${latest.key}:${latest.failures}:${latest.at}` : null;
});
const dismissedSignature = ref<string | null>(null);
const visible = computed(() => signature.value !== null && signature.value !== dismissedSignature.value);

// Healthy again: forget the dismissal so the next outage starts visible.
watch(signature, (value) => {
  if (value === null) dismissedSignature.value = null;
});

const summary = computed(() => (status.latest ? describeLoadError(status.latest.error).summary : ''));
</script>

<template>
  <div v-if="visible" class="connection-banner" role="status" data-testid="connection-banner">
    <span class="text">
      {{ t('hud.mapStatus.pollErrorTitle') }}
      <span class="summary">{{ summary }}</span>
      <span v-if="status.latest && status.latest.failures > 1" class="count">×{{ status.latest.failures }}</span>
    </span>
    <button
      type="button"
      class="dismiss"
      :aria-label="t('hud.mapStatus.dismiss')"
      :title="t('hud.mapStatus.dismiss')"
      @click="dismissedSignature = signature"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
/* Fixed at the top centre, just under the HUD bar: this component lives in
   App.vue, outside the views that set --hud-inset-top, so the 64px fallback
   is what usually applies. Above the map and its overlays, below modals. */
.connection-banner {
  position: fixed;
  top: calc(var(--hud-inset-top, 64px) + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 35;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100vw - 32px);
  padding: 6px 8px 6px 14px;
  border-radius: 999px;
  background: #e0a526;
  color: #20160a;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}
.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary {
  margin-left: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 500;
  opacity: 0.85;
}
.count {
  margin-left: 6px;
}
.dismiss {
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.15);
  color: inherit;
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.dismiss:focus-visible {
  outline: 2px solid #20160a;
  outline-offset: 2px;
}
</style>
