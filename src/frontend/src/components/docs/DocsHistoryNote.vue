<script setup lang="ts">
import { useDocsHistoryNotes } from '../../composables/useDocsHistoryNotes';

// Historical background of a unit or building: rendered only for an admin who has switched
// "Show history" on in the docs page header. Own colour so it never reads as an admin note.
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ as?: 'div' | 'section' }>(), { as: 'div' });
const { visible } = useDocsHistoryNotes();
</script>

<template>
  <component :is="as" v-if="visible" v-bind="$attrs" class="history-note" data-testid="history-note">
    <span class="history-note-label">{{ $t('docs.historyNotes.label') }}</span>
    <slot />
  </component>
</template>

<style scoped>
.history-note {
  margin: 12px 0;
  padding: 12px 16px;
  border: 1px solid rgba(143, 179, 208, 0.45);
  border-left: 3px solid #8fb3d0;
  border-radius: 10px;
  color: var(--muted);
  line-height: 1.6;
}
.history-note-label {
  display: block;
  margin-bottom: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8fb3d0;
}
</style>
