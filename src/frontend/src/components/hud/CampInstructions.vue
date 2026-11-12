<script setup lang="ts">
// The instruction line of a "Set up camp" dispatch with what the camp costs and how long it takes to build at this world's speed.
// Shared by ArmyPanel.vue and MobileDispatchSheet.vue.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import type { MessageSchema } from '../../i18n/schema';
import { BEACH_CAMP_BUILD_SECONDS, BEACH_CAMP_COST } from '../../lib/founding';
import { formatBuildTime, scaledBuildSeconds } from '../../lib/map/ringCatalogue';
import { formatCostLine } from '../../lib/units/trainingEconomy';

const world = useWorldStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const cost = computed(() => formatCostLine(BEACH_CAMP_COST));
const time = computed(() => formatBuildTime(scaledBuildSeconds(BEACH_CAMP_BUILD_SECONDS, 1, world.worldSpeedFactor)));
</script>

<template>
  <p class="status-subtext instructions">{{ t('hud.armyPanel.campInstructions', { cost, time }) }}</p>
</template>
