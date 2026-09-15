<script setup lang="ts">
// Content for the mobile-only pull-down drawer (see TopBar.vue's `drawer`
// slot / composables/useHudDrawer.ts). Two things that don't fit in the
// collapsed compact bar: the full resource detail (stock + rate + max +
// fill bar, same numbers/markup shape as the desktop ResourceBar) and the
// nav links HudNav shows inline on desktop but has no room for on mobile.
// Mirrors HudNav.vue's own link list/visibility rules rather than importing
// HudNav itself — HudNav is desktop chrome living inside the collapsed bar
// (out of scope to restructure here), this is a second, mobile-only surface
// for the same destinations.
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useAuthStore } from '../../stores/auth';
import { usePlayerStore } from '../../stores/player';
import { useReportsStore } from '../../stores/reports';
import type { MessageSchema } from '../../i18n/schema';

const emit = defineEmits<{ close: [] }>();

const route = useRoute();
const router = useRouter();
const world = useWorldStore();
const auth = useAuthStore();
const player = usePlayerStore();
const reports = useReportsStore();
const { t, n } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const pills = computed(() => [
  { key: 'wood', color: 'var(--wood)', value: world.hud.resources.wood, rate: world.hud.rates.wood, cap: world.hud.storageCap.wood, reserved: world.hud.reserved.wood },
  { key: 'stone', color: 'var(--stone)', value: world.hud.resources.stone, rate: world.hud.rates.stone, cap: world.hud.storageCap.stone, reserved: world.hud.reserved.stone },
  { key: 'food', color: 'var(--food)', value: world.hud.resources.food, rate: world.hud.rates.food, cap: world.hud.storageCap.food, reserved: world.hud.reserved.food },
  { key: 'iron', color: 'var(--iron)', value: world.hud.resources.iron, rate: world.hud.rates.iron, cap: world.hud.storageCap.iron, reserved: world.hud.reserved.iron },
]);
const population = computed(() => world.hud.population);

function fmt(value: number): string {
  return n(Math.floor(value), 'integer');
}
function fillPct(value: number, cap: number): number {
  return cap > 0 ? Math.min(100, Math.max(0, (value / cap) * 100)) : 0;
}

function go(path: string) {
  router.push(path);
  emit('close');
}
</script>

<template>
  <div class="drawer-body">
    <div class="drawer-resources">
      <div v-for="pill in pills" :key="pill.key" class="drawer-resource">
        <span class="hex-icon" :style="{ background: pill.color }" />
        <div class="numbers">
          <span class="value">
            {{ fmt(pill.value) }}<span class="cap">{{ t('hud.resourceBar.capSuffix', { n: fmt(pill.cap) }) }}</span>
            <span v-if="pill.reserved > 0" class="reserved-hint">{{ t('hud.resourceBar.reserved', { n: fmt(pill.reserved) }) }}</span>
          </span>
          <span class="rate">{{ t('hud.resourceBar.rate', { n: Math.round(pill.rate) }) }}</span>
          <span class="fill-track">
            <span class="fill" :style="{ width: fillPct(pill.value, pill.cap) + '%', background: pill.color }" />
          </span>
        </div>
      </div>
      <div v-if="population.max > 0" class="drawer-resource">
        <span class="hex-icon" style="background: var(--pop, #7fb3d5)" />
        <div class="numbers">
          <span class="value">{{ fmt(population.current) }}<span class="cap">{{ t('hud.resourceBar.capSuffix', { n: fmt(population.max) }) }}</span></span>
          <span class="rate">{{ t('hud.resourceBar.rate', { n: Math.round(population.rate) }) }}</span>
          <span class="fill-track"><span class="fill" :style="{ width: fillPct(population.current, population.max) + '%', background: 'var(--pop, #7fb3d5)' }" /></span>
        </div>
      </div>
    </div>

    <nav class="drawer-links">
      <button v-if="player.hasFoundedSettlement" class="link" :class="{ active: route.name === 'settlement' }" @click="go('/settlement')">
        {{ t('hud.nav.settlement') }}
      </button>
      <button
        v-if="auth.isAuthenticated && player.hasFoundedSettlement"
        class="link"
        :class="{ active: route.name === 'world' }"
        @click="go('/world')"
      >
        {{ t('hud.nav.worldMap') }}
      </button>
      <button v-if="auth.isAuthenticated" class="link" :class="{ active: route.name === 'leaderboards' }" @click="go('/leaderboards')">
        {{ t('hud.nav.leaderboards') }}
      </button>
      <button
        v-if="auth.isAuthenticated"
        class="link"
        :class="{ active: ['messages', 'conversation'].includes(String(route.name)) }"
        @click="go('/messages')"
      >
        {{ t('hud.nav.messages') }}
      </button>
      <button class="link" :class="{ active: String(route.name).startsWith('report') }" @click="go('/reports')">
        {{ t('hud.nav.reports') }}
        <span v-if="reports.unreadCount > 0" class="badge">{{ reports.unreadCount }}</span>
      </button>
      <button class="link" :class="{ active: route.name === 'guild' }" @click="go('/guild')">
        {{ t('hud.nav.alliance') }}
      </button>
      <button class="link" :class="{ active: ['docs', 'tech-tree', 'tile-docs'].includes(String(route.name)) }" @click="go('/docs')">
        {{ t('hud.nav.docs') }}
      </button>
    </nav>
  </div>
</template>

<style scoped>
.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.drawer-resources {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.drawer-resource {
  display: flex;
  align-items: center;
  gap: 10px;
}
.hex-icon {
  width: 14px;
  height: 14px;
  flex: none;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
}
.numbers {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.value {
  font-weight: 600;
  font-size: 14px;
  color: var(--text);
}
.cap {
  font-weight: 400;
  color: var(--muted);
}
.rate {
  font-size: 11px;
  color: var(--food);
}
.reserved-hint {
  margin-left: 4px;
  font-weight: 400;
  font-size: 11px;
  color: var(--muted);
}
.fill-track {
  position: relative;
  margin-top: 3px;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  border-radius: 2px;
}
.drawer-links {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-top: 1px solid var(--panel-border);
  padding-top: 10px;
}
.link {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--muted);
  padding: 10px 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-align: left;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}
.link.active {
  color: var(--gold);
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  border-radius: 8px;
  background: #e08a8a;
  color: #20160a;
  font-size: 10px;
  font-weight: 800;
}
</style>
