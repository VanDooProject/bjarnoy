<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';

const router = useRouter();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

interface DocPage {
  to: string;
  titleKey: string;
  descriptionKey: string;
}

// The list a future doc page (e.g. resources, world generation) joins —
// see docs/tech/backend.md for the pattern this follows on the API side.
const PAGES: DocPage[] = [
  { to: '/tech-tree', titleKey: 'docs.hub.pages.techTree.title', descriptionKey: 'docs.hub.pages.techTree.description' },
  { to: '/docs/tiles', titleKey: 'docs.hub.pages.tiles.title', descriptionKey: 'docs.hub.pages.tiles.description' },
];
</script>

<template>
  <div class="docs">
    <TopBar docked :title="$t('docs.hub.title')" caption="DOCS">
      <HudNav />
    </TopBar>
    <main class="body">
      <h1>{{ $t('docs.hub.title') }}</h1>
      <p class="intro">{{ $t('docs.hub.intro') }}</p>

      <div class="pages">
        <button v-for="page in PAGES" :key="page.to" class="page-card" @click="router.push(page.to)">
          <span class="page-title">{{ t(page.titleKey) }}</span>
          <span class="page-description">{{ t(page.descriptionKey) }}</span>
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.docs {
  width: 100%;
  height: 100vh;
  overflow: auto;
  background: var(--shell);
}
.body {
  max-width: 90ch;
  margin: 0 auto;
  padding: 24px 28px 60px;
  color: var(--text);
}
.intro {
  color: var(--muted);
  line-height: 1.6;
}
.pages {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  margin-top: 24px;
}
.page-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 18px 20px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel, #1c1710);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.page-card:hover {
  border-color: var(--gold);
}
.page-title {
  font-size: 17px;
  font-weight: 700;
}
.page-description {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}
</style>
