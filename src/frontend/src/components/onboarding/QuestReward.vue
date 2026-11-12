<script setup lang="ts">
// What a quest pays, in one place for the current-quest card and the "also ready" rows: wood/stone/food, or, for a quest
// that grants premium time instead of resources (the register quest), the number of premium days.
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { resourceName } from '../../i18n/catalogueNames';
import ResourceIcon from '../ResourceIcon.vue';
import type { QuestResponse } from '../../api/types';

defineProps<{ quest: QuestResponse }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const REWARD_KINDS = ['wood', 'stone', 'food'] as const;
</script>

<template>
  <span class="quest-reward" :aria-label="t('quests.rewardLabel')" data-testid="quest-reward">
    <span v-if="quest.premiumDays" class="reward-item" data-testid="quest-premium-reward">
      {{ t('quests.premiumReward', { n: quest.premiumDays }) }}
    </span>
    <template v-else>
      <span v-for="kind in REWARD_KINDS" :key="kind" class="reward-item" :title="resourceName(kind)">
        <ResourceIcon :kind="kind" :size="14" />{{ quest.reward[kind] }}
      </span>
    </template>
  </span>
</template>

<style scoped>
.quest-reward {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}
.reward-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
