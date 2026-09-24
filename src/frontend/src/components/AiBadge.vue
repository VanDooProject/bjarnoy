<script setup lang="ts">
// A small "AI" pill next to an owner name, for a settlement an AI jarl holds
// (docs/design/ai-players.md's "API" section: `isAi`/`aiPersonality` on the
// settlement contracts). The personality shows as a tooltip via the native
// `title` attribute, same as elsewhere in the HUD, rather than its own
// popover — this badge is meant to sit inline in already-tight owner labels
// (map hover, the building modal's owner line).
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { aiPersonalityName } from '../i18n/catalogueNames';

const props = defineProps<{ personality: string }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const title = computed(() => t('hud.hoverTooltip.aiBadgeTitle', { personality: aiPersonalityName(props.personality) }));
</script>

<template>
  <span class="ai-badge" :title="title">{{ t('hud.hoverTooltip.aiBadgeLabel') }}</span>
</template>

<style scoped>
.ai-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--panel-bg);
  border: 1px solid var(--gold);
  border-radius: 4px;
  padding: 1px 5px;
  color: var(--gold);
  vertical-align: middle;
  margin-left: 4px;
}
</style>
