<script setup lang="ts">
import TopBar from '../hud/TopBar.vue';
import HudNav from '../hud/HudNav.vue';
import MobileHudDrawer from '../hud/MobileHudDrawer.vue';

// The shell every docs page shares: docked top bar with the HUD nav and the
// mobile drawer, the breadcrumb back to the hub, the page title and its lede,
// then the page body in the default slot. A page only brings its own content.
//
// - `status` slot: a note under the lede (the "coming soon" line of a feature
//   that has not shipped yet), set off with the gold rule.
// - `wide` slot + `wide` prop: something wider than the reading column (the
//   tech tree's graph) between the lede and the body. The page column then
//   grows to 1440px while the lede and the body keep their 90ch width, so all
//   of them start at the same left edge.
// - `breadcrumb=false` for the hub itself, which is what the others link back to.
// Attributes (a `class` for the page's own scroll container hook) fall through
// to the scrolling root.
withDefaults(
  defineProps<{
    title: string;
    /** The small line under the title in the top bar, e.g. `DOCS · TILES`. */
    caption: string;
    intro?: string;
    breadcrumb?: boolean;
    wide?: boolean;
  }>(),
  { intro: undefined, breadcrumb: true, wide: false },
);
</script>

<template>
  <div class="docs-page">
    <TopBar docked :title="title" :caption="caption">
      <HudNav />
      <template #drawer="{ close }">
        <MobileHudDrawer @close="close" />
      </template>
    </TopBar>
    <div class="page docs-scale" :class="{ wide }">
      <header class="head">
        <RouterLink v-if="breadcrumb" to="/docs" class="breadcrumb">{{ $t('docs.backToDocs') }}</RouterLink>
        <h1>{{ title }}</h1>
        <p v-if="intro" class="intro">{{ intro }}</p>
        <slot name="status" />
      </header>
      <div v-if="$slots.wide" class="wide-slot">
        <slot name="wide" />
      </div>
      <main class="body">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.docs-page {
  width: 100%;
  height: 100vh;
  /* Mobile-readiness audit: 100dvh tracks mobile Safari's real visible
     viewport, as a progressive enhancement over the 100vh above. */
  height: 100dvh;
  overflow: auto;
  background: var(--shell);
}
.page {
  max-width: 90ch;
  margin: 0 auto;
  padding: 24px 28px 60px;
  color: var(--text);
}
.page.wide {
  max-width: 1440px;
}
.page.wide .head,
.page.wide .body {
  max-width: 90ch;
}
.wide-slot {
  padding-top: 24px;
}
.page.wide .body {
  padding-top: 24px;
}
.breadcrumb {
  display: inline-block;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--muted);
  text-decoration: none;
}
.breadcrumb:hover {
  color: var(--gold);
  text-decoration: underline;
}
.intro {
  color: var(--muted);
  line-height: 1.6;
}
/* The "coming soon" note a page passes in the `status` slot. */
.head :slotted(.status) {
  font-size: 13px;
  border-left: 3px solid var(--gold);
  padding-left: 12px;
  color: var(--muted);
}
</style>
