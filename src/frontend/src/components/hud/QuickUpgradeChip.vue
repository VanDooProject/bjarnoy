<script setup lang="ts">
// The status chip of the quick upgrade mode (stores/quickUpgrade.ts): says the mode is on, how to leave it, and carries the ✕ that
// leaves it. Phone: bottom centre, above the quest strip; desktop: top centre under the top bar. It is one of the elements the
// mode's outside-pointerdown rule keeps alive (`data-quick-upgrade-keep`, composables/useQuickUpgradeInput.ts), so pressing the ✕
// does not race the rule. Enter and leave are the HUD chip fade (lib/hud/chipMotion.ts, through the HUD motion gate).
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { fadeChip } from '../../lib/hud/chipMotion';
import { useIsMobile } from '../../composables/useIsMobile';

defineProps<{ shown: boolean }>();
const emit = defineEmits<{ stop: [] }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const isMobile = useIsMobile();

function onEnter(el: Element, done: () => void) {
  void fadeChip(el, 'in').then(done, done);
}
function onLeave(el: Element, done: () => void) {
  void fadeChip(el, 'out').then(done, done);
}
</script>

<template>
  <Transition :css="false" @enter="onEnter" @leave="onLeave">
    <div v-if="shown" class="quick-chip" :class="isMobile ? 'quick-chip--phone' : 'quick-chip--desktop'" data-quick-upgrade-keep data-testid="quick-upgrade-chip">
      <div class="quick-chip__body" role="status">
        <svg class="quick-chip__icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5 6 3l3.5 3.5M2.5 10 6 6.5 9.5 10" /></svg>
        <span class="quick-chip__text">
          <span class="quick-chip__title">{{ t('hud.quickUpgrade.chipTitle') }}</span>
          <span class="quick-chip__sub">{{ isMobile ? t('hud.quickUpgrade.chipHintTouch') : t('hud.quickUpgrade.chipHintMouse') }}</span>
        </span>
        <button class="quick-chip__stop" type="button" :aria-label="t('hud.quickUpgrade.stop')" data-testid="quick-upgrade-stop" @click="emit('stop')">
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" /></svg>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* A full-width, click-through row that centres the chip: the row is what fades, so the chip's own box stays free of transforms. */
.quick-chip {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 12;
  display: flex;
  justify-content: center;
  padding: 0 16px;
  pointer-events: none;
}
.quick-chip--desktop {
  top: max(76px, calc(var(--hud-inset-top, 0px) + 16px));
}
.quick-chip--phone {
  bottom: calc(88px + var(--hud-inset-bottom, 0px));
}
.quick-chip__body {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  padding: 8px 8px 8px 12px;
  background: var(--panel-bg);
  border: 1px solid var(--gold);
  border-radius: 0;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.55);
}
.quick-chip__icon {
  flex: none;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--gold);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.quick-chip__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.quick-chip__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--gold);
}
.quick-chip__sub {
  font-size: 11.5px;
  line-height: 1.3;
  color: var(--muted);
}
.quick-chip__stop {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--panel-border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.quick-chip__stop:hover {
  border-color: var(--gold);
}
.quick-chip__stop svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
}
</style>
