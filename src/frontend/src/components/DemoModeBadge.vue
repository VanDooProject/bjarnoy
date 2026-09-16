<script setup lang="ts">
// Mobile: this badge used to sit at a fixed top:0 regardless of anything
// else on screen, which put it directly on top of the mobile HUD bar (and
// its resource pills) once that bar existed — see components/hud/TopBar.vue.
// Below the compact breakpoint it becomes a small rounded "bubble" instead
// of a wide top-of-screen banner, and follows the bar's own top/bottom
// docking preference so it always has clear space: tucked just under the
// bar when it's docked at the top (the default), and left near the top
// itself when the bar has moved to the bottom (nothing else is up there).
// While the pull-down drawer is open it would still land on top of the
// drawer's own content in that same spot, so it hides for as long as that's
// open (isHudDrawerOpen, kept in sync by TopBar.vue) rather than following
// it down too — it's a small, low-priority notice, not worth chasing.
// Desktop keeps today's exact rendering.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEMO_MODE } from '../config';
import { useHudPrefsStore } from '../stores/hudPrefs';
import { useMediaQuery } from '../composables/useMediaQuery';
import { isHudDrawerOpen } from '../composables/hudDrawerOpenState';
import { HUD_COMPACT_QUERY } from '../lib/breakpoints';
import type { MessageSchema } from '../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const hudPrefs = useHudPrefsStore();
const isCompact = useMediaQuery(HUD_COMPACT_QUERY);

const HUD_BAR_HEIGHT = 64;
const badgeStyle = computed(() => {
  if (!isCompact.value) return undefined;
  return hudPrefs.barPosition === 'top' ? { top: `${HUD_BAR_HEIGHT + 8}px` } : { top: '8px' };
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
    {{ t('demoModeBadge.label') }}
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
/* Mobile-only bubble: small, fully rounded, and pushed clear of whichever
   edge the HUD bar is currently docked to (see `badgeStyle` above) instead
   of spanning the top of the screen and covering it. */
.demo-badge--compact {
  padding: 3px 10px;
  font-size: 10px;
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  max-width: calc(100vw - 32px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
