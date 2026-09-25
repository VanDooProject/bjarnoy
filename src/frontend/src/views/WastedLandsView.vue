<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { MessageSchema } from "../i18n/schema";
import TopBar from "../components/hud/TopBar.vue";
import HudNav from "../components/hud/HudNav.vue";
import AtlasSprite from "../components/AtlasSprite.vue";
import WastedIsland from "../components/docs/WastedIsland.vue";
import { findAtlasFrame, type AtlasFrameRect } from "../lib/map/atlas";
import { TILE_ORIENTATIONS, type TileOrientation } from "../lib/map/types";

const { t } = useI18n<{ message: MessageSchema }>({ useScope: "global" });

function showcase(name: string): AtlasFrameRect | undefined {
  return findAtlasFrame("showcase", name);
}

// --- Giants -------------------------------------------------------------

const utgardCamera = ref<TileOrientation>("SE");
const volcanoCamera = ref<TileOrientation>("SE");

const utgardFrame = computed(() =>
  showcase(`giantutgard_${utgardCamera.value}_level000`),
);
const volcanoFrame = computed(() =>
  showcase(`giantvolcano_${volcanoCamera.value}_level000`),
);

// --- Living/wasted pairs -------------------------------------------------

type SimplePairKind =
  | "grass"
  | "forest"
  | "sand"
  | "mountain"
  | "coast"
  | "sea";

interface PairEntry {
  kind: SimplePairKind;
  livingFamily: string;
  wastedFamily: string;
  /** Wasted-tile variant suffixes (`''` for the plain look), in pill display order. */
  wastedSuffixes: string[];
  /** Mountain has no `_SE` suffix — its families already carry `_level000`. */
  level000?: boolean;
}

const PAIRS: PairEntry[] = [
  {
    kind: "grass",
    livingFamily: "grasstile",
    wastedFamily: "wasteland",
    wastedSuffixes: [
      "",
      "_variant001",
      "_variant002",
      "_variant003",
      "_variant004",
      "_variant005",
    ],
  },
  {
    kind: "forest",
    livingFamily: "foresttile",
    wastedFamily: "deadforest",
    wastedSuffixes: ["", "_variant001"],
  },
  {
    kind: "sand",
    livingFamily: "sandtile",
    wastedFamily: "blacksand",
    wastedSuffixes: ["", "_variant001"],
  },
  {
    kind: "mountain",
    livingFamily: "mountaintile",
    wastedFamily: "mountaintile_jagged",
    wastedSuffixes: [""],
    level000: true,
  },
  {
    kind: "coast",
    livingFamily: "coastalwatertile",
    wastedFamily: "blacksandcoast",
    wastedSuffixes: ["", "_variant000", "_variant001", "_variant002"],
  },
  {
    kind: "sea",
    livingFamily: "watertile",
    wastedFamily: "taintedwater",
    wastedSuffixes: [""],
  },
];

const variantIndex = reactive<Record<SimplePairKind, number>>({
  grass: 0,
  forest: 0,
  sand: 0,
  mountain: 0,
  coast: 0,
  sea: 0,
});

function pairLivingFrame(pair: PairEntry): AtlasFrameRect | undefined {
  return showcase(`${pair.livingFamily}_SE${pair.level000 ? "_level000" : ""}`);
}
function pairWastedFrame(pair: PairEntry): AtlasFrameRect | undefined {
  const suffix = pair.wastedSuffixes[variantIndex[pair.kind]] ?? "";
  return showcase(
    `${pair.wastedFamily}_SE${pair.level000 ? "_level000" : ""}${suffix}`,
  );
}

// The river/lava-stream row switches shape rather than variant, and both
// thumbnails at once (see `docs.wastedLands.lavaShapes`).
const RIVER_SHAPE_FAMILIES: Record<
  "straight" | "bend" | "bend60",
  { living: string; wasted: string }
