<script setup lang="ts">
import DocsPageArt from './DocsPageArt.vue';
import type { DocsPageEntry } from '../../lib/docs/docsPages';

// The picture in a docs page's header, from the page's `headerArt` mode (docsPages.ts):
//
// - `icon`: the art, 72px, to the left of the title and lede, vertically centred.
// - `backdrop`: the art as a dim picture behind the right of the header. It bleeds out of the reading column towards
//   the viewport edge and fades out on every side, so no straight edge shows. Phones (<700px) swap it for the icon,
//   since a picture behind text is too muddy there.
//
// The root is `display: contents`: the icon is a grid item of the layout's header body, the backdrop is positioned
// against it. Animated art stays a still frame here; the hub keeps the animation.
defineProps<{ page: DocsPageEntry }>();
</script>

<template>
  <div class="header-art" :data-mode="page.headerArt" data-testid="docs-header-art">
    <DocsPageArt class="icon" :art="page.art" :size="72" data-testid="docs-header-icon" />
    <DocsPageArt v-if="page.headerArt === 'backdrop'" class="backdrop" :art="page.art" :size="260" data-testid="docs-header-backdrop" />
  </div>
</template>

<style scoped>
.header-art {
  display: contents;
}
.icon {
  grid-column: 1;
  margin-right: 18px;
  filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.55));
}
.header-art .backdrop {
  display: none;
}
@media (min-width: 700px) {
  /* A backdrop page shows the icon only on a phone. */
  .header-art[data-mode='backdrop'] .icon {
    display: none;
  }
  .header-art[data-mode='backdrop'] .backdrop {
    display: inline-flex;
    position: absolute;
    z-index: 0;
    top: 50%;
    /* Out of the 90ch column towards the viewport edge, but never past it: the free space on one side, less a margin. */
    right: calc(-1 * max(0px, min(200px, (100vw - 100%) / 2 - 24px)));
    transform: translateY(-50%);
    opacity: 0.22;
    pointer-events: none;
    /* Fades on the left, right, top and bottom alike. */
    -webkit-mask-image: radial-gradient(ellipse 50% 50% at 50% 50%, #000 30%, transparent 100%);
    mask-image: radial-gradient(ellipse 50% 50% at 50% 50%, #000 30%, transparent 100%);
  }
}
</style>
