<script setup lang="ts">
import { useDocsAdminNotes } from '../../composables/useDocsAdminNotes';

// Technical or admin-only docs content: rendered only for an admin who has
// switched "Show admin notes" on in the docs page header. Players never see it.
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ as?: 'div' | 'section' }>(), { as: 'div' });
const { visible } = useDocsAdminNotes();
</script>

<template>
  <component :is="as" v-if="visible" v-bind="$attrs" class="admin-note" data-testid="admin-note">
    <span class="admin-note-label">{{ $t('docs.adminNotes.label') }}</span>
    <slot />
  </component>
</template>

<style scoped>
.admin-note {
  margin: 12px 0;
  padding: 12px 16px;
  border: 1px dashed color-mix(in srgb, var(--gold) 45%, transparent);
  border-radius: 10px;
  color: var(--muted);
}
.admin-note-label {
  display: block;
  margin-bottom: 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold);
}
</style>
