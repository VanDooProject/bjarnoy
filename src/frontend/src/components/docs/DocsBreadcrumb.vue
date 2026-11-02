<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { routeLocationKey } from 'vue-router';
import DocsPageArt from './DocsPageArt.vue';
import { DOCS_GROUPS, docsGroupOf, type DocsPageEntry } from '../../lib/docs/docsPages';

// "Docs › Building up › Shrines" above a docs page's title. "Docs" is a plain link to the hub; the group and the page
// crumb each open a menu: the page crumb lists the pages of its group (to jump to a sibling), the group crumb lists
// the four groups (each links to the hub scrolled to that group). One menu is open at a time.
//
// Keyboard: Enter/Space/ArrowDown on a crumb opens its menu and focuses the current entry, the arrow keys, Home and
// End move through the entries, Escape closes and returns focus to the crumb, Tab closes. A click outside closes.
const props = defineProps<{ page?: DocsPageEntry }>();

type MenuId = 'page' | 'group';
const open = ref<MenuId | null>(null);
const root = ref<HTMLElement | null>(null);

const group = () => (props.page ? docsGroupOf(props.page.id) : undefined);

function items(menu: MenuId): HTMLElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLElement>(`[data-menu="${menu}"] [role=menuitem]`) ?? []);
}
function triggerOf(menu: MenuId): HTMLElement | null {
  return root.value?.querySelector<HTMLElement>(`[data-trigger="${menu}"]`) ?? null;
}

async function show(menu: MenuId) {
  open.value = menu;
  await nextTick();
  const list = items(menu);
  (list.find((el) => el.hasAttribute('aria-current')) ?? list[0])?.focus();
}
function close(refocus = false) {
  const was = open.value;
  open.value = null;
  if (refocus && was) triggerOf(was)?.focus();
}
function toggle(menu: MenuId) {
  if (open.value === menu) close();
  else void show(menu);
}

function onTriggerKey(e: KeyboardEvent, menu: MenuId) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    void show(menu);
  } else if (e.key === 'Escape' && open.value) {
    e.preventDefault();
    close(true);
  }
}
function onMenuKey(e: KeyboardEvent, menu: MenuId) {
  const list = items(menu);
  const at = list.indexOf(document.activeElement as HTMLElement);
  const go = (i: number) => {
    e.preventDefault();
    list[(i + list.length) % list.length]?.focus();
  };
  if (e.key === 'ArrowDown') go(at + 1);
  else if (e.key === 'ArrowUp') go(at - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(list.length - 1);
  else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    close(true);
  } else if (e.key === 'Tab') close();
}

function onOutside(e: Event) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) close();
}
onMounted(() => document.addEventListener('pointerdown', onOutside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside));

// A navigation (also back/forward) closes whatever is open.
const route = inject(routeLocationKey, null);
watch(
  () => route?.fullPath,
  () => close(),
);
</script>

