<script setup lang="ts">
import DocsPageArt from './DocsPageArt.vue';
import { docsNeighbours, docsPageById, type DocsPageEntry } from '../../lib/docs/docsPages';

// The end of a docs page (every page but the hub): up to three "Related" cards, then the previous and next page in
// hub order across groups. The first page has no previous, the last no next.
const props = defineProps<{ page: DocsPageEntry }>();

const related = () => props.page.related.map((r) => ({ ...r, target: docsPageById(r.page) }));
</script>

<template>
  <footer class="docs-footer" data-testid="docs-footer">
    <section v-if="page.related.length" class="related" aria-labelledby="docs-related-heading">
      <h2 id="docs-related-heading">{{ $t('docs.related.heading') }}</h2>
      <div class="cards">
        <RouterLink v-for="r in related()" :key="r.page" :to="r.target.to" class="related-card" :data-related="r.page">
          <DocsPageArt :art="r.target.art" :size="48" class="art" />
          <span class="text">
            <span class="title">{{ $t(r.target.titleKey) }}</span>
            <span class="reason">{{ $t(r.reasonKey) }}</span>
          </span>
        </RouterLink>
      </div>
    </section>
    <nav class="pager" :aria-label="$t('docs.nav.pager')">
      <RouterLink v-if="docsNeighbours(page.id).previous" :to="docsNeighbours(page.id).previous!.to" class="box prev" rel="prev" data-testid="docs-prev">
        <span class="dir">{{ $t('docs.nav.previous') }}</span>
        <span class="name">{{ $t(docsNeighbours(page.id).previous!.titleKey) }}</span>
      </RouterLink>
      <RouterLink v-if="docsNeighbours(page.id).next" :to="docsNeighbours(page.id).next!.to" class="box next" rel="next" data-testid="docs-next">
        <span class="dir">{{ $t('docs.nav.next') }}</span>
        <span class="name">{{ $t(docsNeighbours(page.id).next!.titleKey) }}</span>
      </RouterLink>
    </nav>
  </footer>
</template>

<style scoped>
.docs-footer {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--panel-border);
}
.related h2 {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gold);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
  gap: 12px;
}
.related-card,
.box {
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel, #1c1710);
  color: var(--text);
  text-decoration: none;
  transition: border-color 0.15s;
}
.related-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 10px 8px;
}
.art {
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5));
}
.text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.title {
  font-size: 15px;
  font-weight: 700;
}
.reason {
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--muted);
}
.pager {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.box {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 16px;
}
.next {
  grid-column: 2;
  text-align: right;
}
.dir {
  font-size: 12px;
  color: var(--muted);
}
.name {
  font-size: 15px;
  font-weight: 700;
}
.related-card:hover,
.related-card:focus-visible,
.box:hover,
.box:focus-visible {
  border-color: var(--gold);
}
.related-card:focus-visible,
.box:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
@media (max-width: 699px) {
  .pager {
    grid-template-columns: minmax(0, 1fr);
  }
  .next {
    grid-column: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .related-card,
  .box {
    transition: none;
  }
}
</style>
