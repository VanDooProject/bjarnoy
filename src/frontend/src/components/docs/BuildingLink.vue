<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import AtlasSprite from '../AtlasSprite.vue';
import { useBuildingCatalogueStore } from '../../stores/buildingCatalogue';
import { useFirstMentions } from '../../composables/useFirstMentions';
import { buildingName, resourceName, terrainName } from '../../i18n/catalogueNames';
import type { MessageSchema } from '../../i18n/schema';
import { buildingArt, type ArtRef } from '../../lib/map/buildingArt';
import { maxLevelFor, type BuildingKind } from '../../lib/map/buildingEconomy';
import { graphCategoryOf } from '../../lib/techtree/buildingPresentation';

// A building named in docs text. Its first mention on a page (useFirstMentions)
// is a link to the building's section in the tech tree: a small tile icon, the
// name with a gold dotted underline, and a preview card on hover, keyboard
// focus or the first tap on a touch screen. Every later mention of the same
// building on the page is just its name.
const props = defineProps<{
  /** Building type key as in the building catalogue, e.g. `reindeerherder`. */
  type: string;
  /** Replaces the catalogue name, e.g. for a plural or a case ending. */
  label?: string;
}>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const catalogue = useBuildingCatalogueStore();

const owner = {};
const mentions = useFirstMentions();
const isFirst = mentions ? mentions.claim(props.type, owner) : true;
onBeforeUnmount(() => mentions?.release(props.type, owner));

const name = computed(() => props.label ?? buildingName(props.type));
const target = computed(() => ({ path: '/tech-tree', hash: `#${props.type}` }));

const maxLevel = computed(
  () => maxLevelFor(props.type as BuildingKind) || catalogue.byType[props.type]?.at(-1)?.level || 1,
);

/** The building at its highest level; none for a type the art pack has no picture of. */
const art = computed<ArtRef | undefined>(() => buildingArt(props.type, maxLevel.value));
const ratio = computed(() => (art.value?.kind === 'atlas' ? art.value.frame.frame.w / art.value.frame.frame.h : 2 / 3));
const iconStyle = (height: string) => ({ height, width: `calc(${height} * ${ratio.value})` });

/** "<resource/role> · levels 1–N · <ground>", from the catalogue; a part the catalogue has not loaded yet is left out. */
const meta = computed(() => {
  const parts: string[] = [];
  const levels = catalogue.byType[props.type];
  if (levels && levels.length > 0) {
    const top = levels[levels.length - 1]!;
    const produced = (['wood', 'stone', 'food', 'iron'] as const).filter((r) => top.productionPerHour[r] > 0);
    parts.push(
      produced.length > 0 && produced.length <= 2
        ? produced.map(resourceName).join(' / ')
        : t(`docs.techTree.categories.${graphCategoryOf(props.type)}`),
    );
  }
  parts.push(t('docs.buildingLink.levels', { max: maxLevel.value }));
  const first = levels?.[0];
  if (first) {
    parts.push(
      first.requiresCoastalWater
        ? t('docs.techTree.terrainCoastal')
        : first.allowedTerrain.length === 0
          ? t('docs.techTree.terrainAny')
          : first.allowedTerrain.map(terrainName).join(', '),
    );
  }
  return parts.join(' · ');
});

// --- Preview ---------------------------------------------------------------

const tipId = `building-tip-${useId()}`;
const rootEl = shallowRef<HTMLElement | null>(null);
const cardEl = shallowRef<HTMLElement | null>(null);
const open = ref(false);
const above = ref(false);
const position = ref<{ left: number; top: number } | null>(null);
/** The preview was opened by a tap: the next tap on the name follows the link. */
let armed = false;
let pointerType = 'mouse';

/**
 * The card is fixed to the viewport (a table's scroll box would clip it): under the name, clamped into the viewport,
 * above it when there is no room below. Runs again on scroll and resize, so the card stays with its name (focusing a
 * link scrolls it into view, which must not close the card).
 */
function place() {
  const root = rootEl.value;
  const card = cardEl.value;
  if (!root || !card) return;
  const r = root.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  above.value = r.bottom + h > window.innerHeight - 8 && r.top > h + 8;
  position.value = {
    left: Math.max(8, Math.min(r.left, vw - 8 - w)),
    top: above.value ? r.top - h : r.bottom,
  };
}

