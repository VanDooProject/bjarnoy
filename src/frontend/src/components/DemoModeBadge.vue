<script setup lang="ts">
// Demo mode only ever runs on a developer's own machine (the deployed build
// talks to the API), so it is a small tag tucked in the bottom-left corner
// at every width, never a banner competing with the HUD for the top rows:
// a top-centre banner on desktop covered the middle resource pills. Desktop
// spells out "Demo mode — progress isn't saved", a phone just "Demo" (the
// full sentence stays in its `title`). It sits just above a bottom-docked
// bar, and hides while the phone's pull-down drawer is open.
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
  const barBelow = isHudBarMounted.value && isHudBarAtBottom.value ? hudBarHeightPx.value : 0;
  return { bottom: `calc(${barBelow + 2}px + env(safe-area-inset-bottom, 0px))` };
});
const showBadge = computed(() => DEMO_MODE && !(isCompact.value && isHudDrawerOpen.value));
</script>

<template>
  <div
    v-if="showBadge"
    class="demo-badge"
    :style="badgeStyle"
    :title="t('demoModeBadge.title')"
  >
    {{ isCompact ? t('demoModeBadge.short') : t('demoModeBadge.label') }}
  </div>
</template>

<style scoped>
.demo-badge {
  position: fixed;
  left: 2px;
  /* Under every overlay on the map; it is a developer's reminder, nothing
     a click or tap should ever land on. */
  z-index: 5;
  padding: 0 5px;
  font-size: 8.5px;
  font-weight: 600;
  line-height: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--shell);
  background: var(--gold);
  border-radius: 4px;
  opacity: 0.75;
  pointer-events: none;
}
</style>
