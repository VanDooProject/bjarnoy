<script setup lang="ts">
// One entry of a docs list, laid out like docs/tiles: a thumbnail beside the
// name and text, the pickers (`DocsPicker`s) underneath.
//
// - `thumb` slot: the picture, which the component sets on the floating shadow.
// - default slot: the paragraphs under the name.
// - `pickers` slot: the rows of pills under the header.
withDefaults(defineProps<{ id: string; title: string; level?: 2 | 3 }>(), { level: 2 });
</script>

<template>
  <section :id="id" class="tile">
    <div class="tile-header">
      <div class="thumb floating-art">
        <span class="floating-art-shadow" aria-hidden="true" />
        <slot name="thumb" />
      </div>
      <div class="tile-intro">
        <component :is="`h${level}`">{{ title }}</component>
        <slot />
      </div>
    </div>
    <slot name="pickers" />
  </section>
</template>

<style scoped>
.tile {
  margin-top: var(--docs-entry-gap, 28px);
  scroll-margin-top: 84px;
}
.tile-header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.thumb {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  flex: none;
  width: 96px;
  height: 144px;
}
.tile-intro h2,
.tile-intro h3 {
  margin: 0 0 4px;
}
/* Paragraphs the page puts in the default slot. */
.tile-intro :slotted(p) {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 4px;
  max-width: 60ch;
}
</style>
