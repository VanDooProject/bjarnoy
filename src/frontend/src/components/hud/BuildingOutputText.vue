<script setup lang="ts">
// A building's output as shown in tooltips and the building modal: a resource
// rate reads "+N <icon>/h" (icon, not the resource name); every other output
// is the shared text from buildingStatsText.ts.
import { useI18n } from 'vue-i18n';
import type { BuildingOutput } from '../../lib/map/buildingEconomy';
import { formatBuildingOutput, type StatsTranslate } from '../../lib/map/buildingStatsText';
import type { MessageSchema } from '../../i18n/schema';
import ResourceIcon from '../ResourceIcon.vue';

// `locale` pins the wording to one language (the docs tech tree is always English); omitted, it follows the player's locale.
const props = withDefaults(defineProps<{ output: BuildingOutput; locale?: string; iconSize?: number }>(), { iconSize: 14 });
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const translate: StatsTranslate = (key, named) => t(key, named ?? {}, props.locale ? { locale: props.locale as 'en-US' } : {}) as string;
</script>

<template>
  <i18n-t v-if="output.kind === 'resourceRate'" keypath="hud.hoverTooltip.outputResourceRateIcon" tag="span" class="output-rate" :locale="locale">
    <template #amount>{{ output.amount }}</template>
    <template #icon><ResourceIcon :kind="output.resource" :size="iconSize" /></template>
  </i18n-t>
  <template v-else>{{ formatBuildingOutput(output, translate) }}</template>
</template>

<style scoped>
.output-rate {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
</style>
