<script setup lang="ts">
// zip 9: "Hex interaction | Hover = stats tooltip · Click = full-screen
// building screen" — this is the click half. Replaces the old
// instant-build-on-click in SettlementView.vue with the mockup's full-screen
// hex detail screen (Viking Realm.dc.html's `sel` overlay): art on the left,
// name/level/description/action on the right.
import { computed } from 'vue';
import type { Tile } from '../../lib/map/types';

import hutUrl from '../../../vendor/bg_assets_hextile/hextiles/vikinghut_SE_level000.png';
import farmUrl from '../../../vendor/bg_assets_hextile/hextiles/farm_crop_SE_level001.png';
import towerUrl from '../../../vendor/bg_assets_hextile/hextiles/towerbuilding_SE_level000.png';
import longhouseUrl from '../../../vendor/bg_assets_hextile/hextiles/vikinghut_SE_level004.png';
import grassUrl from '../../../vendor/bg_assets_hextile/hextiles/grasstile_SE.png';
import forestUrl from '../../../vendor/bg_assets_hextile/hextiles/foresttile_SE.png';
import mountainUrl from '../../../vendor/bg_assets_hextile/hextiles/mountaintile_SE.png';
import sandUrl from '../../../vendor/bg_assets_hextile/hextiles/sandtile_SE.png';

const props = defineProps<{
  tile: Tile;
  mine: boolean;
  ownerLabel: string | null;
  busy: boolean;
}>();
const emit = defineEmits<{ close: []; build: []; upgrade: [] }>();

const ART: Record<string, string> = {
  hut: hutUrl,
  farm: farmUrl,
  tower: towerUrl,
  longhouse: longhouseUrl,
  grass: grassUrl,
  forest: forestUrl,
  mountain: mountainUrl,
  sand: sandUrl,
};

const BUILDING_NAMES: Record<string, string> = {
  hut: 'Hut',
  farm: 'Farm',
  tower: 'Watchtower',
  longhouse: 'Longhouse',
};

const TERRAIN_NAMES: Record<string, string> = {
  grass: 'Grassland',
  forest: 'Forest',
  mountain: 'Mountain',
  sand: 'Shore',
  sea: 'Open water',
};

const art = computed(() => ART[props.tile.buildingType ?? props.tile.terrain] ?? grassUrl);
const buildable = computed(() => props.tile.terrain !== 'sea');

const name = computed(() =>
  props.tile.buildingType ? BUILDING_NAMES[props.tile.buildingType] : TERRAIN_NAMES[props.tile.terrain],
);
const sub = computed(() => {
  if (!props.tile.buildingType) return props.mine ? 'Empty, claimed ground' : (props.ownerLabel ?? 'Unclaimed');
  return props.ownerLabel ?? 'Wild ruin';
});
const level = computed(() => props.tile.buildingLevel ?? 0);
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="modal panel">
      <div class="art">
        <img :src="art" alt="" />
        <span class="coord">Hex {{ tile.q }}, {{ tile.r }}</span>
      </div>
      <div class="body">
        <div class="head">
          <div>
            <div class="name">{{ name }}</div>
            <div class="sub">{{ level > 0 ? `Level ${level} · ${sub}` : sub }}</div>
          </div>
          <button class="close" @click="emit('close')">✕</button>
        </div>

        <p v-if="!mine && tile.buildingType" class="desc">
          Held by another jarl. You cannot build or upgrade here.
        </p>
        <p v-else-if="!mine" class="desc">Outside your realm's border — claim more land to build here.</p>
        <p v-else-if="!buildable" class="desc">Open water. No building can stand here.</p>
        <p v-else class="desc">
          {{
            tile.buildingType
              ? 'Raise this building further to grow what it produces for your settlement.'
              : 'Empty ground inside your border. Raise a building here to put it to work.'
          }}
        </p>

        <div v-if="mine && buildable" class="actions">
          <button v-if="tile.buildingType" class="primary" :disabled="busy" @click="emit('upgrade')">
            {{ busy ? 'Queuing…' : `Upgrade to level ${level + 1}` }}
          </button>
          <button v-else class="primary" :disabled="busy" @click="emit('build')">
            {{ busy ? 'Queuing…' : 'Build here' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: rgba(6, 12, 17, 0.86);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  width: 720px;
  max-width: 94vw;
  display: flex;
  overflow: hidden;
}
.art {
  width: 280px;
  flex: none;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(90% 70% at 50% 45%, #1a3d4d 0%, #0d1f29 100%);
}
.art img {
  width: 70%;
  image-rendering: -webkit-optimize-contrast;
}
.coord {
  position: absolute;
  left: 16px;
  top: 16px;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
.body {
  flex: 1;
  padding: 22px 26px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.name {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
}
.sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--muted);
}
.close {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 7px;
  color: var(--muted);
  cursor: pointer;
}
.close:hover {
  color: var(--text);
  border-color: var(--gold);
}
.desc {
  margin: 16px 0 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--muted);
  max-width: 380px;
}
.actions {
  margin-top: 22px;
}
.primary {
  padding: 12px 22px;
  background: var(--gold);
  border: none;
  border-radius: 8px;
  color: #20160a;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.03em;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