function close() {
  if (!open.value) return;
  open.value = false;
  armed = false;
  position.value = null;
  document.removeEventListener('pointerdown', onOutside, true);
  window.removeEventListener('scroll', place, true);
  window.removeEventListener('resize', place);
}

function onOutside(event: Event) {
  if (!rootEl.value?.contains(event.target as Node)) close();
}

async function show() {
  if (open.value) return;
  open.value = true;
  void catalogue.load();
  document.addEventListener('pointerdown', onOutside, true);
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', place);
  await nextTick();
  place();
}

onBeforeUnmount(close);

function onFocusOut(event: FocusEvent) {
  if (!rootEl.value?.contains(event.relatedTarget as Node | null)) close();
}

function onClick(event: MouseEvent) {
  // Runs in the capture phase, ahead of the router's own click handler. A tap first opens the preview; the link
  // in the preview (or a second tap on the name) navigates.
  if (pointerType === 'touch' && !armed) {
    event.preventDefault();
    armed = true;
    void show();
  }
}
</script>

<template>
  <span v-if="!isFirst" class="building-name" data-building-link="plain">{{ name }}</span>
  <span
    v-else
    ref="rootEl"
    class="building-link"
    data-building-link="link"
    :data-type="type"
    @mouseenter="show"
    @mouseleave="close"
    @focusin="show"
    @focusout="onFocusOut"
    @keydown.esc="close"
  >
    <RouterLink
      :to="target"
      class="link"
      :aria-describedby="open ? tipId : undefined"
      @pointerdown="pointerType = ($event as PointerEvent).pointerType"
      @click.capture="onClick"
    >
      <span v-if="art" class="icon" :style="iconStyle('1.25em')" aria-hidden="true">
        <AtlasSprite v-if="art.kind === 'atlas'" :frame="art.frame" />
        <img v-else :src="art.url" alt="" />
      </span>
      <span class="label">{{ name }}</span>
    </RouterLink>
    <span
      v-if="open"
      :id="tipId"
      ref="cardEl"
      role="tooltip"
      class="preview"
      :class="{ above }"
      :style="position ? { left: `${position.left}px`, top: `${position.top}px` } : { left: '0', top: '0', visibility: 'hidden' }"
    >
      <span class="card">
        <span class="head">
          <span v-if="art" class="big-icon" :style="iconStyle('44px')" aria-hidden="true">
            <AtlasSprite v-if="art.kind === 'atlas'" :frame="art.frame" />
            <img v-else :src="art.url" alt="" />
          </span>
          <span class="text">
            <strong class="title">{{ name }}</strong>
            <span class="meta">{{ meta }}</span>
          </span>
        </span>
        <RouterLink :to="target" class="cta">{{ t('docs.buildingLink.cta') }}</RouterLink>
      </span>
    </span>
  </span>
</template>

<style scoped>
.building-link {
  display: inline-block;
  white-space: nowrap;
}
.link {
  color: inherit;
  white-space: nowrap;
  text-decoration: underline dotted color-mix(in srgb, var(--gold) 75%, transparent);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
}
.link:hover,
.link:focus-visible {
  color: var(--gold);
  text-decoration-style: solid;
}
.link:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
  border-radius: 3px;
}
.icon {
  display: inline-block;
  vertical-align: -0.3em;
  margin-right: 0.25em;
  text-decoration: none;
}
.icon :deep(.atlas-sprite),
.big-icon :deep(.atlas-sprite),
.icon img,
.big-icon img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.preview {
  position: fixed;
  z-index: 60;
  box-sizing: border-box;
  width: min(260px, calc(100vw - 16px));
  padding-top: 6px;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
  text-align: left;
  white-space: normal;
}
.preview.above {
  padding-top: 0;
  padding-bottom: 6px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--gold);
  border-radius: 10px;
  background: var(--panel, #1c1710);
  color: var(--text);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.55);
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.big-icon {
  flex: none;
  display: block;
  filter: drop-shadow(0 4px 5px rgba(0, 0, 0, 0.5));
}
.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.title {
  font-size: 15px;
  font-weight: 700;
}
.meta {
  color: var(--muted);
  font-size: 12px;
}
.cta {
  color: var(--gold);
  font-size: 12px;
  text-decoration: none;
}
.cta:hover,
.cta:focus-visible {
  text-decoration: underline;
}
</style>
