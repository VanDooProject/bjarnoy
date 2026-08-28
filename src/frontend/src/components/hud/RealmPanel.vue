<script setup lang="ts">
import { computed } from 'vue';
import { useWorldStore } from '../../stores/world';
import { useRouter } from 'vue-router';

const world = useWorldStore();
const router = useRouter();

const props = defineProps<{
  // Issue #16 "ring menu": this panel's own "← World map" button sits below
  // the ring's full-screen backdrop (z-index 30 vs. this panel's 10), so
  // it's already unreachable while a ring is open — same layering the
  // header nav bug came from. Rather than raise it above the backdrop like
  // the header (this panel isn't primary nav), it's shown visibly disabled
  // instead, so it doesn't look clickable when it isn't.
  ringOpen?: boolean;
}>();

const settlement = computed(() =>
  world.selectedSettlementId ? world.model.getSettlement(world.selectedSettlementId) : undefined,
);
const claimedHexes = computed(() =>
  settlement.value ? world.model.borderRadius(settlement.value) : 0,
);
</script>

<template>
  <div v-if="settlement" class="realm-panel panel" :class="{ disabled: props.ringOpen }">
    <div class="title">
      <span class="name">{{ settlement.name }}</span>
      <span class="level pill">Lv {{ settlement.level }}</span>
    </div>
    <p class="sub">Longhouse claims a border-{{ claimedHexes }} realm</p>
    <button class="back" :disabled="props.ringOpen" @click="router.push('/world')">← World map</button>
  </div>
</template>

<style scoped>
.realm-panel {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 10;
  padding: 14px 18px;
  min-width: 220px;
  transition: opacity 0.15s ease;
}
.realm-panel.disabled {
  opacity: 0.35;
  filter: grayscale(0.7);
  pointer-events: none;
}
.realm-panel.disabled .level {
  background: var(--muted);
  color: #1a1a1a;
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.name {
  font-weight: 600;
  font-size: 16px;
  color: var(--text);
}
.level {
  font-size: 12px;
  font-weight: 600;
  color: #20160a;
  background: var(--gold);
  padding: 2px 9px;
}
.sub {
  margin: 6px 0 12px;
  font-size: 13px;
  color: var(--muted);
}
.back {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.back:hover {
  border-color: var(--gold);
  color: var(--gold);
}
</style>