<template>
  <nav ref="root" class="breadcrumb" :aria-label="$t('docs.nav.breadcrumb')" data-testid="docs-breadcrumb">
    <RouterLink to="/docs" class="crumb docs-crumb">{{ $t('docs.nav.docs') }}</RouterLink>
    <template v-if="page && group()">
      <span class="sep" aria-hidden="true" />
      <span class="crumb-wrap">
        <button
          type="button"
          class="crumb trigger"
          data-trigger="group"
          aria-haspopup="menu"
          :aria-expanded="open === 'group'"
          :aria-label="$t('docs.nav.groupsMenu', { group: $t(group()!.titleKey) })"
          @click="toggle('group')"
          @keydown="onTriggerKey($event, 'group')"
        >
          {{ $t(group()!.titleKey) }}<span class="chev" aria-hidden="true" />
        </button>
        <ul v-if="open === 'group'" class="menu" role="menu" data-menu="group" :aria-label="$t('docs.nav.groups')" @keydown="onMenuKey($event, 'group')">
          <li v-for="g in DOCS_GROUPS" :key="g.id" role="none">
            <RouterLink
              :to="{ path: '/docs', hash: `#group-${g.id}` }"
              role="menuitem"
              tabindex="-1"
              class="item"
              :class="{ current: g.id === group()!.id }"
              :aria-current="g.id === group()!.id ? 'true' : undefined"
              :data-group="g.id"
              @click="close()"
            >
              <span class="item-title">{{ $t(g.titleKey) }}</span>
            </RouterLink>
          </li>
        </ul>
      </span>
      <span class="sep" aria-hidden="true" />
      <span class="crumb-wrap">
        <button
          type="button"
          class="crumb trigger current-page"
          data-trigger="page"
          aria-haspopup="menu"
          :aria-expanded="open === 'page'"
          :aria-current="'page'"
          :aria-label="$t('docs.nav.pagesMenu', { page: $t(page.titleKey), group: $t(group()!.titleKey) })"
          @click="toggle('page')"
          @keydown="onTriggerKey($event, 'page')"
        >
          {{ $t(page.titleKey) }}<span class="chev" aria-hidden="true" />
        </button>
        <ul v-if="open === 'page'" class="menu" role="menu" data-menu="page" :aria-label="$t('docs.nav.pagesIn', { group: $t(group()!.titleKey) })" @keydown="onMenuKey($event, 'page')">
          <li v-for="p in group()!.pages" :key="p.id" role="none">
            <RouterLink
              :to="p.to"
              role="menuitem"
              tabindex="-1"
              class="item"
              :class="{ current: p.id === page.id }"
              :aria-current="p.id === page.id ? 'page' : undefined"
              :data-page="p.id"
              @click="close()"
            >
              <DocsPageArt :art="p.art" :size="26" />
              <span class="item-title">{{ $t(p.titleKey) }}</span>
            </RouterLink>
          </li>
        </ul>
      </span>
    </template>
  </nav>
</template>

<style scoped>
.breadcrumb {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--muted);
}
.sep::before {
  content: '›';
}
.chev::before {
  content: '▾';
}
.sep {
  color: var(--muted);
  opacity: 0.7;
}
.crumb {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--muted);
  font: inherit;
  text-decoration: none;
  cursor: pointer;
}
.docs-crumb {
  padding-left: 0;
}
.docs-crumb:hover,
.docs-crumb:focus-visible {
  color: var(--gold);
  text-decoration: underline;
}
.current-page {
  color: var(--text);
}
/* A crumb button reads as plain crumb text until it is pointed at, focused or open. */
.chev {
  display: none;
  font-size: 10px;
}
.trigger:hover,
.trigger:focus-visible,
.trigger[aria-expanded='true'] {
  border-color: var(--panel-border);
  color: var(--gold);
}
.trigger:hover .chev,
.trigger:focus-visible .chev,
.trigger[aria-expanded='true'] .chev {
  display: inline;
}
.trigger:focus-visible,
.docs-crumb:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 1px;
}
/* Touch has no hover: always show the chevron (no border) so the menu can be found. */
@media (hover: none) {
  .chev {
    display: inline;
  }
}
.crumb-wrap {
  position: relative;
}
.menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
  min-width: 230px;
  max-width: calc(100vw - 32px);
  margin: 0;
  padding: 6px;
  list-style: none;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel, #1c1710);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.55);
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 7px;
  color: var(--text);
  font-size: 14px;
  text-decoration: none;
  white-space: nowrap;
}
.item:hover,
.item:focus-visible {
  background: color-mix(in srgb, var(--gold) 14%, transparent);
  outline: none;
}
.item.current {
  color: var(--gold);
  font-weight: 700;
}
/* On a phone the menus span the breadcrumb row instead of hanging off their crumb, so they cannot leave the screen. */
@media (max-width: 699px) {
  .crumb-wrap {
    position: static;
  }
  .menu {
    left: 0;
    right: 0;
    min-width: 0;
    max-width: none;
  }
  .item {
    white-space: normal;
  }
}
</style>
