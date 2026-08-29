<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

interface DocPage {
  to: string;
  title: string;
  description: string;
}

// The list a future doc page (e.g. resources, world generation) joins —
// see docs/tech/backend.md for the pattern this follows on the API side.
const PAGES: DocPage[] = [
  {
    to: '/tech-tree',
    title: 'Tech tree',
    description: 'Every building, and what each of its ten levels costs, produces, and requires.',
  },
  {
    to: '/docs/tiles',
    title: 'Tiles',
    description: 'The terrain a world is made of, how it generates, and what can be built on it.',
  },
];
</script>

<template>
  <div class="docs">
    <header class="topbar">
      <span class="brand">Fjørdhold</span>
      <button class="back" @click="router.push('/')">← Back</button>
    </header>
    <main class="body">
      <h1>Docs</h1>
      <p class="intro">Reference pages for the game's rules and content.</p>

      <div class="pages">
        <button v-for="page in PAGES" :key="page.to" class="page-card" @click="router.push(page.to)">
          <span class="page-title">{{ page.title }}</span>
          <span class="page-description">{{ page.description }}</span>
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.docs {
  width: 100vw;
  min-height: 100vh;
  overflow: auto;
  background: var(--shell);
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
}
.brand {
  font-weight: 600;
  font-size: 20px;
  color: var(--text);
}
.body {
  max-width: 90ch;
  margin: 0 auto;
  padding: 0 28px 60px;
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
.back {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.back:hover {
  border-color: var(--gold);
}
</style>
