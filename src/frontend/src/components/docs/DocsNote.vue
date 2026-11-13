<script setup lang="ts">
import { computed } from 'vue';
import { useDocsAdminNotes } from '../../composables/useDocsAdminNotes';
import { useDocsHistoryNotes } from '../../composables/useDocsHistoryNotes';

// The one box behind the admin-only docs notes (DocsAdminNote, DocsHistoryNote): rendered only for an admin who has
// switched the note's kind on in the docs page header. Players never see it. The kind picks the switch, the label
// and the colour.
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ kind: 'admin' | 'history'; as?: 'div' | 'section' }>(), { as: 'div' });
const admin = useDocsAdminNotes();
const history = useDocsHistoryNotes();
const visible = computed(() => (props.kind === 'admin' ? admin.visible.value : history.visible.value));
</script>

<template>
  <component :is="as" v-if="visible" v-bind="$attrs" :class="['docs-note', kind]" :data-testid="`${kind}-note`">
    <span class="docs-note-label">{{ $t(`docs.${kind}Notes.label`) }}</span>
    <slot />
  </component>
</template>

<style scoped>
.docs-note {
  margin: 12px 0;
  padding: 12px 16px;
  border-radius: 10px;
  color: var(--muted);
}
.docs-note-label {
  display: block;
  margin-bottom: 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.admin {
  border: 1px dashed color-mix(in srgb, var(--gold) 45%, transparent);
}
.admin .docs-note-label {
  color: var(--gold);
}
.history {
  border: 1px solid color-mix(in srgb, var(--history) 45%, transparent);
  border-left: 3px solid var(--history);
  line-height: 1.6;
}
.history .docs-note-label {
  margin-bottom: 4px;
  color: var(--history);
}
</style>
