<script setup lang="ts">
import { computed } from 'vue';
import type { BuildingPrerequisiteResponse } from '../../api/types';
import { prerequisiteGroups } from '../../lib/techtree/nodes';
import BuildingLink from './BuildingLink.vue';

// A building's prerequisites in a docs table cell: "Farm 5", then "(pumpkin soil: Pumpkin Farm 5)" on its own line. What every
// island needs, and what wheat soil needs, comes first; another soil's variant follows below in brackets, so the cell stays as
// narrow as before. `bullet` puts a "·" before each plain part, for cells that already start with another entry (the production
// tables' "Longhouse 20 · Farm 10").
const props = defineProps<{
  needs: readonly BuildingPrerequisiteResponse[];
  bullet?: boolean;
}>();

const groups = computed(() => prerequisiteGroups(props.needs));
</script>

<template>
  <template v-for="need in groups.main" :key="need.type">
    <template v-if="bullet">· </template><span class="need"><BuildingLink :type="need.type" /> {{ need.level }}</span>{{ ' ' }}
  </template>
  <template v-for="variant in groups.variants" :key="variant.soil">
    <i18n-t keypath="docs.needs.variant" scope="global" tag="span" class="needs-variant">
      <template #soil>{{ $t(`docs.needs.soil.${variant.soil}`) }}</template>
      <template #needs>
        <template v-for="(need, i) in variant.needs" :key="need.type">
          <template v-if="i > 0">, </template><span class="need"><BuildingLink :type="need.type" /> {{ need.level }}</span>
        </template>
      </template>
    </i18n-t>
  </template>
</template>

<style scoped>
.needs-variant {
  display: block;
}
/* A building and its level never part; the cell wraps between parts instead of widening the column. */
.need {
  white-space: nowrap;
}
</style>
