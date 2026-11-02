<script setup lang="ts">
// The table-of-contents box of a docs page with a list of entries: one link per
// anchor, wrapped in a bordered panel under the lede.
defineProps<{ links: { href: string; label: string }[] }>();
</script>

<template>
  <nav class="toc" :aria-label="$t('docs.status.toc')">
    <a v-for="link in links" :key="link.href" class="toc-link" :href="link.href">{{ link.label }}</a>
  </nav>
</template>

<style scoped>
.toc {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-top: 20px;
  padding: 14px 18px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel, #1c1710);
}
.toc-link {
  font-size: 13px;
  color: var(--muted);
  text-decoration: none;
}
.toc-link:hover {
  color: var(--text);
  text-decoration: underline;
}
</style>