> = {
  straight: { living: "rivertile", wasted: "lavastream" },
  bend: { living: "rivertile_bend", wasted: "lavastream_bend" },
  bend60: { living: "rivertile_bend60", wasted: "lavastream_bend60" },
};
const riverShape = ref<"straight" | "bend" | "bend60">("straight");
const riverLivingFrame = computed(() =>
  showcase(`${RIVER_SHAPE_FAMILIES[riverShape.value].living}_SE`),
);
const riverWastedFrame = computed(() =>
  showcase(`${RIVER_SHAPE_FAMILIES[riverShape.value].wasted}_SE`),
);
</script>

<template>
  <div class="wasted-lands">
    <TopBar
      docked
      :title="$t('docs.wastedLands.title')"
      caption="DOCS · WASTED LANDS"
    >
      <HudNav />
    </TopBar>
    <main class="body">
      <h1>{{ $t("docs.wastedLands.title") }}</h1>
      <p class="intro">{{ $t("docs.wastedLands.intro") }}</p>

      <section id="lore" class="lore-section">
        <h2>{{ $t("docs.wastedLands.lore.heading") }}</h2>
        <p class="saga">{{ $t("docs.wastedLands.lore.p1") }}</p>
        <p class="saga">{{ $t("docs.wastedLands.lore.p2") }}</p>
        <p class="saga">{{ $t("docs.wastedLands.lore.p3") }}</p>
        <p class="saga">{{ $t("docs.wastedLands.lore.p4") }}</p>
        <p class="caption-note">{{ $t("docs.wastedLands.lore.caption") }}</p>
      </section>

      <section id="giants" class="giants-section">
        <div class="giant-card">
          <h2>{{ $t("docs.wastedLands.utgard.heading") }}</h2>
          <p>{{ $t("docs.wastedLands.utgard.body") }}</p>
          <div class="giant-box">
            <AtlasSprite v-if="utgardFrame" :frame="utgardFrame" />
          </div>
          <div class="camera-pills">
            <span class="variants-label">{{
              $t("docs.wastedLands.utgard.camera")
            }}</span>
            <button
              v-for="cam in TILE_ORIENTATIONS"
              :key="cam"
              type="button"
              class="variant-button"
              :class="{ active: utgardCamera === cam }"
              @click="utgardCamera = cam"
            >
              {{ cam }}
            </button>
          </div>
        </div>

        <div class="giant-card">
          <h2>{{ $t("docs.wastedLands.volcano.heading") }}</h2>
          <p>{{ $t("docs.wastedLands.volcano.body") }}</p>
          <div class="giant-box">
            <AtlasSprite v-if="volcanoFrame" :frame="volcanoFrame" />
          </div>
          <div class="camera-pills">
            <span class="variants-label">{{
              $t("docs.wastedLands.utgard.camera")
            }}</span>
            <button
              v-for="cam in TILE_ORIENTATIONS"
              :key="cam"
              type="button"
              class="variant-button"
              :class="{ active: volcanoCamera === cam }"
              @click="volcanoCamera = cam"
            >
              {{ cam }}
            </button>
          </div>
        </div>
      </section>

      <section id="island" class="island-section">
        <h2>{{ $t("docs.wastedLands.island.heading") }}</h2>
        <p>{{ $t("docs.wastedLands.island.body") }}</p>
        <WastedIsland />
      </section>

      <section id="pairs" class="pairs-section">
        <h2>{{ $t("docs.wastedLands.pairs.heading") }}</h2>
        <p>{{ $t("docs.wastedLands.pairs.body") }}</p>

        <div
          v-for="pair in PAIRS.slice(0, 3)"
          :key="pair.kind"
          :id="`pair-${pair.kind}`"
          class="pair-row"
        >
          <div class="pair-thumbs">
            <div class="thumb-col">
              <span class="thumb-caption">{{
                $t("docs.wastedLands.pairs.living")
              }}</span>
              <div class="thumb">
                <AtlasSprite
                  v-if="pairLivingFrame(pair)"
                  :frame="pairLivingFrame(pair)!"
                />
              </div>
              <span class="thumb-name">{{
                t(`docs.wastedLands.tiles.${pair.kind}.living`)
              }}</span>
            </div>
            <span class="pair-arrow">→</span>
            <div class="thumb-col">
              <span class="thumb-caption">{{
                $t("docs.wastedLands.pairs.wasted")
              }}</span>
              <div class="thumb">
                <AtlasSprite
                  v-if="pairWastedFrame(pair)"
                  :frame="pairWastedFrame(pair)!"
                />
              </div>
              <span class="thumb-name">{{
                t(`docs.wastedLands.tiles.${pair.kind}.wasted`)
              }}</span>
            </div>
          </div>
          <p class="pair-lore">
            {{ t(`docs.wastedLands.tiles.${pair.kind}.lore`) }}
          </p>
          <div v-if="pair.wastedSuffixes.length > 1" class="variants">
            <span class="variants-label">{{
              $t("docs.wastedLands.pairs.looks")
            }}</span>
            <button
              v-for="(suffix, i) in pair.wastedSuffixes"
              :key="suffix"
              type="button"
              class="variant-button"
              :class="{ active: variantIndex[pair.kind] === i }"
              @click="variantIndex[pair.kind] = i"
            >
              {{ i + 1 }}
            </button>
          </div>
        </div>

        <div id="pair-mountain" class="pair-row">
          <div class="pair-thumbs">
            <div class="thumb-col">
              <span class="thumb-caption">{{
                $t("docs.wastedLands.pairs.living")
              }}</span>
              <div class="thumb">
                <AtlasSprite
                  v-if="pairLivingFrame(PAIRS[3]!)"
                  :frame="pairLivingFrame(PAIRS[3]!)!"
                />
              </div>
              <span class="thumb-name">{{
                t("docs.wastedLands.tiles.mountain.living")
              }}</span>
            </div>
            <span class="pair-arrow">→</span>
            <div class="thumb-col">
              <span class="thumb-caption">{{
                $t("docs.wastedLands.pairs.wasted")
              }}</span>
              <div class="thumb">
                <AtlasSprite
                  v-if="pairWastedFrame(PAIRS[3]!)"
                  :frame="pairWastedFrame(PAIRS[3]!)!"
                />
              </div>
              <span class="thumb-name">{{
                t("docs.wastedLands.tiles.mountain.wasted")
              }}</span>
            </div>
          </div>
          <p class="pair-lore">
            {{ t("docs.wastedLands.tiles.mountain.lore") }}
          </p>
        </div>

        <div id="pair-river" class="pair-row">
          <div class="pair-thumbs">
            <div class="thumb-col">
              <span class="thumb-caption">{{
                $t("docs.wastedLands.pairs.living")
              }}</span>
              <div class="thumb">
                <AtlasSprite
                  v-if="riverLivingFrame"
                  :frame="riverLivingFrame"
                />
              </div>
              <span class="thumb-name">{{
                t("docs.wastedLands.tiles.river.living")
              }}</span>
            </div>
            <span class="pair-arrow">→</span>
            <div class="thumb-col">
              <span class="thumb-caption">{{
                $t("docs.wastedLands.pairs.wasted")
              }}</span>
              <div class="thumb">
                <AtlasSprite
                  v-if="riverWastedFrame"
                  :frame="riverWastedFrame"
                />
              </div>
              <span class="thumb-name">{{
                t("docs.wastedLands.tiles.river.wasted")
              }}</span>
            </div>
          </div>
          <p class="pair-lore">{{ t("docs.wastedLands.tiles.river.lore") }}</p>
          <div class="variants">
            <span class="variants-label">{{
              $t("docs.wastedLands.pairs.looks")
            }}</span>
            <button
              v-for="shape in ['straight', 'bend', 'bend60'] as const"
              :key="shape"
              type="button"
              class="variant-button"
              :class="{ active: riverShape === shape }"
              @click="riverShape = shape"
            >
              {{ t(`docs.wastedLands.lavaShapes.${shape}`) }}
            </button>
          </div>
        </div>

        <div
          v-for="pair in PAIRS.slice(4)"
          :key="pair.kind"
          :id="`pair-${pair.kind}`"
          class="pair-row"
        >
          <div class="pair-thumbs">
            <div class="thumb-col">
              <span class="thumb-caption">{{
                $t("docs.wastedLands.pairs.living")
              }}</span>
              <div class="thumb">
                <AtlasSprite
                  v-if="pairLivingFrame(pair)"
                  :frame="pairLivingFrame(pair)!"
                />
              </div>
              <span class="thumb-name">{{
                t(`docs.wastedLands.tiles.${pair.kind}.living`)
              }}</span>
            </div>
            <span class="pair-arrow">→</span>
            <div class="thumb-col">
              <span class="thumb-caption">{{
                $t("docs.wastedLands.pairs.wasted")
              }}</span>
              <div class="thumb">
                <AtlasSprite
                  v-if="pairWastedFrame(pair)"
                  :frame="pairWastedFrame(pair)!"
                />
              </div>
              <span class="thumb-name">{{
                t(`docs.wastedLands.tiles.${pair.kind}.wasted`)
              }}</span>
            </div>
          </div>
          <p class="pair-lore">
            {{ t(`docs.wastedLands.tiles.${pair.kind}.lore`) }}
          </p>
          <div v-if="pair.wastedSuffixes.length > 1" class="variants">
            <span class="variants-label">{{
              $t("docs.wastedLands.pairs.looks")
            }}</span>
            <button
              v-for="(suffix, i) in pair.wastedSuffixes"
              :key="suffix"
              type="button"
              class="variant-button"
              :class="{ active: variantIndex[pair.kind] === i }"
              @click="variantIndex[pair.kind] = i"
            >
              {{ i + 1 }}
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.wasted-lands {
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
section {
  margin-top: 40px;
  scroll-margin-top: 84px;
}
h2 {
  margin: 0 0 12px;
}

.lore-section .saga {
  font-size: 15px;
  line-height: 1.7;
  border-left: 3px solid var(--gold);
  padding-left: 16px;
  margin: 0 0 14px;
  max-width: 68ch;
}
.caption-note {
  margin-top: 10px;
  font-size: 12px;
  font-style: italic;
  color: var(--muted-2, var(--muted));
}

.giants-section {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}
.giant-card {
  flex: 1 1 320px;
  min-width: 280px;
  padding: 18px 20px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel, #1c1710);
}
.giant-card p {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}
.giant-box {
  height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b1116;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  overflow: hidden;
  margin-bottom: 10px;
}
.camera-pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.pairs-section .pair-row {
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px solid var(--panel-border);
  scroll-margin-top: 84px;
}
.pair-row:first-of-type {
  border-top: none;
  padding-top: 0;
}
.pair-thumbs {
  display: flex;
  align-items: center;
  gap: 14px;
}
.thumb-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.thumb-caption {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120px;
  height: 150px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--panel, #1c1710);
  border: 1px solid var(--panel-border);
}
.thumb-name {
  font-size: 12px;
  color: var(--text);
}
.pair-arrow {
  font-size: 20px;
  color: var(--muted);
}
.pair-lore {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
  max-width: 60ch;
}
.variants,
.variants-label {
  display: flex;
}
.variants {
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 10px;
}
.variants-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-right: 4px;
  align-items: center;
}
.variant-button {
  background: var(--panel, #1c1710);
  border: 1px solid var(--panel-border);
  color: var(--muted);
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.variant-button:hover {
  color: var(--text);
  border-color: var(--gold);
}
.variant-button.active {
  color: #20160a;
  background: var(--gold);
  border-color: var(--gold);
}
</style>
