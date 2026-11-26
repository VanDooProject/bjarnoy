<script setup lang="ts">
// A building's output as shown in tooltips and the building modal: a resource
// rate reads "+N <icon>/h" (icon, not the resource name); every other output
// is the shared text from buildingStatsText.ts.
import { useI18n } from 'vue-i18n';
import type { BuildingOutput } from '../../lib/map/buildingEconomy';
import { formatBuildingOutput } from '../../lib/map/buildingStatsText';
import type { MessageSchema } from '../../i18n/schema';
import ResourceIcon from '../ResourceIcon.vue';

defineProps<{ output: BuildingOutput }>();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
</script>

<template>
  <i18n-t v-if="output.kind === 'resourceRate'" keypath="hud.hoverTooltip.outputResourceRateIcon" tag="span" class="output-rate">
    <template #amount>{{ output.amount }}</template>
    <template #icon><ResourceIcon :kind="output.resource" :size="14" /></template>
  </i18n-t>
  <template v-else>{{ formatBuildingOutput(output, t) }}</template>
</template>

<style scoped>
.output-rate {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
</style>
