<script setup lang="ts">
// The switch for the building HUD (BuildingHudLayer's markers; the H key does the same): each press steps full → levels only →
// off. On phones BuildingHudLayer renders it, on desktop it is the first icon of HudPanelColumn.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { BUILDING_HUD_CYCLE, useHudPrefsStore } from '../../stores/hudPrefs';
import HudIconButton from './HudIconButton.vue';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const prefs = useHudPrefsStore();
const full = computed(() => prefs.buildingHudMode === 'full');
/** The mode the next press switches to. */
const nextMode = computed(() => BUILDING_HUD_CYCLE[prefs.buildingHudMode]);
</script>

<template>
  <HudIconButton
    class="building-hud__toggle"
    data-testid="building-info-toggle"
    :data-mode="prefs.buildingHudMode"
    :pressed="prefs.buildingInfo"
    :aria-label="t('hud.buildingHud.toggle.label', { mode: t(`hud.buildingHud.toggle.modes.${prefs.buildingHudMode}`) })"
    :title="t('hud.buildingHud.toggle.title', { mode: t(`hud.buildingHud.toggle.modes.${prefs.buildingHudMode}`), next: t(`hud.buildingHud.toggle.modes.${nextMode}`) })"
    @click="prefs.cycleBuildingHud()"
  >
    <!-- A hex dial with a quarter of its ring filled and a level mark inside; full mode adds its box beside a smaller dial. -->
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <g :transform="full ? 'translate(-1.5 3.4) scale(0.72)' : undefined">
        <path class="building-hud__toggle-hex" vector-effect="non-scaling-stroke" d="M12 2.5 20.2 7.25V16.75L12 21.5 3.8 16.75V7.25Z" />
        <path class="building-hud__toggle-arc" vector-effect="non-scaling-stroke" d="M12 2.5 20.2 7.25V16.75" />
        <path class="building-hud__toggle-mark" vector-effect="non-scaling-stroke" d="M10.4 10.4 12.3 9.2V14.8" />
      </g>
      <g v-if="full" class="building-hud__toggle-box">
        <rect x="13.6" y="8" width="9" height="8" rx="1.5" />
        <path d="M15.6 10.9H20.6M15.6 13.4H19" />
      </g>
    </svg>
  </HudIconButton>
</template>

<style scoped>
.building-hud__toggle-arc {
  stroke: #ffd23f;
  stroke-width: 2.6;
}
.building-hud__toggle[aria-pressed='false'] .building-hud__toggle-arc {
  stroke: currentColor;
  opacity: 0.5;
}
.building-hud__toggle-box {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
}
</style>
