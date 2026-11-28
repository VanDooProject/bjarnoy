<script setup lang="ts">
// The icon of a report kind (battle, field battle, camp, army, trade) or of the Reports panel itself ('letter'), drawn in
// the current text colour. The one place these icons live: the reports list rows, its kind tabs and the HUD column all use it.
import type { InboxKind } from '../../lib/units/inbox';
import {
  ARMY_PATHS,
  CAMP_PAW_PATH,
  CAMP_TOES,
  CAMP_TOE_RADIUS,
  CROSSED_SWORDS_PATHS,
  FIELD_BATTLE_PATHS,
  LETTER_DOT,
  LETTER_PATHS,
  TRADE_PATHS,
} from '../../lib/hud/iconPaths';

withDefaults(defineProps<{ kind: InboxKind | 'letter'; size?: number }>(), { size: 24 });

const PATHS = {
  battle: CROSSED_SWORDS_PATHS,
  field: FIELD_BATTLE_PATHS,
  army: ARMY_PATHS,
  trade: TRADE_PATHS,
  letter: LETTER_PATHS,
} as const;
</script>

<template>
  <svg
    class="report-kind-icon"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="kind === 'camp'">
      <path :d="CAMP_PAW_PATH" />
      <circle v-for="toe in CAMP_TOES" :key="`${toe.cx}-${toe.cy}`" :cx="toe.cx" :cy="toe.cy" :r="CAMP_TOE_RADIUS" />
    </template>
    <template v-else>
      <path v-for="d in PATHS[kind]" :key="d" :d="d" />
      <circle v-if="kind === 'letter'" :cx="LETTER_DOT.cx" :cy="LETTER_DOT.cy" :r="LETTER_DOT.r" fill="currentColor" />
    </template>
  </svg>
</template>
