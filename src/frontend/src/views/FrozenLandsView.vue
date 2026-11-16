<script setup lang="ts">
import { reactive } from "vue";
import DocsPageLayout from "../components/docs/DocsPageLayout.vue";
import DocsAdminNote from "../components/docs/DocsAdminNote.vue";
import AtlasSprite from "../components/AtlasSprite.vue";
import { findAtlasFrame, type AtlasFrameRect } from "../lib/map/atlas";
import { FROZEN_FAMILIES as FAMILIES, type FrozenFamily as Family } from "../lib/docs/frozenLands";

const selected = reactive<Record<string, number>>(
  Object.fromEntries(FAMILIES.map((f) => [f.id, 0])),
);

const THUMB_BOX_H = 148;

function frameOf(family: Family): AtlasFrameRect | undefined {
  return findAtlasFrame("showcase", family.looks[selected[family.id]!]!.frame);
}
// AtlasSprite keeps the frame's aspect ratio; capping the width contains a frame taller than the box.
function fit(frame: AtlasFrameRect): { width: string } {
  return { width: `min(100%, ${(THUMB_BOX_H * frame.frame.w) / frame.frame.h}px)` };
}
</script>

<template>
  <DocsPageLayout
    class="frozen-lands"
    :title="$t('docs.frozenLands.title')"
    caption="DOCS · FROZEN LANDS"
    :intro="$t('docs.frozenLands.intro')"
  >
    <DocsAdminNote>{{ $t("docs.frozenLands.techNote") }}</DocsAdminNote>

    <section id="tiles">
      <h2>{{ $t("docs.frozenLands.tiles.heading") }}</h2>
      <p>{{ $t("docs.frozenLands.tiles.body") }}</p>
      <div class="families">
        <article
          v-for="family in FAMILIES"
          :key="family.id"
          :id="`family-${family.id}`"
          class="family"
        >
          <div class="thumb floating-art">
            <span class="floating-art-shadow" aria-hidden="true" />
            <AtlasSprite
              v-if="frameOf(family)"
              :frame="frameOf(family)!"
              :style="fit(frameOf(family)!)"
            />
          </div>
          <h3>{{ $t(`docs.frozenLands.tiles.families.${family.id}.name`) }}</h3>
          <p>{{ $t(`docs.frozenLands.tiles.families.${family.id}.body`) }}</p>
          <div v-if="family.looks.length > 1" class="variants">
            <span class="variants-label">{{ $t("docs.frozenLands.tiles.looks") }}</span>
            <button
              v-for="(look, i) in family.looks"
              :key="look.frame"
              type="button"
              class="variant-button"
              :class="{ active: selected[family.id] === i }"
              @click="selected[family.id] = i"
            >
              {{
                look.labelKey
                  ? $t(`docs.frozenLands.tiles.looksNames.${look.labelKey}`)
                  : i + 1
              }}
            </button>
          </div>
        </article>
      </div>
    </section>
  </DocsPageLayout>
</template>

<style scoped>
section {
  margin-top: 40px;
  scroll-margin-top: 84px;
}
h2 {
  margin: 0 0 12px;
}
.families {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  margin-top: 16px;
}
.family {
  padding: 18px 20px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel, #1c1710);
}
.family h3 {
  margin: 10px 0 4px;
}
.family p {
  margin: 0 0 10px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}
.thumb {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b1116;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}
.variants {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}
.variants-label {
  font-size: 12px;
  color: var(--muted);
}
.variant-button {
  min-width: 28px;
  padding: 3px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.variant-button.active {
  border-color: var(--gold);
  color: var(--gold);
}
</style>
