<script setup lang="ts">
// The switch for the building HUD (BuildingHudLayer's markers; the H key does the same): on phones BuildingHudLayer renders
// it, on desktop it is the first icon of HudPanelColumn.
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useHudPrefsStore } from '../../stores/hudPrefs';
import HudIconButton from './HudIconButton.vue';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const prefs = useHudPrefsStore();
</script>

<template>
  <HudIconButton
    class="building-hud__toggle"
    data-testid="building-info-toggle"
    :pressed="prefs.buildingInfo"
    :aria-label="t('hud.buildingHud.toggle.label')"
    :title="t('hud.buildingHud.toggle.title')"
    @click="prefs.toggleBuildingInfo()"
  >
    <!-- A hex dial with a quarter of its ring filled and a level mark inside. -->
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path class="building-hud__toggle-hex" d="M12 2.5 20.2 7.25V16.75L12 21.5 3.8 16.75V7.25Z" />
      <path class="building-hud__toggle-arc" d="M12 2.5 20.2 7.25V16.75" />
      <path class="building-hud__toggle-mark" d="M10.4 10.4 12.3 9.2V14.8" />
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
</style>
