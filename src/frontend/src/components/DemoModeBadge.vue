<script setup lang="ts">
// Desktop: the full "Demo mode — progress isn't saved" banner at the top
// edge. Phones: demo mode only ever runs on a developer's own machine (the
// deployed build talks to the API), so it gets a small "Demo" tag tucked in
// the bottom-left corner instead of a pill that competed with the HUD bar,
// the settlement bubble and the onboarding overlays for the top rows. It
// sits just above a bottom-docked bar, and hides while the pull-down drawer
// is open. The full sentence stays in its `title`.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEMO_MODE } from '../config';
import { useMediaQuery } from '../composables/useMediaQuery';
import { isHudDrawerOpen } from '../composables/hudDrawerOpenState';
import { isHudBarAtBottom, isHudBarMounted } from '../composables/hudSettlementBubbleState';
import { hudBarHeightPx } from '../composables/hudBarHeight';
import { HUD_COMPACT_QUERY } from '../lib/breakpoints';
import type { MessageSchema } from '../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const isCompact = useMediaQuery(HUD_COMPACT_QUERY);

const badgeStyle = computed(() => {
  if (!isCompact.value) return undefined;
  const barBelow = isHudBarMounted.value && isHudBarAtBottom.value ? hudBarHeightPx.value : 0;
  return { bottom: `calc(${barBelow + 2}px + env(safe-area-inset-bottom, 0px))` };
});
const showBadge = computed(() => DEMO_MODE && !(isCompact.value && isHudDrawerOpen.value));
</script>

<template>
  <div
    v-if="showBadge"
    class="demo-badge"
    :class="{ 'demo-badge--compact': isCompact }"
    :style="badgeStyle"
    :title="t('demoModeBadge.title')"
  >
    {{ isCompact ? t('demoModeBadge.short') : t('demoModeBadge.label') }}
  </div>
</template>

<style scoped>
.demo-badge {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--shell);
  background: var(--gold);
  border-radius: 0 0 8px 8px;
  pointer-events: none;
}
.demo-badge--compact {
  top: auto;
  left: 2px;
  transform: none;
  /* Under every overlay on the map; it is a developer's reminder, nothing
     a tap should ever land on. */
  z-index: 5;
  padding: 0 5px;
  font-size: 8.5px;
  line-height: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: 4px;
  opacity: 0.75;
}
</style>
