<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import WorldMapCanvas from '../components/map/WorldMapCanvas.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import ResourceBar from '../components/hud/ResourceBar.vue';
import NicknamePrompt from '../components/onboarding/NicknamePrompt.vue';
import { useWorldStore } from '../stores/world';
import { usePlayerStore } from '../stores/player';
import { DEMO_MODE } from '../config';
import type { AxialCoord } from '../lib/hex/coords';
import type { Tile } from '../lib/map/types';

const world = useWorldStore();
const player = usePlayerStore();
const router = useRouter();

const showPrompt = ref(false);
const founding = ref(false);

onMounted(() => {
  void world.bootstrapLiveWorld();
  if (player.hasFoundedSettlement) world.startHudSync();
});
onUnmounted(() => world.stopHudSync());

// zip 4: first interaction is a real game move (place a building / drop
// a wall), not a form. Clicking a hex before an account exists founds the
// player's starter settlement right there — the nickname prompt (if it
// appears at all) comes *after*, never as a wall in front of the map.
async function onHexClick(coord: AxialCoord, tile: Tile) {
  if (player.hasFoundedSettlement) {
    router.push('/settlement');
    return;
  }
  if (tile.terrain === 'sea' || founding.value) return;

  if (DEMO_MODE) {
    const settlement = world.foundStartingSettlement(player.id, player.nickname ?? 'Unnamed realm', coord);
    player.foundSettlement(settlement.id);
    world.startHudSync();
    showPrompt.value = true;
    return;
  }

  founding.value = true;
  try {
    const realmName = player.nickname ? `${player.nickname}'s realm` : 'Unnamed realm';
    const settlement = await world.foundStartingSettlementLive(player.ownerName, realmName, coord);
    player.foundSettlement(settlement.id);
    world.startHudSync();
    showPrompt.value = true;
  } catch (err) {
    console.error('Failed to found settlement against the backend', err);
  } finally {
    founding.value = false;
  }
}

function closePrompt() {
  showPrompt.value = false;
  router.push('/settlement');
}
</script>

<template>
  <div class="world-view">
    <WorldMapCanvas :world-model="world.model" :player-id="player.id" @hex-click="onHexClick" />
    <TopBar />
    <HudNav />
    <ResourceBar v-if="player.hasFoundedSettlement" />
    <div v-if="!player.hasFoundedSettlement" class="hint panel">
      <p v-if="founding">Making landfall…</p>
      <p v-else>The world is already moving. <strong>Click any green island</strong> to make landfall — no sign-up needed yet.</p>
    </div>
    <NicknamePrompt v-if="showPrompt" @close="closePrompt" />
  </div>
</template>

<style scoped>
.world-view {
  position: relative;
  width: 100vw;
  height: 100vh;
}
.hint {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  padding: 10px 20px;
  max-width: min(520px, 90vw);
}
.hint p {
  margin: 0;
  font-size: 14px;
  color: var(--muted);
  text-align: center;
}
.hint strong {
  color: var(--gold);
}
</style>
