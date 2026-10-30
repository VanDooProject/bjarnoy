<script setup lang="ts">
import { computed, inject } from 'vue';
import { routeLocationKey } from 'vue-router';
import TopBar from '../hud/TopBar.vue';
import HudNav from '../hud/HudNav.vue';
import MobileHudDrawer from '../hud/MobileHudDrawer.vue';
import { useDocsAdminNotes } from '../../composables/useDocsAdminNotes';
import { provideFirstMentions } from '../../composables/useFirstMentions';
import { docsPageByPath } from '../../lib/docs/docsPages';
import DocsBreadcrumb from './DocsBreadcrumb.vue';
import DocsHeaderArt from './DocsHeaderArt.vue';
import DocsPageFooter from './DocsPageFooter.vue';

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
// - The page's entry in docsPages.ts is found by its route path. It brings the breadcrumb above the title (`Docs ›
//   group › page`, the group and page crumbs open menus), the header art (DocsHeaderArt) and, below the body, the
//   "Related" cards with the previous/next links. A route with no entry (a test mount) gets only the "Docs" crumb.
// - `breadcrumb=false` for the hub itself, which is what the others link back to; it has no footer either.
// - Admins get a "Show admin notes" toggle under the lede; it reveals the
//   `DocsAdminNote` blocks (technical content hidden from players).
// - `hero` for the hub, which renders its own h1 and lede in the body; the
//   header then keeps only the admin toggle (the `title` still names the top bar).
// - Provides the page's first-mention register for BuildingLink.
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
    /** The page draws its own heading and lede (the hub's hero), so the header skips the h1 and intro. */
    hero?: boolean;
  }>(),
  { intro: undefined, breadcrumb: true, wide: false, hero: false },
);
const route = inject(routeLocationKey, null);
const entry = computed(() => (route ? docsPageByPath(route.path) : undefined));
const { canToggle, enabled, setEnabled } = useDocsAdminNotes();
// Only a building's first mention on the page is a link (BuildingLink.vue).
provideFirstMentions();
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
      <header class="head" :class="{ 'hero-head': hero }">
        <DocsBreadcrumb v-if="breadcrumb" :page="entry" />
        <div class="head-body">
          <DocsHeaderArt v-if="entry && breadcrumb" :page="entry" />
          <div class="head-text">
            <h1 v-if="!hero">{{ title }}</h1>
            <p v-if="intro && !hero" class="intro">{{ intro }}</p>
            <slot name="status" />
            <label v-if="canToggle" class="admin-toggle" data-testid="docs-admin-toggle">
              <input
                type="checkbox"
                :checked="enabled"
                @change="setEnabled(($event.target as HTMLInputElement).checked)"
              />
              {{ $t('docs.adminNotes.toggle') }}
            </label>
          </div>
        </div>
      </header>
      <div v-if="$slots.wide" class="wide-slot">
        <slot name="wide" />
      </div>
      <main class="body">
        <slot />
      </main>
      <DocsPageFooter v-if="entry && breadcrumb" :page="entry" />
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
.head-body {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
}
.head-text {
  grid-column: 2;
  position: relative;
  z-index: 1;
  min-width: 0;
}
.intro {
  color: var(--muted);
  line-height: 1.6;
}
/* The hub's own hero follows; the header holds only the admin toggle. */
.hero-head .admin-toggle {
  margin-top: 0;
}
/* The "coming soon" note a page passes in the `status` slot. */
.head :slotted(.status) {
  font-size: 13px;
  border-left: 3px solid var(--gold);
  padding-left: 12px;
  color: var(--muted);
}
/* Admin-only switch for the technical notes. */
.admin-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 3px 10px;
  border: 1px dashed color-mix(in srgb, var(--gold) 45%, transparent);
  border-radius: 999px;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}
.admin-toggle:hover {
  color: var(--gold);
}
</style>
