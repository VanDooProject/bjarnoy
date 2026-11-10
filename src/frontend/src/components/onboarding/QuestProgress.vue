<script setup lang="ts">
// The counted progress of a quest, in one of three looks by quest kind
// (lib/quests.ts questProgressKind): pips for "build n", a bar for "train n",
// numbered level steps for "reach level n". Used by the card and the phone strip.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import type { QuestProgressKind } from '../../lib/quests';

const props = defineProps<{
  kind: QuestProgressKind;
  progress: { current: number; target: number };
  /** Strip variant: visual only, no "left" text. */
  compact?: boolean;
}>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const remaining = computed(() => Math.max(0, props.progress.target - props.progress.current));
const units = computed(() => Array.from({ length: props.progress.target }, (_, i) => i + 1));
const percent = computed(() => Math.min(100, (props.progress.current / Math.max(1, props.progress.target)) * 100));
</script>

<template>
  <div class="qp" :class="{ compact }">
    <div class="qp-visual" :class="`kind-${kind}`" data-testid="quest-progress-visual" :data-kind="kind">
      <div v-if="kind === 'train'" class="bar"><div :style="{ width: `${percent}%` }" /></div>
      <div v-else-if="kind === 'build'" class="pips">
        <i v-for="n in units" :key="n" :class="{ on: n <= progress.current }" />
      </div>
      <div v-else class="steps">
        <span
          v-for="n in units"
          :key="n"
          :class="{ on: n <= progress.current, cur: n === progress.current, goal: n === progress.target }"
        >{{ n }}</span>
      </div>
    </div>
    <span v-if="!compact" class="left" data-testid="quest-progress-left">{{ t(`quests.left.${kind}`, { n: remaining }, remaining) }}</span>
  </div>
</template>

<style scoped>
.qp {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 7px;
}
.qp.compact {
  margin-top: 5px;
}
.qp-visual {
  flex: 1;
  min-width: 0;
}
.left {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.bar {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.bar > div {
  height: 100%;
  background: var(--gold);
}
.pips {
  display: flex;
  gap: 4px;
}
.pips i {
  flex: 1;
  max-width: 26px;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.14);
}
.pips i.on {
  background: var(--gold);
}
.steps {
  display: flex;
  gap: 6px;
}
.steps span {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.1);
  color: var(--muted);
}
.steps span.on {
  background: var(--gold);
  color: #20160a;
}
.steps span.cur {
  box-shadow: 0 0 0 2px var(--panel-bg), 0 0 0 3px var(--gold);
}
.steps span.goal {
  border: 1.5px dashed var(--gold);
  color: var(--gold);
  background: none;
}
.compact .steps span {
  width: 18px;
  height: 18px;
  font-size: 10px;
}
</style>
