<script setup lang="ts">
// A link from one docs page to another (or to the tech tree): a plain router link in the dotted-underline style
// of BuildingLink's name, without its icon and preview card.
defineProps<{ to: string }>();
</script>

<template>
  <RouterLink :to="to" class="docs-page-link"><slot /></RouterLink>
</template>

<style scoped>
.docs-page-link {
  color: inherit;
  text-decoration: underline dotted color-mix(in srgb, var(--gold) 75%, transparent);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
}
.docs-page-link:hover,
.docs-page-link:focus-visible {
  color: var(--gold);
  text-decoration-style: solid;
}
.docs-page-link:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
  border-radius: 3px;
}
</style>
